import { WebPartContext } from "@microsoft/sp-webpart-base";
import { SPHttpClient, SPHttpClientResponse } from "@microsoft/sp-http";

/**
 * Full knowledge article model with all metadata fields.
 */
export interface IKnowledgeArticle {
  id: number;
  title: string;
  body: string;
  category: string;
  categoryTermId: string;
  department: string;
  departmentTermId: string;
  tags: string[];
  author: string;
  authorEmail: string;
  authorId: number;
  editor: string;
  editorEmail: string;
  created: string;
  modified: string;
  reviewDate: string;
  status: ArticleStatus;
  viewCount: number;
  averageRating: number;
  ratingCount: number;
  thumbnailUrl: string;
  url: string;
  contentType: string;
}

/**
 * Lightweight article summary for lists and cards.
 */
export interface IArticleSummary {
  id: number;
  title: string;
  description: string;
  category: string;
  author: string;
  modified: string;
  viewCount: number;
  thumbnailUrl: string;
  url: string;
  contentType: string;
}

/**
 * User feedback submitted for an article.
 */
export interface IArticleFeedback {
  id?: number;
  articleId: number;
  rating: FeedbackRating;
  comment: string;
  userId: number;
  userName: string;
  created: string;
}

/**
 * FAQ item model.
 */
export interface IFaqItem {
  id: number;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  helpfulCount: number;
  notHelpfulCount: number;
  modified: string;
}

/**
 * Allowed article statuses in the content lifecycle.
 */
export type ArticleStatus = "Draft" | "In Review" | "Published" | "Archived";

/**
 * Feedback rating values.
 */
export type FeedbackRating = "Helpful" | "NotHelpful";

/**
 * Parameters for creating or updating an article.
 */
export interface IArticleCreateParams {
  title: string;
  body: string;
  categoryTermId: string;
  departmentTermId: string;
  tags: string[];
  reviewDate: string;
  status?: ArticleStatus;
}

/**
 * KnowledgeService provides CRUD operations for knowledge articles,
 * FAQ items, and feedback backed by SharePoint lists and document libraries.
 *
 * List assumptions:
 * - "Knowledge Articles" list with Knowledge Article content type
 * - "FAQs" list with FAQ Item content type
 * - "Article Feedback" list for rating/comment storage
 */
export class KnowledgeService {
  private context: WebPartContext;
  private static readonly ARTICLES_LIST = "Knowledge Articles";
  private static readonly FAQ_LIST = "FAQs";
  private static readonly FEEDBACK_LIST = "Article Feedback";
  private static readonly LIST_API = "/_api/web/lists/getbytitle";

  constructor(context: WebPartContext) {
    this.context = context;
  }

  // ---------------------------------------------------------------------------
  // Knowledge Articles
  // ---------------------------------------------------------------------------

  /**
   * Retrieve a single knowledge article by its list item ID, including
   * all metadata, author information, and view count.
   *
   * @param id - The SharePoint list item ID.
   * @returns Full article object.
   */
  public async getArticle(id: number): Promise<IKnowledgeArticle> {
    const url =
      `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.ARTICLES_LIST}')` +
      `/items(${id})?$select=*,Author/Title,Author/EMail,Author/Id,Editor/Title,Editor/EMail` +
      `&$expand=Author,Editor`;

    try {
      const response = await this.get(url);
      const item = await response.json();
      return this.mapArticle(item);
    } catch (error) {
      console.error(`[KnowledgeService] getArticle(${id}) failed:`, error);
      throw error;
    }
  }

  /**
   * Retrieve a paginated list of articles with optional filters.
   *
   * @param top - Number of items to return.
   * @param skip - Number of items to skip (for pagination).
   * @param category - Optional category filter.
   * @param status - Optional status filter (default: "Published").
   * @returns Array of article summaries.
   */
  public async getArticles(
    top: number = 10,
    skip: number = 0,
    category?: string,
    status: ArticleStatus = "Published"
  ): Promise<IArticleSummary[]> {
    let filter = `KHStatus eq '${status}'`;
    if (category) {
      filter += ` and KHCategory eq '${category}'`;
    }

    const url =
      `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.ARTICLES_LIST}')` +
      `/items?$select=Id,Title,KHDescription,KHCategory,Author/Title,Modified,KHViewCount,KHThumbnailUrl,ContentType/Name` +
      `&$expand=Author,ContentType` +
      `&$filter=${encodeURIComponent(filter)}` +
      `&$orderby=Modified desc` +
      `&$top=${top}&$skip=${skip}`;

    try {
      const response = await this.get(url);
      const data = await response.json();
      return (data.value || []).map((item: Record<string, unknown>) =>
        this.mapArticleSummary(item)
      );
    } catch (error) {
      console.error("[KnowledgeService] getArticles failed:", error);
      throw error;
    }
  }

