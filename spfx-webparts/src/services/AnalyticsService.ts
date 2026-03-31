/**
 * AnalyticsService - Content analytics tracker for the Knowledge Hub.
 *
 * Tracks user interactions with knowledge content in a privacy-aware manner:
 *   - Page views with session deduplication
 *   - Search queries (what users search for, result counts)
 *   - Article feedback (helpful / not helpful)
 *   - Time-on-page estimates via Page Visibility API
 *
 * Design:
 *   - Batch writes to SharePoint list every 30 seconds to minimize API overhead
 *   - Session deduplication: same article view counted once per browser session
 *   - Privacy-aware: no PII stored, no user identifiers, configurable opt-out
 *   - Dashboard aggregation methods for the Analytics Dashboard web part
 */

import { SPFI } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnalyticsEventType = "pageView" | "search" | "feedback" | "timeOnPage";

export interface IAnalyticsEvent {
  eventType: AnalyticsEventType;
  timestamp: string;
  sessionId: string;
  articleId?: number;
  articleTitle?: string;
  category?: string;
  department?: string;
  searchQuery?: string;
  searchResultCount?: number;
  feedbackHelpful?: boolean;
  timeOnPageSeconds?: number;
}

export interface IAnalyticsConfig {
  /** SharePoint list name for analytics events. Default: "KH Analytics Events". */
  listName: string;
  /** Batch interval in ms. Default: 30,000. */
  batchIntervalMs: number;
  /** Max events per batch. Default: 50. */
  maxBatchSize: number;
  /** Enable tracking. Default: true. */
  enabled: boolean;
}

export interface ITopArticle {
  articleId: number;
  title: string;
  category: string;
  views: number;
  helpfulRate: number;
}

