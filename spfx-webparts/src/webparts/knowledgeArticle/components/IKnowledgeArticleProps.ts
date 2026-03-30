import { WebPartContext } from "@microsoft/sp-webpart-base";

/**
 * Properties for the KnowledgeArticle React component.
 */
export interface IKnowledgeArticleProps {
  /** SPFx web part context for service initialization. */
  context: WebPartContext;
  /** The SharePoint list item ID of the article to display. */
  articleId: number;
  /** Name of the SharePoint list containing knowledge articles. */
  articleListName: string;
  /** Whether to show the breadcrumb navigation bar. */
  showBreadcrumb: boolean;
  /** Whether to display the related articles section. */
  showRelatedArticles: boolean;
  /** Whether to show the user feedback widget. */
  showFeedback: boolean;
  /** Maximum number of related articles to display. */
  relatedArticleCount: number;
  /** Layout style: standard (sidebar), wide (full-width), or compact. */
  layoutStyle: "standard" | "wide" | "compact";
}