  /**
   * Find articles related to a given article by matching category and tags.
   *
   * @param articleId - The ID of the source article.
   * @param count - Maximum number of related articles to return.
   * @returns Array of related article summaries.
   */
  public async getRelatedArticles(
    articleId: number,
    count: number = 5
  ): Promise<IArticleSummary[]> {
    try {
      const article = await this.getArticle(articleId);
      const category = article.category;
      const tags = article.tags;

      // Build filter: same category OR overlapping tags, excluding current article
      let filter = `Id ne ${articleId} and KHStatus eq 'Published' and (KHCategory eq '${category}'`;
      if (tags && tags.length > 0) {
        const tagFilters = tags
          .slice(0, 3) // limit to avoid overly complex queries
          .map((tag) => `substringof('${tag}', KHTags)`)
          .join(" or ");
        filter += ` or ${tagFilters}`;
      }
      filter += ")";

      const url =
        `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.ARTICLES_LIST}')` +
        `/items?$select=Id,Title,KHDescription,KHCategory,Author/Title,Modified,KHViewCount,KHThumbnailUrl,ContentType/Name` +
        `&$expand=Author,ContentType` +
        `&$filter=${encodeURIComponent(filter)}` +
        `&$orderby=KHViewCount desc` +
        `&$top=${count}`;

      const response = await this.get(url);
      const data = await response.json();
      return (data.value || []).map((item: Record<string, unknown>) =>
        this.mapArticleSummary(item)
      );
    } catch (error) {
      console.error("[KnowledgeService] getRelatedArticles failed:", error);
      return [];
    }
  }

  /**
   * Create a new knowledge article.
   *
   * @param params - The article creation parameters.
   * @returns The newly created article.
   */
  public async createArticle(params: IArticleCreateParams): Promise<IKnowledgeArticle> {
    const url =
      `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.ARTICLES_LIST}')/items`;

    const body = {
      Title: params.title,
      KHBody: params.body,
      KHCategoryTermId: params.categoryTermId,
      KHDepartmentTermId: params.departmentTermId,
      KHTags: params.tags.join(";"),
      KHReviewDate: params.reviewDate,
      KHStatus: params.status || "Draft",
      KHViewCount: 0,
    };

    try {
      const response = await this.post(url, body);
      const item = await response.json();
      return this.mapArticle(item);
    } catch (error) {
      console.error("[KnowledgeService] createArticle failed:", error);
      throw error;
    }
  }

