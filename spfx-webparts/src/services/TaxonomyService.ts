import { WebPartContext } from "@microsoft/sp-webpart-base";
import { SPHttpClient, SPHttpClientResponse } from "@microsoft/sp-http";

/**
 * Represents a term within a term set in the managed metadata service.
 */
export interface ITerm {
  id: string;
  name: string;
  description: string;
  path: string;
  children: ITerm[];
  customProperties: Record<string, string>;
  isAvailableForTagging: boolean;
}

/**
 * Represents a term set containing a collection of terms.
 */
export interface ITermSet {
  id: string;
  name: string;
  description: string;
  terms: ITerm[];
}

/**
 * Represents a term group that contains term sets.
 */
export interface ITermGroup {
  id: string;
  name: string;
  termSets: ITermSet[];
}

/**
 * Flat representation of a term used in dropdowns and pickers.
 */
export interface ITermOption {
  key: string;
  text: string;
  path: string;
  level: number;
}

/**
 * TaxonomyService provides methods for reading managed metadata from
 * the SharePoint Taxonomy Store. Designed to work with the Knowledge Hub
 * term group and its term sets (Categories, Departments, Document Types, Audiences).
 *
 * Caching: Results are stored in sessionStorage with a 15-minute TTL to
 * reduce repeated calls to the taxonomy API during a user session.
 */
export class TaxonomyService {
  private context: WebPartContext;
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly CACHE_PREFIX = "kh_taxonomy_";
  private static readonly TAXONOMY_API =
    "/_api/v2.1/termStore";

  constructor(context: WebPartContext) {
    this.context = context;
  }

  /**
   * Retrieve all term sets available in the default term store.
   *
   * @returns Array of term sets with their metadata.
   */
  public async getTermSets(): Promise<ITermSet[]> {
    const cacheKey = "termSets";
    const cached = this.getFromSessionCache<ITermSet[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = `${this.context.pageContext.web.absoluteUrl}${TaxonomyService.TAXONOMY_API}/groups`;
      const response: SPHttpClientResponse = await this.context.spHttpClient.get(
        url,
        SPHttpClient.configurations.v1,
        {
          headers: { Accept: "application/json;odata.metadata=none" },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch term groups: ${response.status}`);
      }

      const data = await response.json();
      const groups: Array<{ id: string; displayName: string }> = data.value || [];

      const allTermSets: ITermSet[] = [];

      for (const group of groups) {
        const setsUrl = `${this.context.pageContext.web.absoluteUrl}${TaxonomyService.TAXONOMY_API}/groups/${group.id}/sets`;
        const setsResponse: SPHttpClientResponse = await this.context.spHttpClient.get(
          setsUrl,
          SPHttpClient.configurations.v1,
          {
            headers: { Accept: "application/json;odata.metadata=none" },
          }
        );

        if (setsResponse.ok) {
          const setsData = await setsResponse.json();
          const sets: Array<{ id: string; localizedNames: Array<{ name: string }>; description: string }> =
            setsData.value || [];

          for (const ts of sets) {
            allTermSets.push({
              id: ts.id,
              name: ts.localizedNames?.[0]?.name || "",
              description: ts.description || "",
              terms: [],
            });
          }
        }
      }

      this.setSessionCache(cacheKey, allTermSets);
      return allTermSets;
    } catch (error) {
      console.error("[TaxonomyService] getTermSets failed:", error);
      throw error;
    }
  }

  /**
   * Retrieve all terms within a specific term set.
   *
   * @param termSetId - The GUID of the term set.
   * @returns Array of terms with hierarchical structure.
   */
  public async getTermsByTermSet(termSetId: string): Promise<ITerm[]> {
    const cacheKey = `terms_${termSetId}`;
    const cached = this.getFromSessionCache<ITerm[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url =
        `${this.context.pageContext.web.absoluteUrl}${TaxonomyService.TAXONOMY_API}` +
        `/sets/${termSetId}/children`;
      const response: SPHttpClientResponse = await this.context.spHttpClient.get(
        url,
        SPHttpClient.configurations.v1,
        {
          headers: { Accept: "application/json;odata.metadata=none" },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch terms for set ${termSetId}: ${response.status}`);
      }

      const data = await response.json();
      const rawTerms: Array<{
        id: string;
        labels: Array<{ name: string; isDefault: boolean }>;
        descriptions: Array<{ description: string }>;
        isAvailableForTagging: boolean;
        properties: Array<{ key: string; value: string }>;
      }> = data.value || [];

      const terms: ITerm[] = [];

      for (const raw of rawTerms) {
        const term = await this.mapTermWithChildren(termSetId, raw);
        terms.push(term);
      }

      this.setSessionCache(cacheKey, terms);
      return terms;
    } catch (error) {
      console.error("[TaxonomyService] getTermsByTermSet failed:", error);
      throw error;
    }
  }

  /**
   * Get the Knowledge Hub "Categories" term set terms as a flat list
   * suitable for dropdown population.
   *
   * @returns Flat list of category term options.
   */
  public async getArticleCategories(): Promise<ITermOption[]> {
    const cacheKey = "articleCategories";
    const cached = this.getFromSessionCache<ITermOption[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const termSets = await this.getTermSets();
      const categoriesSet = termSets.find(
        (ts) => ts.name.toLowerCase() === "categories"
      );

      if (!categoriesSet) {
        console.warn("[TaxonomyService] Categories term set not found");
        return [];
      }

      const terms = await this.getTermsByTermSet(categoriesSet.id);
      const options = this.flattenTerms(terms, 0);

      this.setSessionCache(cacheKey, options);
      return options;
    } catch (error) {
      console.error("[TaxonomyService] getArticleCategories failed:", error);
      throw error;
    }
  }

