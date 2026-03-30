import { WebPartContext } from "@microsoft/sp-webpart-base";
import { SPHttpClient, SPHttpClientResponse } from "@microsoft/sp-http";
import { HttpClient, HttpClientResponse } from "@microsoft/sp-http";

/**
 * Represents a single search result returned from the Knowledge Hub search.
 */
export interface ISearchResult {
  id: string;
  title: string;
  description: string;
  url: string;
  author: string;
  lastModified: string;
  category: string;
  contentType: string;
  viewCount: number;
  hitHighlightedSummary: string;
  thumbnailUrl: string;
  fileExtension: string;
}

/**
 * Refiner value with label and count for faceted navigation.
 */
export interface IRefinerValue {
  value: string;
  token: string;
  count: number;
}

/**
 * A named refiner containing its possible values.
 */
export interface IRefiner {
  name: string;
  values: IRefinerValue[];
}

/**
 * Paginated search response with results, refiners, and metadata.
 */
export interface ISearchResponse {
  results: ISearchResult[];
  totalRows: number;
  refiners: IRefiner[];
  spellingSuggestion: string;
  queryId: string;
}

/**
 * Search suggestion returned from the suggestions endpoint.
 */
export interface ISearchSuggestion {
  query: string;
  isPersonal: boolean;
}

/**
 * Configuration for refiner filters applied to a search query.
 */
export interface IRefinerFilter {
  name: string;
  values: string[];
}

/**
 * Sort order options.
 */
export type SortDirection = "ascending" | "descending";

export interface ISortOption {
  property: string;
  direction: SortDirection;
}

/**
 * In-memory cache entry with expiry tracking.
 */
interface ICacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * SearchService provides a unified interface to Microsoft Graph Search API
 * and SharePoint Search REST API for querying the Knowledge Hub.
 *
 * Features:
 * - Full-text search with refiners and pagination
 * - Trending/popular article retrieval
 * - Recent articles feed
 * - Typeahead search suggestions
 * - In-memory caching with configurable TTL
 */
export class SearchService {
  private context: WebPartContext;
  private cache: Map<string, ICacheEntry<unknown>> = new Map();
  private static readonly DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private static readonly SEARCH_API_URL = "/_api/search/query";
  private static readonly SUGGEST_API_URL = "/_api/search/suggest";

  constructor(context: WebPartContext) {
    this.context = context;
  }