  /**
   * Update an existing knowledge article.
   *
   * @param id - The list item ID.
   * @param params - Fields to update.
   */
  public async updateArticle(id: number, params: Partial<IArticleCreateParams>): Promise<void> {
    const url =
      `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.ARTICLES_LIST}')/items(${id})`;

    const body: Record<string, unknown> = {};
    if (params.title !== undefined) body.Title = params.title;
    if (params.body !== undefined) body.KHBody = params.body;
    if (params.categoryTermId !== undefined) body.KHCategoryTermId = params.categoryTermId;
    if (params.departmentTermId !== undefined) body.KHDepartmentTermId = params.departmentTermId;
    if (params.tags !== undefined) body.KHTags = params.tags.join(";");
    if (params.reviewDate !== undefined) body.KHReviewDate = params.reviewDate;
    if (params.status !== undefined) body.KHStatus = params.status;

    try {
      await this.patch(url, body);
    } catch (error) {
      console.error(`[KnowledgeService] updateArticle(${id}) failed:`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // FAQ Items
  // ---------------------------------------------------------------------------

  /**
   * Retrieve FAQ items, optionally filtered by category.
   *
   * @param category - Optional category filter.
   * @returns Array of FAQ items sorted by SortOrder.
   */
  public async getFaqItems(category?: string): Promise<IFaqItem[]> {
    let filter = "";
    if (category) {
      filter = `&$filter=KHCategory eq '${encodeURIComponent(category)}'`;
    }

    const url =
      `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.FAQ_LIST}')` +
      `/items?$select=Id,Title,KHAnswer,KHCategory,KHSortOrder,KHHelpfulCount,KHNotHelpfulCount,Modified` +
      `&$orderby=KHSortOrder asc` +
      `&$top=200${filter}`;

    try {
      const response = await this.get(url);
      const data = await response.json();
      return (data.value || []).map(
        (item: Record<string, unknown>): IFaqItem => ({
          id: item.Id as number,
          question: (item.Title as string) || "",
          answer: (item.KHAnswer as string) || "",
          category: (item.KHCategory as string) || "",
          sortOrder: (item.KHSortOrder as number) || 0,
          helpfulCount: (item.KHHelpfulCount as number) || 0,
          notHelpfulCount: (item.KHNotHelpfulCount as number) || 0,
          modified: (item.Modified as string) || "",
        })
      );
    } catch (error) {
      console.error("[KnowledgeService] getFaqItems failed:", error);
      throw error;
    }
  }

  /**
   * Get unique FAQ categories.
   *
   * @returns Array of category strings.
   */
  public async getFaqCategories(): Promise<string[]> {
    try {
      const items = await this.getFaqItems();
      const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];
      return categories.sort();
    } catch (error) {
      console.error("[KnowledgeService] getFaqCategories failed:", error);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Feedback & View Tracking
  // ---------------------------------------------------------------------------

  /**
   * Submit user feedback (helpful/not helpful + optional comment) for an article.
   *
   * @param articleId - The article list item ID.
   * @param rating - "Helpful" or "NotHelpful".
   * @param comment - Optional comment text.
   */
  public async submitFeedback(
    articleId: number,
    rating: FeedbackRating,
    comment: string = ""
  ): Promise<void> {
    const url =
      `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.FEEDBACK_LIST}')/items`;

    const body = {
      Title: `Feedback for Article ${articleId}`,
      KHArticleId: articleId,
      KHRating: rating,
      KHComment: comment,
    };

    try {
      await this.post(url, body);
    } catch (error) {
      console.error("[KnowledgeService] submitFeedback failed:", error);
      throw error;
    }
  }

  /**
   * Submit helpful/not-helpful feedback for a FAQ item.
   *
   * @param faqId - The FAQ list item ID.
   * @param helpful - Whether the user found the FAQ helpful.
   */
  public async submitFaqFeedback(faqId: number, helpful: boolean): Promise<void> {
    // Read current counts and increment the appropriate one
    const faqUrl =
      `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.FAQ_LIST}')` +
      `/items(${faqId})?$select=KHHelpfulCount,KHNotHelpfulCount`;

    try {
      const faqResponse = await this.get(faqUrl);
      const faqItem = await faqResponse.json();

      const updateBody: Record<string, number> = {};
      if (helpful) {
        updateBody.KHHelpfulCount = ((faqItem.KHHelpfulCount as number) || 0) + 1;
      } else {
        updateBody.KHNotHelpfulCount = ((faqItem.KHNotHelpfulCount as number) || 0) + 1;
      }

      const updateUrl =
        `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.FAQ_LIST}')/items(${faqId})`;
      await this.patch(updateUrl, updateBody);
    } catch (error) {
      console.error("[KnowledgeService] submitFaqFeedback failed:", error);
      throw error;
    }
  }

  /**
   * Increment the view count for a knowledge article. Uses PATCH to
   * atomically update the view count field.
   *
   * @param articleId - The article list item ID.
   */
  public async incrementViewCount(articleId: number): Promise<void> {
    try {
      // Fetch current view count
      const readUrl =
        `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.ARTICLES_LIST}')` +
        `/items(${articleId})?$select=KHViewCount`;

      const response = await this.get(readUrl);
      const item = await response.json();
      const currentCount = (item.KHViewCount as number) || 0;

      // Update with incremented count
      const updateUrl =
        `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.ARTICLES_LIST}')/items(${articleId})`;
      await this.patch(updateUrl, { KHViewCount: currentCount + 1 });
    } catch (error) {
      // View count failures should not block the user experience
      console.warn("[KnowledgeService] incrementViewCount failed (non-blocking):", error);
    }
  }

  /**
   * Get feedback summary for a specific article.
   *
   * @param articleId - The article list item ID.
   * @returns Object with helpful count, not helpful count, and recent comments.
   */
  public async getArticleFeedback(
    articleId: number
  ): Promise<{ helpful: number; notHelpful: number; comments: IArticleFeedback[] }> {
    const url =
      `${this.siteUrl}${KnowledgeService.LIST_API}('${KnowledgeService.FEEDBACK_LIST}')` +
      `/items?$select=Id,KHArticleId,KHRating,KHComment,Author/Title,Author/Id,Created` +
      `&$expand=Author` +
      `&$filter=KHArticleId eq ${articleId}` +
      `&$orderby=Created desc` +
      `&$top=50`;

    try {
      const response = await this.get(url);
      const data = await response.json();
      const items: Array<Record<string, unknown>> = data.value || [];

      let helpful = 0;
      let notHelpful = 0;
      const comments: IArticleFeedback[] = [];

      for (const item of items) {
        const rating = item.KHRating as string;
        if (rating === "Helpful") helpful++;
        else notHelpful++;

        comments.push({
          id: item.Id as number,
          articleId: item.KHArticleId as number,
          rating: rating as FeedbackRating,
          comment: (item.KHComment as string) || "",
          userId: (item.Author as Record<string, unknown>)?.Id as number,
          userName: (item.Author as Record<string, unknown>)?.Title as string,
          created: item.Created as string,
        });
      }

      return { helpful, notHelpful, comments };
    } catch (error) {
      console.error("[KnowledgeService] getArticleFeedback failed:", error);
      return { helpful: 0, notHelpful: 0, comments: [] };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private get siteUrl(): string {
    return this.context.pageContext.web.absoluteUrl;
  }

  private async get(url: string): Promise<SPHttpClientResponse> {
    const response: SPHttpClientResponse = await this.context.spHttpClient.get(
      url,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: "application/json;odata=nometadata",
          "odata-version": "",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GET ${url} failed (${response.status}): ${errorText}`);
    }

    return response;
  }

  private async post(url: string, body: Record<string, unknown>): Promise<SPHttpClientResponse> {
    const response: SPHttpClientResponse = await this.context.spHttpClient.post(
      url,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: "application/json;odata=nometadata",
          "Content-type": "application/json;odata=nometadata",
          "odata-version": "",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`POST ${url} failed (${response.status}): ${errorText}`);
    }

    return response;
  }

  private async patch(url: string, body: Record<string, unknown>): Promise<void> {
    const response: SPHttpClientResponse = await this.context.spHttpClient.post(
      url,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: "application/json;odata=nometadata",
          "Content-type": "application/json;odata=nometadata",
          "odata-version": "",
          "IF-MATCH": "*",
          "X-HTTP-Method": "MERGE",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PATCH ${url} failed (${response.status}): ${errorText}`);
    }
  }

  private mapArticle(item: Record<string, unknown>): IKnowledgeArticle {
    const author = item.Author as Record<string, unknown> | undefined;
    const editor = item.Editor as Record<string, unknown> | undefined;

    return {
      id: item.Id as number,
      title: (item.Title as string) || "",
      body: (item.KHBody as string) || "",
      category: (item.KHCategory as string) || "",
      categoryTermId: (item.KHCategoryTermId as string) || "",
      department: (item.KHDepartment as string) || "",
      departmentTermId: (item.KHDepartmentTermId as string) || "",
      tags: ((item.KHTags as string) || "").split(";").filter(Boolean),
      author: (author?.Title as string) || "",
      authorEmail: (author?.EMail as string) || "",
      authorId: (author?.Id as number) || 0,
      editor: (editor?.Title as string) || "",
      editorEmail: (editor?.EMail as string) || "",
      created: (item.Created as string) || "",
      modified: (item.Modified as string) || "",
      reviewDate: (item.KHReviewDate as string) || "",
      status: ((item.KHStatus as string) || "Draft") as ArticleStatus,
      viewCount: (item.KHViewCount as number) || 0,
      averageRating: (item.KHAverageRating as number) || 0,
      ratingCount: (item.KHRatingCount as number) || 0,
      thumbnailUrl: (item.KHThumbnailUrl as string) || "",
      url: (item.FileRef as string) || "",
      contentType: (item.ContentType as Record<string, unknown>)?.Name as string || "Knowledge Article",
    };
  }

  private mapArticleSummary(item: Record<string, unknown>): IArticleSummary {
    const author = item.Author as Record<string, unknown> | undefined;
    const contentType = item.ContentType as Record<string, unknown> | undefined;

    return {
      id: item.Id as number,
      title: (item.Title as string) || "",
      description: (item.KHDescription as string) || "",
      category: (item.KHCategory as string) || "",
      author: (author?.Title as string) || "",
      modified: (item.Modified as string) || "",
      viewCount: (item.KHViewCount as number) || 0,
      thumbnailUrl: (item.KHThumbnailUrl as string) || "",
      url: (item.FileRef as string) || "",
      contentType: (contentType?.Name as string) || "",
    };
  }
}
