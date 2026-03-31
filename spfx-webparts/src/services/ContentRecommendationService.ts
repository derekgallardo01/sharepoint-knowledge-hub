/**
 * ContentRecommendationService - Content recommendation engine for the Knowledge Hub.
 *
 * Provides three recommendation strategies:
 *
 *   1. "Related articles" -- Articles sharing taxonomy terms (category, department, tags)
 *      with the currently viewed article. Uses weighted term overlap scoring.
 *
 *   2. "Users who viewed this also viewed" -- Co-occurrence analysis based on analytics
 *      page view data. Articles frequently viewed in the same session score higher.
 *
 *   3. "Trending in your department" -- Articles popular with users from the same
 *      department, weighted by recency and view velocity.
 *
 * Scoring:
 *   Each strategy produces a normalized score [0, 1]. The final recommendation
 *   score is a weighted combination:
 *     - taxonomyWeight   = 0.45  (shared terms are the strongest signal)
 *     - coViewWeight     = 0.30  (co-occurrence is a strong behavioral signal)
 *     - trendingWeight   = 0.15  (recency and popularity)
 *     - recencyBoost     = 0.10  (recently modified articles get a boost)
 *
 * Results include a confidence score and the primary reason for recommendation.
 */

import { SPFI } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";
import "@pnp/sp/search";
import { ISearchQuery, SearchResults } from "@pnp/sp/search";

import { cacheService } from "./CacheService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IRecommendation {
  /** Article list item ID. */
  articleId: number;
  /** Article title. */
  title: string;
  /** Primary category. */
  category: string;
  /** Department. */
  department: string;
  /** Combined recommendation score (0-1). */
  score: number;
  /** Confidence level: high (>0.7), medium (0.4-0.7), low (<0.4). */
  confidence: "high" | "medium" | "low";
  /** Primary reason for recommendation. */
  reason: string;
}

export interface IArticleContext {
  /** Current article's list item ID. */
  articleId: number;
  /** Title of the current article. */
  title: string;
  /** Taxonomy category term(s). */
  categories: string[];
  /** Department term. */
  department: string;
  /** Tags / keywords. */
  tags: string[];
}