export interface ISearchTermAggregate {
  query: string;
  count: number;
  avgResults: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: IAnalyticsConfig = {
  listName: "KH Analytics Events",
  batchIntervalMs: 30_000,
  maxBatchSize: 50,
  enabled: true,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class AnalyticsService {
  private readonly _sp: SPFI;
  private readonly _config: IAnalyticsConfig;
  private _queue: IAnalyticsEvent[] = [];
  private _batchTimer: number | null = null;
  private _sessionId: string;
  private _viewedArticles: Set<number> = new Set();
  private _currentArticleId: number | null = null;
  private _pageEntryTime = 0;

  constructor(sp: SPFI, config?: Partial<IAnalyticsConfig>) {
    this._sp = sp;
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._sessionId = this._getOrCreateSession();
  }

  // ---- Lifecycle -----------------------------------------------------------

  /** Start batch timer and register lifecycle hooks. */
  public start(): void {
    if (!this._isEnabled()) return;

    this._batchTimer = window.setInterval(() => {
      this._flush();
    }, this._config.batchIntervalMs);

    // Flush + record time on page when user navigates away
    window.addEventListener("beforeunload", this._onBeforeUnload);
    document.addEventListener("visibilitychange", this._onVisibilityChange);
  }

  /** Stop tracking and flush remaining events. */
  public async stop(): Promise<void> {
    if (this._batchTimer !== null) {
      clearInterval(this._batchTimer);
      this._batchTimer = null;
    }
    window.removeEventListener("beforeunload", this._onBeforeUnload);
    document.removeEventListener("visibilitychange", this._onVisibilityChange);

    this._recordTimeOnPage();
    await this._flush();
  }

  // ---- Tracking Methods ----------------------------------------------------

  /**
   * Track a page view. Deduplicated per article per session.
   */
  public trackPageView(
    articleId: number,
    articleTitle: string,
    category?: string,
    department?: string
  ): void {
    if (!this._isEnabled()) return;

    // Record time on previous page
    this._recordTimeOnPage();

    // Session deduplication
    if (this._viewedArticles.has(articleId)) {
      this._currentArticleId = articleId;
      this._pageEntryTime = Date.now();
      return;
    }

    this._viewedArticles.add(articleId);
    this._currentArticleId = articleId;
    this._pageEntryTime = Date.now();

    this._enqueue({
      eventType: "pageView",
      timestamp: new Date().toISOString(),
      sessionId: this._sessionId,
      articleId,
      articleTitle: articleTitle.substring(0, 255),
      category,
      department,
    });
  }

  /**
   * Track a search query.
   */
  public trackSearch(query: string, resultCount: number): void {
    if (!this._isEnabled() || !query || query.trim().length < 2) return;

    this._enqueue({
      eventType: "search",
      timestamp: new Date().toISOString(),
      sessionId: this._sessionId,
      searchQuery: query.trim().substring(0, 200),
      searchResultCount: resultCount,
    });
  }

  /**
   * Track article feedback (helpful / not helpful).
   */
  public trackFeedback(
    articleId: number,
    articleTitle: string,
    helpful: boolean,
    category?: string
  ): void {
    if (!this._isEnabled()) return;

    this._enqueue({
      eventType: "feedback",
      timestamp: new Date().toISOString(),
      sessionId: this._sessionId,
      articleId,
      articleTitle: articleTitle.substring(0, 255),
      feedbackHelpful: helpful,
      category,
    });
  }

  // ---- Opt-Out Management --------------------------------------------------

  public isOptedOut(): boolean {
    try { return localStorage.getItem("kh_analytics_optout") === "1"; }
    catch { return false; }
  }

  public setOptOut(optOut: boolean): void {
    try {
      if (optOut) localStorage.setItem("kh_analytics_optout", "1");
      else localStorage.removeItem("kh_analytics_optout");
    } catch { /* noop */ }
  }

  // ---- Dashboard Data Aggregation ------------------------------------------

  /**
   * Get top articles by view count within a date range.
   */
  public async getTopArticles(days: number = 30, top: number = 10): Promise<ITopArticle[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const [views, feedback] = await Promise.all([
      this._sp.web.lists.getByTitle(this._config.listName).items
        .filter(`EventType eq 'pageView' and EventTimestamp ge '${since}'`)
        .select("ArticleId", "ArticleTitle", "Category")
        .top(5000)(),
      this._sp.web.lists.getByTitle(this._config.listName).items
        .filter(`EventType eq 'feedback' and EventTimestamp ge '${since}'`)
        .select("ArticleId", "FeedbackHelpful")
        .top(5000)(),
    ]);

    // Aggregate views
    const viewMap = new Map<number, { title: string; category: string; count: number }>();
    for (const v of views) {
      const existing = viewMap.get(v.ArticleId);
      if (existing) existing.count++;
      else viewMap.set(v.ArticleId, { title: v.ArticleTitle, category: v.Category || "Uncategorized", count: 1 });
    }

    // Aggregate feedback
    const fbMap = new Map<number, { helpful: number; total: number }>();
    for (const f of feedback) {
      const existing = fbMap.get(f.ArticleId);
      if (existing) { if (f.FeedbackHelpful) existing.helpful++; existing.total++; }
      else fbMap.set(f.ArticleId, { helpful: f.FeedbackHelpful ? 1 : 0, total: 1 });
    }

    // Combine
    const results: ITopArticle[] = [];
    for (const [id, data] of viewMap.entries()) {
      const fb = fbMap.get(id);
      results.push({
        articleId: id,
        title: data.title,
        category: data.category,
        views: data.count,
        helpfulRate: fb ? Math.round((fb.helpful / fb.total) * 100) : 0,
      });
    }

    return results.sort((a, b) => b.views - a.views).slice(0, top);
  }

  /**
   * Get popular search terms with frequency and avg result count.
   */
  public async getPopularSearchTerms(days: number = 30, top: number = 20): Promise<ISearchTermAggregate[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const events = await this._sp.web.lists.getByTitle(this._config.listName).items
      .filter(`EventType eq 'search' and EventTimestamp ge '${since}'`)
      .select("SearchQuery", "SearchResultCount")
      .top(5000)();

    const map = new Map<string, { count: number; totalResults: number }>();
    for (const e of events) {
      const q = (e.SearchQuery || "").toLowerCase().trim();
      if (!q) continue;
      const existing = map.get(q);
      if (existing) { existing.count++; existing.totalResults += e.SearchResultCount || 0; }
      else map.set(q, { count: 1, totalResults: e.SearchResultCount || 0 });
    }

    return Array.from(map.entries())
      .map(([query, d]) => ({ query, count: d.count, avgResults: Math.round(d.totalResults / d.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, top);
  }

  // ---- Private -------------------------------------------------------------

  private _isEnabled(): boolean {
    return this._config.enabled && !this.isOptedOut();
  }

  private _enqueue(event: IAnalyticsEvent): void {
    this._queue.push(event);
    if (this._queue.length >= this._config.maxBatchSize) this._flush();
  }

  private _recordTimeOnPage(): void {
    if (this._currentArticleId === null || this._pageEntryTime === 0) return;
    const seconds = Math.round((Date.now() - this._pageEntryTime) / 1000);
    if (seconds >= 3 && seconds <= 1800) {
      this._enqueue({
        eventType: "timeOnPage",
        timestamp: new Date().toISOString(),
        sessionId: this._sessionId,
        articleId: this._currentArticleId,
        timeOnPageSeconds: seconds,
      });
    }
    this._pageEntryTime = 0;
  }

  private async _flush(): Promise<void> {
    if (this._queue.length === 0) return;
    const batch = this._queue.splice(0, this._config.maxBatchSize);
    const list = this._sp.web.lists.getByTitle(this._config.listName);

    try {
      await Promise.all(batch.map((event) =>
        list.items.add({
          Title: `${event.eventType}_${event.sessionId.substring(0, 8)}`,
          EventType: event.eventType,
          EventTimestamp: event.timestamp,
          SessionId: event.sessionId,
          ArticleId: event.articleId ?? null,
          ArticleTitle: event.articleTitle ?? null,
          Category: event.category ?? null,
          Department: event.department ?? null,
          SearchQuery: event.searchQuery ?? null,
          SearchResultCount: event.searchResultCount ?? null,
          FeedbackHelpful: event.feedbackHelpful ?? null,
          TimeOnPageSeconds: event.timeOnPageSeconds ?? null,
        })
      ));
    } catch {
      // Re-queue for next attempt
      this._queue.unshift(...batch);
    }
  }

  private _getOrCreateSession(): string {
    const key = "kh_session";
    let id = sessionStorage.getItem(key);
    if (!id) {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      id = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  // Arrow functions to preserve `this` when used as event handlers
  private _onBeforeUnload = (): void => {
    this._recordTimeOnPage();
    // Best-effort sync flush
    if (this._queue.length > 0) {
      this._flush();
    }
  };

  private _onVisibilityChange = (): void => {
    if (document.hidden) {
      this._recordTimeOnPage();
    } else if (this._currentArticleId !== null) {
      this._pageEntryTime = Date.now();
    }
  };
}
