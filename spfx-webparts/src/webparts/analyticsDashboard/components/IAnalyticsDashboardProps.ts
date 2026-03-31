import { WebPartContext } from "@microsoft/sp-webpart-base";

export interface IAnalyticsDashboardProps {
  context: WebPartContext;
  dateRange: number;
  articleCount: number;
  chartType: "bar" | "horizontal" | "donut";
  articleListName: string;
  faqListName: string;
  showTopArticles: boolean;
  showSearchTerms: boolean;
  showContentFreshness: boolean;
  showAuthorContributions: boolean;
  showCategoryDistribution: boolean;
}

export interface IArticleMetric {
  id: number;
  title: string;
  viewCount: number;
  lastModified: Date;
}

export interface ISearchTermMetric {
  term: string;
  count: number;
}

export interface IFreshnessMetric {
  status: "current" | "due" | "overdue";
  count: number;
}

export interface IAuthorMetric {
  name: string;
  email: string;
  articleCount: number;
}

export interface ICategoryMetric {
  category: string;
  count: number;
  color: string;
}

export interface IAnalyticsDashboardState {
  isLoading: boolean;
  error: string | null;
  topArticles: IArticleMetric[];
  searchTerms: ISearchTermMetric[];
  freshness: IFreshnessMetric[];
  authors: IAuthorMetric[];
  categories: ICategoryMetric[];
  totalArticles: number;
  totalFaqs: number;
}