export interface IRecommendationConfig {
  /** Analytics list name. Default: "KH Analytics Events". */
  analyticsListName: string;
  /** Articles list name. Default: "Knowledge Articles". */
  articlesListName: string;
  /** Max recommendations to return. Default: 5. */
  maxResults: number;
  /** Weight for taxonomy match. Default: 0.45. */
  taxonomyWeight: number;
  /** Weight for co-view correlation. Default: 0.30. */
  coViewWeight: number;
  /** Weight for department trending. Default: 0.15. */
  trendingWeight: number;
  /** Weight for recency boost. Default: 0.10. */
  recencyBoost: number;
  /** Days to look back for analytics data. Default: 30. */
  analyticsWindowDays: number;
  /** Cache TTL for recommendations (ms). Default: 600,000 (10 min). */
  cacheTtl: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: IRecommendationConfig = {
  analyticsListName: "KH Analytics Events",
  articlesListName: "Knowledge Articles",
  maxResults: 5,
  taxonomyWeight: 0.45,
  coViewWeight: 0.30,
  trendingWeight: 0.15,
  recencyBoost: 0.10,
  analyticsWindowDays: 30,
  cacheTtl: 10 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ContentRecommendationService {
  private readonly _sp: SPFI;
  private readonly _config: IRecommendationConfig;

  constructor(sp: SPFI, config?: Partial<IRecommendationConfig>) {
    this._sp = sp;
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get recommendations for the given article context.
   * Returns a ranked list with scores and reasons.
   */
  public async getRecommendations(context: IArticleContext): Promise<IRecommendation[]> {
    const cacheKey = `reco_${context.articleId}`;

    return cacheService.getOrSet(cacheKey, async () => {
      // Run all three strategies in parallel
      const [taxonomyScores, coViewScores, trendingScores] = await Promise.all([
        this._getRelatedByTaxonomy(context),
        this._getCoViewedArticles(context.articleId),
        this._getTrendingInDepartment(context.department, context.articleId),
      ]);

      // Merge scores
      const scoreMap = new Map<number, {
        title: string;
        category: string;
        department: string;
        taxonomy: number;
        coView: number;
        trending: number;
        recency: number;
        reason: string;
      }>();

      // Process taxonomy matches
      for (const item of taxonomyScores) {
        scoreMap.set(item.articleId, {
          title: item.title,
          category: item.category,
          department: item.department,
          taxonomy: item.score,
          coView: 0,
          trending: 0,
          recency: item.recencyScore,
          reason: item.matchReason,
        });
      }

      // Process co-view matches
      for (const item of coViewScores) {
        const existing = scoreMap.get(item.articleId);
        if (existing) {
          existing.coView = item.score;
          if (item.score > existing.taxonomy) {
            existing.reason = "Frequently viewed together";
          }
        } else {
          scoreMap.set(item.articleId, {
            title: item.title,
            category: item.category,
            department: item.department,
            taxonomy: 0,
            coView: item.score,
            trending: 0,
            recency: 0,
            reason: "Frequently viewed together",
          });
        }
      }

      // Process trending matches
      for (const item of trendingScores) {
        const existing = scoreMap.get(item.articleId);
        if (existing) {
          existing.trending = item.score;
        } else {
          scoreMap.set(item.articleId, {
            title: item.title,
            category: item.category,
            department: item.department,
            taxonomy: 0,
            coView: 0,
            trending: item.score,
            recency: 0,
            reason: `Trending in ${context.department}`,
          });
        }
      }

      // Compute final scores
      const recommendations: IRecommendation[] = [];
      for (const [articleId, data] of scoreMap.entries()) {
        // Skip the current article
        if (articleId === context.articleId) continue;

        const finalScore =
          data.taxonomy * this._config.taxonomyWeight +
          data.coView * this._config.coViewWeight +
          data.trending * this._config.trendingWeight +
          data.recency * this._config.recencyBoost;

        recommendations.push({
          articleId,
          title: data.title,
          category: data.category,
          department: data.department,
          score: Math.round(finalScore * 100) / 100,
          confidence: finalScore > 0.7 ? "high" : finalScore > 0.4 ? "medium" : "low",
          reason: data.reason,
        });
      }

      // Sort by score descending, take top N
      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, this._config.maxResults);
    }, this._config.cacheTtl);
  }

  // ---- Strategy 1: Taxonomy-based related articles -------------------------

  private async _getRelatedByTaxonomy(
    context: IArticleContext
  ): Promise<Array<{
    articleId: number;
    title: string;
    category: string;
    department: string;
    score: number;
    recencyScore: number;
    matchReason: string;
  }>> {
    // Build KQL query: articles sharing any category, department, or tag
    const categoryTerms = context.categories.map((c) => `KHCategory:"${c}"`).join(" OR ");
    const departmentTerm = `KHDepartment:"${context.department}"`;
    const tagTerms = context.tags.length > 0
      ? context.tags.slice(0, 5).map((t) => `KHTags:"${t}"`).join(" OR ")
      : "";

    const kqlParts = [categoryTerms, departmentTerm, tagTerms].filter(Boolean);
    const queryText = `(${kqlParts.join(" OR ")}) AND KHStatus:Published AND -ListItemID:${context.articleId}`;

    const searchQuery: ISearchQuery = {
      Querytext: queryText,
      RowLimit: 20,
      SelectProperties: [
        "ListItemID", "Title", "KHCategory", "KHDepartment", "KHTags", "LastModifiedTime",
      ],
      SortList: [{ Property: "Rank", Direction: 0 }],
      TrimDuplicates: true,
    };

    const results: SearchResults = await this._sp.search(searchQuery);
    const now = Date.now();

    return (results.PrimarySearchResults || []).map((row) => {
      const articleTags: string[] = (row.KHTags || "").split(";").map((t: string) => t.trim()).filter(Boolean);
      const articleCategories: string[] = [(row.KHCategory || "")];

      // Compute overlap score
      const categoryOverlap = context.categories.filter((c) =>
        articleCategories.some((ac) => ac.toLowerCase() === c.toLowerCase())
      ).length;
      const tagOverlap = context.tags.filter((t) =>
        articleTags.some((at) => at.toLowerCase() === t.toLowerCase())
      ).length;
      const deptMatch = (row.KHDepartment || "").toLowerCase() === context.department.toLowerCase() ? 1 : 0;

      const maxPossible = context.categories.length + context.tags.length + 1;
      const overlap = categoryOverlap + tagOverlap + deptMatch;
      const score = maxPossible > 0 ? Math.min(overlap / maxPossible, 1) : 0;

      // Recency score: articles modified within 7 days get full boost, decays over 90 days
      const modifiedTime = new Date(row.LastModifiedTime || 0).getTime();
      const daysSinceModified = (now - modifiedTime) / 86_400_000;
      const recencyScore = daysSinceModified <= 7 ? 1 : Math.max(0, 1 - daysSinceModified / 90);

      // Build reason
      const reasons: string[] = [];
      if (categoryOverlap > 0) reasons.push("same category");
      if (deptMatch > 0) reasons.push("same department");
      if (tagOverlap > 0) reasons.push(`${tagOverlap} shared tag${tagOverlap > 1 ? "s" : ""}`);

      return {
        articleId: parseInt(row.ListItemID, 10),
        title: row.Title || "",
        category: row.KHCategory || "Uncategorized",
        department: row.KHDepartment || "",
        score,
        recencyScore,
        matchReason: reasons.length > 0 ? `Related: ${reasons.join(", ")}` : "Related content",
      };
    });
  }

  // ---- Strategy 2: Co-viewed articles (collaborative filtering) ------------

  private async _getCoViewedArticles(
    articleId: number
  ): Promise<Array<{
    articleId: number;
    title: string;
    category: string;
    department: string;
    score: number;
  }>> {
    const since = new Date(Date.now() - this._config.analyticsWindowDays * 86_400_000).toISOString();

    // Step 1: Find sessions that viewed this article
    const sessionsData = await this._sp.web.lists
      .getByTitle(this._config.analyticsListName).items
      .filter(`EventType eq 'pageView' and ArticleId eq ${articleId} and EventTimestamp ge '${since}'`)
      .select("SessionId")
      .top(500)();

    const sessionIds = [...new Set(sessionsData.map((s: { SessionId: string }) => s.SessionId))];
    if (sessionIds.length === 0) return [];

    // Step 2: Find other articles viewed in those sessions (sample up to 50 sessions)
    const sampleSessions = sessionIds.slice(0, 50);
    const sessionFilter = sampleSessions.map((s) => `SessionId eq '${s}'`).join(" or ");

    const coViewData = await this._sp.web.lists
      .getByTitle(this._config.analyticsListName).items
      .filter(`EventType eq 'pageView' and ArticleId ne ${articleId} and (${sessionFilter})`)
      .select("ArticleId", "ArticleTitle", "Category", "Department")
      .top(2000)();

    // Step 3: Count co-occurrences
    const coViewMap = new Map<number, {
      title: string;
      category: string;
      department: string;
      count: number;
    }>();

    for (const item of coViewData) {
      const existing = coViewMap.get(item.ArticleId);
      if (existing) {
        existing.count++;
      } else {
        coViewMap.set(item.ArticleId, {
          title: item.ArticleTitle || `Article ${item.ArticleId}`,
          category: item.Category || "Uncategorized",
          department: item.Department || "",
          count: 1,
        });
      }
    }

    // Normalize scores
    const maxCount = Math.max(...Array.from(coViewMap.values()).map((v) => v.count), 1);

    return Array.from(coViewMap.entries())
      .map(([id, data]) => ({
        articleId: id,
        title: data.title,
        category: data.category,
        department: data.department,
        score: data.count / maxCount,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }

  // ---- Strategy 3: Trending in department ----------------------------------

  private async _getTrendingInDepartment(
    department: string,
    excludeArticleId: number
  ): Promise<Array<{
    articleId: number;
    title: string;
    category: string;
    department: string;
    score: number;
  }>> {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString(); // Last 7 days

    const views = await this._sp.web.lists
      .getByTitle(this._config.analyticsListName).items
      .filter(
        `EventType eq 'pageView' and Department eq '${department}' and ArticleId ne ${excludeArticleId} and EventTimestamp ge '${since}'`
      )
      .select("ArticleId", "ArticleTitle", "Category", "Department")
      .top(2000)();

    // Count views per article
    const viewMap = new Map<number, {
      title: string;
      category: string;
      department: string;
      count: number;
    }>();

    for (const v of views) {
      const existing = viewMap.get(v.ArticleId);
      if (existing) existing.count++;
      else viewMap.set(v.ArticleId, {
        title: v.ArticleTitle || `Article ${v.ArticleId}`,
        category: v.Category || "Uncategorized",
        department: v.Department || department,
        count: 1,
      });
    }

    // Normalize
    const maxCount = Math.max(...Array.from(viewMap.values()).map((v) => v.count), 1);

    return Array.from(viewMap.entries())
      .map(([id, data]) => ({
        articleId: id,
        title: data.title,
        category: data.category,
        department: data.department,
        score: data.count / maxCount,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }
}