  /**
   * Search knowledge articles using SharePoint Search REST API with support
   * for refiners, pagination, sorting, and hit highlighting.
   *
   * @param query - The search query string.
   * @param refiners - Optional array of refiner filters to apply.
   * @param page - The one-based page number (default 1).
   * @param pageSize - Number of results per page (default 10).
   * @param sort - Optional sort configuration.
   * @returns Paginated search results with refiners and metadata.
   */
  public async searchArticles(
    query: string,
    refiners?: IRefinerFilter[],
    page: number = 1,
    pageSize: number = 10,
    sort?: ISortOption
  ): Promise<ISearchResponse> {
    const cacheKey = `search_${query}_${JSON.stringify(refiners)}_${page}_${pageSize}_${JSON.stringify(sort)}`;
    const cached = this.getFromCache<ISearchResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const startRow = (page - 1) * pageSize;
    let queryText = `${query} contenttype:KnowledgeArticle OR contenttype:FAQItem OR contenttype:PolicyDocument`;

    // Build refinement filters string
    let refinementFilters = "";
    if (refiners && refiners.length > 0) {
      const filters = refiners.map((r) => {
        const vals = r.values.map((v) => `"${v}"`).join(",");
        return `${r.name}:or(${vals})`;
      });
      refinementFilters = filters.join(",");
    }

    // Build sort list
    let sortList = "";
    if (sort) {
      const dir = sort.direction === "ascending" ? 0 : 1;
      sortList = `'${sort.property}:${dir}'`;
    }

    const searchUrl =
      `${this.context.pageContext.web.absoluteUrl}${SearchService.SEARCH_API_URL}` +
      `?querytext='${encodeURIComponent(queryText)}'` +
      `&startrow=${startRow}` +
      `&rowlimit=${pageSize}` +
      `&selectproperties='Title,Path,Description,AuthorOWSUSER,LastModifiedTime,owstaxIdCategory,ContentType,ViewsLifeTime,HitHighlightedSummary,PictureThumbnailURL,FileExtension'` +
      `&refiners='Category,Department,ContentType,LastModifiedTime'` +
      `&enablequeryrules=true` +
      `&trimduplicates=true` +
      `&enableinterleaving=true` +
      (refinementFilters ? `&refinementfilters='${encodeURIComponent(refinementFilters)}'` : "") +
      (sortList ? `&sortlist=${sortList}` : "");

    try {
      const response: SPHttpClientResponse = await this.context.spHttpClient.get(
        searchUrl,
        SPHttpClient.configurations.v1
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Search API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const primaryResults = data.PrimaryQueryResult;
      const relevantResults = primaryResults?.RelevantResults;

      const results: ISearchResult[] = this.mapSearchResults(
        relevantResults?.Table?.Rows || []
      );

      const parsedRefiners: IRefiner[] = this.mapRefiners(
        primaryResults?.RefinementResults?.Refiners || []
      );

      const searchResponse: ISearchResponse = {
        results,
        totalRows: relevantResults?.TotalRows || 0,
        refiners: parsedRefiners,
        spellingSuggestion: data.SpellingSuggestion || "",
        queryId: relevantResults?.QueryId || "",
      };

      this.setCache(cacheKey, searchResponse);
      return searchResponse;
    } catch (error) {
      console.error("[SearchService] searchArticles failed:", error);
      throw error;
    }
  }

  /**
   * Retrieve popular/trending articles based on lifetime view count.
   *
   * @param count - Number of articles to return (default 10).
   * @returns Array of search results sorted by view count descending.
   */
  public async getPopularArticles(count: number = 10): Promise<ISearchResult[]> {
    const cacheKey = `popular_${count}`;
    const cached = this.getFromCache<ISearchResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const searchUrl =
      `${this.context.pageContext.web.absoluteUrl}${SearchService.SEARCH_API_URL}` +
      `?querytext='contenttype:KnowledgeArticle'` +
      `&rowlimit=${count}` +
      `&selectproperties='Title,Path,Description,AuthorOWSUSER,LastModifiedTime,owstaxIdCategory,ViewsLifeTime,PictureThumbnailURL'` +
      `&sortlist='ViewsLifeTime:descending'` +
      `&trimduplicates=true`;

    try {
      const response: SPHttpClientResponse = await this.context.spHttpClient.get(
        searchUrl,
        SPHttpClient.configurations.v1
      );

      if (!response.ok) {
        throw new Error(`Popular articles request failed with status ${response.status}`);
      }

      const data = await response.json();
      const rows = data.PrimaryQueryResult?.RelevantResults?.Table?.Rows || [];
      const results = this.mapSearchResults(rows);

      this.setCache(cacheKey, results, 10 * 60 * 1000); // cache 10 min
      return results;
    } catch (error) {
      console.error("[SearchService] getPopularArticles failed:", error);
      throw error;
    }
  }

  /**
   * Retrieve recently modified articles.
   *
   * @param count - Number of articles to return (default 10).
   * @returns Array of search results sorted by last modified descending.
   */
  public async getRecentArticles(count: number = 10): Promise<ISearchResult[]> {
    const cacheKey = `recent_${count}`;
    const cached = this.getFromCache<ISearchResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const searchUrl =
      `${this.context.pageContext.web.absoluteUrl}${SearchService.SEARCH_API_URL}` +
      `?querytext='contenttype:KnowledgeArticle OR contenttype:FAQItem OR contenttype:PolicyDocument'` +
      `&rowlimit=${count}` +
      `&selectproperties='Title,Path,Description,AuthorOWSUSER,LastModifiedTime,owstaxIdCategory,ContentType,ViewsLifeTime,PictureThumbnailURL'` +
      `&sortlist='LastModifiedTime:descending'` +
      `&trimduplicates=true`;

    try {
      const response: SPHttpClientResponse = await this.context.spHttpClient.get(
        searchUrl,
        SPHttpClient.configurations.v1
      );

      if (!response.ok) {
        throw new Error(`Recent articles request failed with status ${response.status}`);
      }

      const data = await response.json();
      const rows = data.PrimaryQueryResult?.RelevantResults?.Table?.Rows || [];
      const results = this.mapSearchResults(rows);

      this.setCache(cacheKey, results, 2 * 60 * 1000); // cache 2 min
      return results;
    } catch (error) {
      console.error("[SearchService] getRecentArticles failed:", error);
      throw error;
    }
  }

  /**
   * Get typeahead search suggestions as the user types.
   *
   * @param query - Partial query string (minimum 3 characters).
   * @returns Array of suggested queries.
   */
  public async getSuggestions(query: string): Promise<ISearchSuggestion[]> {
    if (!query || query.length < 3) {
      return [];
    }

    const cacheKey = `suggest_${query}`;
    const cached = this.getFromCache<ISearchSuggestion[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const suggestUrl =
      `${this.context.pageContext.web.absoluteUrl}${SearchService.SUGGEST_API_URL}` +
      `?querytext='${encodeURIComponent(query)}'` +
      `&fprequerysuggestions=true` +
      `&fhithighlighting=true` +
      `&isnumberofquerysuggestions=5`;

    try {
      const response: SPHttpClientResponse = await this.context.spHttpClient.get(
        suggestUrl,
        SPHttpClient.configurations.v1
      );

      if (!response.ok) {
        throw new Error(`Suggestions request failed with status ${response.status}`);
      }

      const data = await response.json();
      const queries = data.Queries || [];
      const personalResults = data.PersonalResults || [];

      const suggestions: ISearchSuggestion[] = [
        ...queries.map((q: { Query: string }) => ({
          query: q.Query,
          isPersonal: false,
        })),
        ...personalResults.map((p: { Title: string }) => ({
          query: p.Title,
          isPersonal: true,
        })),
      ];

      this.setCache(cacheKey, suggestions, 60 * 1000); // cache 1 min
      return suggestions;
    } catch (error) {
      console.error("[SearchService] getSuggestions failed:", error);
      return [];
    }
  }

  /**
   * Search using Microsoft Graph Search API for cross-tenant scenarios.
   *
   * @param query - The search query.
   * @param entityTypes - Entity types to search (default: ["listItem", "driveItem"]).
   * @param from - Start index for pagination.
   * @param size - Page size.
   * @returns Search results from Graph API.
   */
  public async searchViaGraph(
    query: string,
    entityTypes: string[] = ["listItem", "driveItem"],
    from: number = 0,
    size: number = 10
  ): Promise<ISearchResult[]> {
    const graphEndpoint = "https://graph.microsoft.com/v1.0/search/query";
    const requestBody = {
      requests: [
        {
          entityTypes,
          query: { queryString: query },
          from,
          size,
          fields: [
            "title",
            "description",
            "lastModifiedDateTime",
            "createdBy",
            "webUrl",
          ],
        },
      ],
    };

    try {
      const response: HttpClientResponse = await this.context.httpClient.post(
        graphEndpoint,
        HttpClient.configurations.v1,
        {
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Graph search failed with status ${response.status}`);
      }

      const data = await response.json();
      const hitsContainers = data.value?.[0]?.hitsContainers || [];
      const hits = hitsContainers[0]?.hits || [];

      return hits.map(
        (hit: {
          hitId: string;
          summary: string;
          resource: {
            name: string;
            description: string;
            webUrl: string;
            lastModifiedDateTime: string;
            createdBy?: { user?: { displayName: string } };
          };
        }) => ({
          id: hit.hitId,
          title: hit.resource.name || "",
          description: hit.resource.description || "",
          url: hit.resource.webUrl || "",
          author: hit.resource.createdBy?.user?.displayName || "",
          lastModified: hit.resource.lastModifiedDateTime || "",
          category: "",
          contentType: "",
          viewCount: 0,
          hitHighlightedSummary: hit.summary || "",
          thumbnailUrl: "",
          fileExtension: "",
        })
      );
    } catch (error) {
      console.error("[SearchService] searchViaGraph failed:", error);
      throw error;
    }
  }

  /**
   * Clear all cached data.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mapSearchResults(rows: Array<{ Cells: Array<{ Key: string; Value: string }> }>): ISearchResult[] {
    return rows.map((row) => {
      const cells = row.Cells || [];
      const getCellValue = (key: string): string => {
        const cell = cells.find((c) => c.Key === key);
        return cell ? cell.Value || "" : "";
      };

      return {
        id: getCellValue("DocId") || getCellValue("UniqueId"),
        title: getCellValue("Title"),
        description: getCellValue("Description"),
        url: getCellValue("Path"),
        author: getCellValue("AuthorOWSUSER"),
        lastModified: getCellValue("LastModifiedTime"),
        category: getCellValue("owstaxIdCategory"),
        contentType: getCellValue("ContentType"),
        viewCount: parseInt(getCellValue("ViewsLifeTime"), 10) || 0,
        hitHighlightedSummary: getCellValue("HitHighlightedSummary"),
        thumbnailUrl: getCellValue("PictureThumbnailURL"),
        fileExtension: getCellValue("FileExtension"),
      };
    });
  }

  private mapRefiners(
    refiners: Array<{
      Name: string;
      Entries: Array<{ RefinementName: string; RefinementToken: string; RefinementCount: number }>;
    }>
  ): IRefiner[] {
    return refiners.map((refiner) => ({
      name: refiner.Name,
      values: (refiner.Entries || []).map((entry) => ({
        value: entry.RefinementName,
        token: entry.RefinementToken,
        count: entry.RefinementCount,
      })),
    }));
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key) as ICacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache<T>(key: string, data: T, ttl: number = SearchService.DEFAULT_CACHE_TTL): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });

    // Evict stale entries when cache grows large
    if (this.cache.size > 100) {
      const now = Date.now();
      this.cache.forEach((entry, k) => {
        if (now - entry.timestamp > entry.ttl) {
          this.cache.delete(k);
        }
      });
    }
  }
}