  /**
   * Get terms for the "Departments" term set.
   *
   * @returns Flat list of department term options.
   */
  public async getDepartments(): Promise<ITermOption[]> {
    const cacheKey = "departments";
    const cached = this.getFromSessionCache<ITermOption[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const termSets = await this.getTermSets();
      const deptSet = termSets.find(
        (ts) => ts.name.toLowerCase() === "departments"
      );

      if (!deptSet) {
        console.warn("[TaxonomyService] Departments term set not found");
        return [];
      }

      const terms = await this.getTermsByTermSet(deptSet.id);
      const options = this.flattenTerms(terms, 0);

      this.setSessionCache(cacheKey, options);
      return options;
    } catch (error) {
      console.error("[TaxonomyService] getDepartments failed:", error);
      throw error;
    }
  }

  /**
   * Get terms for the "Audiences" term set.
   *
   * @returns Flat list of audience term options.
   */
  public async getAudiences(): Promise<ITermOption[]> {
    const cacheKey = "audiences";
    const cached = this.getFromSessionCache<ITermOption[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const termSets = await this.getTermSets();
      const audienceSet = termSets.find(
        (ts) => ts.name.toLowerCase() === "audiences"
      );

      if (!audienceSet) {
        console.warn("[TaxonomyService] Audiences term set not found");
        return [];
      }

      const terms = await this.getTermsByTermSet(audienceSet.id);
      const options = this.flattenTerms(terms, 0);

      this.setSessionCache(cacheKey, options);
      return options;
    } catch (error) {
      console.error("[TaxonomyService] getAudiences failed:", error);
      throw error;
    }
  }

  /**
   * Invalidate all cached taxonomy data. Useful after taxonomy changes.
   */
  public clearCache(): void {
    if (typeof sessionStorage !== "undefined") {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(TaxonomyService.CACHE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async mapTermWithChildren(
    termSetId: string,
    raw: {
      id: string;
      labels: Array<{ name: string; isDefault: boolean }>;
      descriptions: Array<{ description: string }>;
      isAvailableForTagging: boolean;
      properties: Array<{ key: string; value: string }>;
    }
  ): Promise<ITerm> {
    const defaultLabel = raw.labels?.find((l) => l.isDefault)?.name || raw.labels?.[0]?.name || "";
    const customProps: Record<string, string> = {};
    (raw.properties || []).forEach((p) => {
      customProps[p.key] = p.value;
    });

    // Fetch child terms
    let children: ITerm[] = [];
    try {
      const childUrl =
        `${this.context.pageContext.web.absoluteUrl}${TaxonomyService.TAXONOMY_API}` +
        `/sets/${termSetId}/terms/${raw.id}/children`;
      const childResponse: SPHttpClientResponse = await this.context.spHttpClient.get(
        childUrl,
        SPHttpClient.configurations.v1,
        {
          headers: { Accept: "application/json;odata.metadata=none" },
        }
      );

      if (childResponse.ok) {
        const childData = await childResponse.json();
        const rawChildren = childData.value || [];
        for (const rawChild of rawChildren) {
          children.push(await this.mapTermWithChildren(termSetId, rawChild));
        }
      }
    } catch {
      // Child fetch failed; treat as leaf node
    }

    return {
      id: raw.id,
      name: defaultLabel,
      description: raw.descriptions?.[0]?.description || "",
      path: defaultLabel,
      children,
      customProperties: customProps,
      isAvailableForTagging: raw.isAvailableForTagging,
    };
  }

  private flattenTerms(terms: ITerm[], level: number, parentPath: string = ""): ITermOption[] {
    const options: ITermOption[] = [];
    for (const term of terms) {
      const path = parentPath ? `${parentPath} > ${term.name}` : term.name;
      options.push({
        key: term.id,
        text: term.name,
        path,
        level,
      });
      if (term.children && term.children.length > 0) {
        options.push(...this.flattenTerms(term.children, level + 1, path));
      }
    }
    return options;
  }

  private getFromSessionCache<T>(key: string): T | null {
    if (typeof sessionStorage === "undefined") return null;

    try {
      const raw = sessionStorage.getItem(`${TaxonomyService.CACHE_PREFIX}${key}`);
      if (!raw) return null;

      const entry = JSON.parse(raw) as { data: T; timestamp: number };
      if (Date.now() - entry.timestamp > TaxonomyService.CACHE_TTL_MS) {
        sessionStorage.removeItem(`${TaxonomyService.CACHE_PREFIX}${key}`);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  private setSessionCache<T>(key: string, data: T): void {
    if (typeof sessionStorage === "undefined") return;

    try {
      const entry = JSON.stringify({ data, timestamp: Date.now() });
      sessionStorage.setItem(`${TaxonomyService.CACHE_PREFIX}${key}`, entry);
    } catch {
      // sessionStorage full or unavailable; silently continue
    }
  }
}
