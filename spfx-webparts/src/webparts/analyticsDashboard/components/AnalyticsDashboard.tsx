import * as React from "react";
import styles from "./AnalyticsDashboard.module.scss";
import {
  IAnalyticsDashboardProps,
  IAnalyticsDashboardState,
  IArticleMetric,
  ISearchTermMetric,
  IFreshnessMetric,
  IAuthorMetric,
  ICategoryMetric,
} from "./IAnalyticsDashboardProps";
import { Spinner, SpinnerSize, MessageBar, MessageBarType } from "@fluentui/react";
import { SPHttpClient, SPHttpClientResponse } from "@microsoft/sp-http";

const CATEGORY_COLORS: string[] = [
  "#0078d4",
  "#107c10",
  "#d83b01",
  "#5c2d91",
  "#008272",
  "#ca5010",
  "#4f6bed",
  "#e81123",
  "#00b7c3",
  "#7a7574",
];

export class AnalyticsDashboard extends React.Component<
  IAnalyticsDashboardProps,
  IAnalyticsDashboardState
> {
  constructor(props: IAnalyticsDashboardProps) {
    super(props);
    this.state = {
      isLoading: true,
      error: null,
      topArticles: [],
      searchTerms: [],
      freshness: [],
      authors: [],
      categories: [],
      totalArticles: 0,
      totalFaqs: 0,
    };
  }

  public async componentDidMount(): Promise<void> {
    await this._loadData();
  }

  public async componentDidUpdate(prevProps: IAnalyticsDashboardProps): Promise<void> {
    if (
      prevProps.dateRange !== this.props.dateRange ||
      prevProps.articleCount !== this.props.articleCount ||
      prevProps.articleListName !== this.props.articleListName ||
      prevProps.faqListName !== this.props.faqListName
    ) {
      await this._loadData();
    }
  }

  public render(): React.ReactElement<IAnalyticsDashboardProps> {
    const { isLoading, error } = this.state;

    if (isLoading) {
      return (
        <div className={styles.analyticsDashboard}>
          <div className={styles.loadingContainer}>
            <Spinner size={SpinnerSize.large} label="Loading analytics data..." />
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className={styles.analyticsDashboard}>
          <div className={styles.errorContainer}>
            <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.analyticsDashboard}>
        {this._renderHeader()}
        {this._renderSummaryCards()}
        <div className={styles.sectionsGrid}>
          {this.props.showTopArticles && this._renderTopArticles()}
          {this.props.showSearchTerms && this._renderSearchTerms()}
          {this.props.showContentFreshness && this._renderContentFreshness()}
          {this.props.showAuthorContributions && this._renderAuthorContributions()}
          {this.props.showCategoryDistribution && this._renderCategoryDistribution()}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  private _renderHeader(): React.ReactElement {
    const { dateRange } = this.props;
    return (
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>Knowledge Hub Analytics</h2>
        <span className={styles.headerMeta}>Last {dateRange} days</span>
      </div>
    );
  }

  private _renderSummaryCards(): React.ReactElement {
    const { totalArticles, totalFaqs, topArticles, authors, freshness } = this.state;
    const totalViews = topArticles.reduce((sum, a) => sum + a.viewCount, 0);
    const overdueCount = freshness.find((f) => f.status === "overdue")?.count || 0;

    return (
      <div className={styles.summaryCards}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>{totalArticles}</span>
          <span className={styles.summaryLabel}>Total Articles</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>{totalFaqs}</span>
          <span className={styles.summaryLabel}>Total FAQs</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>{totalViews.toLocaleString()}</span>
          <span className={styles.summaryLabel}>Total Views</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>{authors.length}</span>
          <span className={styles.summaryLabel}>Contributors</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>{overdueCount}</span>
          <span className={styles.summaryLabel}>Overdue Reviews</span>
        </div>
      </div>
    );
  }

  private _renderTopArticles(): React.ReactElement {
    const { topArticles } = this.state;
    const { chartType } = this.props;
    const maxViews = Math.max(...topArticles.map((a) => a.viewCount), 1);

    return (
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Top Articles by Views</h3>
        {chartType === "horizontal" ? (
          <div className={styles.horizontalChart}>
            {topArticles.map((article) => (
              <div key={article.id} className={styles.horizontalRow}>
                <span className={styles.horizontalLabel} title={article.title}>
                  {article.title}
                </span>
                <div className={styles.horizontalBarTrack}>
                  <div
                    className={styles.horizontalBar}
                    style={{ width: `${(article.viewCount / maxViews) * 100}%` }}
                  />
                </div>
                <span className={styles.horizontalValue}>
                  {article.viewCount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.barChart}>
            {topArticles.map((article) => (
              <div key={article.id} className={styles.barWrapper}>
                <span className={styles.barValue}>{article.viewCount}</span>
                <div
                  className={styles.bar}
                  style={{ height: `${(article.viewCount / maxViews) * 100}%` }}
                  title={`${article.title}: ${article.viewCount} views`}
                />
                <span className={styles.barLabel} title={article.title}>
                  {article.title.length > 8
                    ? article.title.substring(0, 8) + "..."
                    : article.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  private _renderSearchTerms(): React.ReactElement {
    const { searchTerms } = this.state;
    const maxCount = Math.max(...searchTerms.map((t) => t.count), 1);

    return (
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Popular Search Terms</h3>
        <div className={styles.horizontalChart}>
          {searchTerms.map((term, idx) => (
            <div key={idx} className={styles.horizontalRow}>
              <span className={styles.horizontalLabel} title={term.term}>
                {term.term}
              </span>
              <div className={styles.horizontalBarTrack}>
                <div
                  className={styles.horizontalBar}
                  style={{
                    width: `${(term.count / maxCount) * 100}%`,
                    background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                  }}
                />
              </div>
              <span className={styles.horizontalValue}>{term.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  private _renderContentFreshness(): React.ReactElement {
    const { freshness } = this.state;
    const currentCount = freshness.find((f) => f.status === "current")?.count || 0;
    const dueCount = freshness.find((f) => f.status === "due")?.count || 0;
    const overdueCount = freshness.find((f) => f.status === "overdue")?.count || 0;

    return (
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Content Freshness</h3>
        <div className={styles.freshnessGrid}>
          <div className={`${styles.freshnessCard} ${styles.freshnessCurrent}`}>
            <span className={styles.freshnessCount} style={{ color: "#107c10" }}>
              {currentCount}
            </span>
            <span className={styles.freshnessLabel}>Current</span>
          </div>
          <div className={`${styles.freshnessCard} ${styles.freshnessDue}`}>
            <span className={styles.freshnessCount} style={{ color: "#d83b01" }}>
              {dueCount}
            </span>
            <span className={styles.freshnessLabel}>Due for Review</span>
          </div>
          <div className={`${styles.freshnessCard} ${styles.freshnessOverdue}`}>
            <span className={styles.freshnessCount} style={{ color: "#a80000" }}>
              {overdueCount}
            </span>
            <span className={styles.freshnessLabel}>Overdue</span>
          </div>
        </div>
      </div>
    );
  }

  private _renderAuthorContributions(): React.ReactElement {
    const { authors } = this.state;
    const maxArticles = Math.max(...authors.map((a) => a.articleCount), 1);

    return (
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Author Contributions</h3>
        <div className={styles.horizontalChart}>
          {authors.slice(0, 10).map((author, idx) => (
            <div key={idx} className={styles.horizontalRow}>
              <span className={styles.horizontalLabel} title={author.name}>
                {author.name}
              </span>
              <div className={styles.horizontalBarTrack}>
                <div
                  className={styles.horizontalBar}
                  style={{
                    width: `${(author.articleCount / maxArticles) * 100}%`,
                    background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                  }}
                />
              </div>
              <span className={styles.horizontalValue}>{author.articleCount}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  private _renderCategoryDistribution(): React.ReactElement {
    const { categories } = this.state;
    const total = categories.reduce((sum, c) => sum + c.count, 0);
    const { chartType } = this.props;

    if (chartType === "donut") {
      return (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Category Distribution</h3>
          <div className={styles.donutContainer}>
            <div
              className={styles.donut}
              style={{ background: this._buildConicGradient(categories, total) }}
            >
              <div className={styles.donutHole}>
                <span className={styles.donutTotal}>{total}</span>
                <span className={styles.donutTotalLabel}>Total</span>
              </div>
            </div>
            <div className={styles.legend}>
              {categories.map((cat, idx) => (
                <div key={idx} className={styles.legendItem}>
                  <div
                    className={styles.legendSwatch}
                    style={{ background: cat.color }}
                  />
                  <span>
                    {cat.category} ({cat.count})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Default: horizontal bar
    const maxCount = Math.max(...categories.map((c) => c.count), 1);
    return (
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Category Distribution</h3>
        <div className={styles.horizontalChart}>
          {categories.map((cat, idx) => (
            <div key={idx} className={styles.horizontalRow}>
              <span className={styles.horizontalLabel} title={cat.category}>
                {cat.category}
              </span>
              <div className={styles.horizontalBarTrack}>
                <div
                  className={styles.horizontalBar}
                  style={{
                    width: `${(cat.count / maxCount) * 100}%`,
                    background: cat.color,
                  }}
                />
              </div>
              <span className={styles.horizontalValue}>{cat.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private async _loadData(): Promise<void> {
    this.setState({ isLoading: true, error: null });

    try {
      const [articles, faqs] = await Promise.all([
        this._getListItems(this.props.articleListName),
        this._getListItems(this.props.faqListName),
      ]);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.props.dateRange);

      const filteredArticles = articles.filter(
        (item: Record<string, unknown>) =>
          new Date(item["Modified"] as string) >= cutoffDate
      );

      this.setState({
        isLoading: false,
        topArticles: this._computeTopArticles(filteredArticles),
        searchTerms: this._computeSearchTerms(),
        freshness: this._computeFreshness(articles),
        authors: this._computeAuthors(articles),
        categories: this._computeCategories(articles),
        totalArticles: articles.length,
        totalFaqs: faqs.length,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load analytics data.";
      this.setState({ isLoading: false, error: message });
    }
  }

  private async _getListItems(listName: string): Promise<Record<string, unknown>[]> {
    const siteUrl = this.props.context.pageContext.web.absoluteUrl;
    const url = `${siteUrl}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$top=5000&$select=Id,Title,Modified,Author/Title,Author/EMail,ViewCount,Category,ReviewDate&$expand=Author`;

    const response: SPHttpClientResponse = await this.props.context.spHttpClient.get(
      url,
      SPHttpClient.configurations.v1,
      { headers: { Accept: "application/json;odata=nometadata" } }
    );

    if (!response.ok) {
      throw new Error(`Failed to load list "${listName}": ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  // ---------------------------------------------------------------------------
  // Data computation
  // ---------------------------------------------------------------------------

  private _computeTopArticles(
    items: Record<string, unknown>[]
  ): IArticleMetric[] {
    return items
      .map((item) => ({
        id: item["Id"] as number,
        title: (item["Title"] as string) || "Untitled",
        viewCount: (item["ViewCount"] as number) || 0,
        lastModified: new Date(item["Modified"] as string),
      }))
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, this.props.articleCount);
  }

  private _computeSearchTerms(): ISearchTermMetric[] {
    // Search analytics are not directly available via REST.
    // In production, integrate with the SharePoint Search Analytics API
    // or a custom search logging list. Returning placeholder data.
    return [
      { term: "onboarding", count: 142 },
      { term: "VPN setup", count: 98 },
      { term: "expense report", count: 87 },
      { term: "password reset", count: 76 },
      { term: "remote access", count: 65 },
      { term: "benefits", count: 54 },
      { term: "org chart", count: 48 },
      { term: "PTO policy", count: 41 },
      { term: "IT support", count: 37 },
      { term: "compliance training", count: 29 },
    ];
  }

  private _computeFreshness(
    items: Record<string, unknown>[]
  ): IFreshnessMetric[] {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    let current = 0;
    let due = 0;
    let overdue = 0;

    items.forEach((item) => {
      const reviewDateStr = item["ReviewDate"] as string;
      if (!reviewDateStr) {
        current++;
        return;
      }
      const reviewDate = new Date(reviewDateStr);
      if (reviewDate < now) {
        overdue++;
      } else if (reviewDate <= thirtyDaysFromNow) {
        due++;
      } else {
        current++;
      }
    });

    return [
      { status: "current", count: current },
      { status: "due", count: due },
      { status: "overdue", count: overdue },
    ];
  }

  private _computeAuthors(
    items: Record<string, unknown>[]
  ): IAuthorMetric[] {
    const authorMap = new Map<string, IAuthorMetric>();

    items.forEach((item) => {
      const author = item["Author"] as Record<string, string> | undefined;
      if (!author) return;
      const email = author["EMail"] || "unknown";
      const name = author["Title"] || email;

      if (authorMap.has(email)) {
        authorMap.get(email)!.articleCount++;
      } else {
        authorMap.set(email, { name, email, articleCount: 1 });
      }
    });

    return Array.from(authorMap.values())
      .sort((a, b) => b.articleCount - a.articleCount);
  }

  private _computeCategories(
    items: Record<string, unknown>[]
  ): ICategoryMetric[] {
    const catMap = new Map<string, number>();

    items.forEach((item) => {
      const category = (item["Category"] as string) || "Uncategorized";
      catMap.set(category, (catMap.get(category) || 0) + 1);
    });

    return Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, count], idx) => ({
        category,
        count,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      }));
  }

  // ---------------------------------------------------------------------------
  // Chart helpers
  // ---------------------------------------------------------------------------

  private _buildConicGradient(
    categories: ICategoryMetric[],
    total: number
  ): string {
    if (total === 0) return "#edebe9";

    const segments: string[] = [];
    let currentDeg = 0;

    categories.forEach((cat) => {
      const sliceDeg = (cat.count / total) * 360;
      segments.push(`${cat.color} ${currentDeg}deg ${currentDeg + sliceDeg}deg`);
      currentDeg += sliceDeg;
    });

    return `conic-gradient(${segments.join(", ")})`;
  }
}
