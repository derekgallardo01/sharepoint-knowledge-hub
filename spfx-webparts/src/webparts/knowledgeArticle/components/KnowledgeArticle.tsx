import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  Card,
  CardHeader,
  Text,
  Body1,
  Caption1,
  Button,
  Spinner,
  Badge,
  Textarea,
  Divider,
  Avatar,
  Tooltip,
  MessageBar,
  MessageBarBody,
  tokens,
  makeStyles,
  shorthands,
} from "@fluentui/react-components";
import {
  ThumbLike24Regular,
  ThumbDislike24Regular,
  ThumbLike24Filled,
  ThumbDislike24Filled,
  Print24Regular,
  Clock24Regular,
  Person24Regular,
  Tag24Regular,
  Folder24Regular,
  Eye24Regular,
} from "@fluentui/react-icons";

import { IKnowledgeArticleProps } from "./IKnowledgeArticleProps";
import { KnowledgeService, IKnowledgeArticle, IArticleSummary, FeedbackRating } from "../../../services/KnowledgeService";
import styles from "./KnowledgeArticle.module.scss";

/**
 * Internal state for the KnowledgeArticle component.
 */
interface IKnowledgeArticleState {
  article: IKnowledgeArticle | null;
  relatedArticles: IArticleSummary[];
  loading: boolean;
  error: string;
  feedbackSubmitted: boolean;
  feedbackRating: FeedbackRating | null;
  feedbackComment: string;
  showFeedbackForm: boolean;
  feedbackStats: { helpful: number; notHelpful: number };
}

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    maxWidth: "1200px",
    marginLeft: "auto",
    marginRight: "auto",
    ...shorthands.padding("24px"),
  },
  contentArea: {
    display: "flex",
    ...shorthands.gap("32px"),
    "@media (max-width: 768px)": {
      flexDirection: "column",
    },
  },
  mainContent: {
    flex: "1 1 auto",
    minWidth: 0,
  },
  sidebar: {
    width: "300px",
    flexShrink: 0,
    "@media (max-width: 768px)": {
      width: "100%",
    },
  },
  metadataItem: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("8px"),
    ...shorthands.padding("8px", "0"),
  },
  articleBody: {
    lineHeight: "1.7",
    fontSize: "16px",
    "& img": {
      maxWidth: "100%",
      height: "auto",
    },
    "& table": {
      ...shorthands.borderColor(tokens.colorNeutralStroke1),
      borderCollapse: "collapse",
      width: "100%",
    },
    "& th, & td": {
      ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
      ...shorthands.padding("8px", "12px"),
      textAlign: "left",
    },
  },
  relatedCard: {
    cursor: "pointer",
    ":hover": {
      boxShadow: tokens.shadow8,
    },
  },
  feedbackSection: {
    ...shorthands.padding("24px"),
    ...shorthands.borderRadius("8px"),
    backgroundColor: tokens.colorNeutralBackground2,
    marginTop: "32px",
  },
  printButton: {
    "@media print": {
      display: "none",
    },
  },
});

/**
 * KnowledgeArticle component displays a full knowledge article with:
 * - Breadcrumb navigation (Home > Category > Subcategory > Article)
 * - Article content with rich HTML formatting
 * - Metadata sidebar (author, last updated, category, tags, view count)
 * - Related articles section
 * - User feedback widget (thumbs up/down + optional comment)
 * - Print-friendly view
 */
export const KnowledgeArticle: React.FC<IKnowledgeArticleProps> = (props) => {
  const fluentStyles = useStyles();
  const {
    context,
    articleId,
    showBreadcrumb,
    showRelatedArticles,
    showFeedback,
    relatedArticleCount,
    layoutStyle,
  } = props;

  const [state, setState] = useState<IKnowledgeArticleState>({
    article: null,
    relatedArticles: [],
    loading: true,
    error: "",
    feedbackSubmitted: false,
    feedbackRating: null,
    feedbackComment: "",
    showFeedbackForm: false,
    feedbackStats: { helpful: 0, notHelpful: 0 },
  });

  const knowledgeService = React.useMemo(() => new KnowledgeService(context), [context]);

  /**
   * Load article data, related articles, feedback stats, and increment view count.
   */
  const loadArticle = useCallback(async (): Promise<void> => {
    if (!articleId || articleId === 0) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "No article specified. Please select an article to view.",
      }));
      return;
    }

    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));

      const [article, feedbackData] = await Promise.all([
        knowledgeService.getArticle(articleId),
        knowledgeService.getArticleFeedback(articleId),
      ]);

      // Increment view count in background (fire-and-forget)
      knowledgeService.incrementViewCount(articleId).catch(() => {
        /* non-blocking */
      });

      let relatedArticles: IArticleSummary[] = [];
      if (showRelatedArticles) {
        relatedArticles = await knowledgeService.getRelatedArticles(
          articleId,
          relatedArticleCount
        );
      }

      setState((prev) => ({
        ...prev,
        article,
        relatedArticles,
        loading: false,
        feedbackStats: {
          helpful: feedbackData.helpful,
          notHelpful: feedbackData.notHelpful,
        },
      }));
    } catch (error) {
      console.error("[KnowledgeArticle] Failed to load article:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Failed to load the article. Please try again later.",
      }));
    }
  }, [articleId, knowledgeService, showRelatedArticles, relatedArticleCount]);

  useEffect(() => {
    loadArticle();
  }, [loadArticle]);

  /**
   * Handle user feedback submission.
   */
  const handleFeedback = async (rating: FeedbackRating): Promise<void> => {
    setState((prev) => ({ ...prev, feedbackRating: rating, showFeedbackForm: true }));
  };

  const submitFeedback = async (): Promise<void> => {
    if (!state.feedbackRating) return;

    try {
      await knowledgeService.submitFeedback(
        articleId,
        state.feedbackRating,
        state.feedbackComment
      );
      setState((prev) => ({
        ...prev,
        feedbackSubmitted: true,
        showFeedbackForm: false,
        feedbackStats: {
          helpful:
            prev.feedbackStats.helpful +
            (prev.feedbackRating === "Helpful" ? 1 : 0),
          notHelpful:
            prev.feedbackStats.notHelpful +
            (prev.feedbackRating === "NotHelpful" ? 1 : 0),
        },
      }));
    } catch {
      console.error("[KnowledgeArticle] Failed to submit feedback");
    }
  };

  const handlePrint = (): void => {
    window.print();
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // --- Render ---

  if (state.loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="large" label="Loading article..." />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={styles.errorContainer}>
        <MessageBar intent="error">
          <MessageBarBody>{state.error}</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  const article = state.article;
  if (!article) return null;

  const isWideLayout = layoutStyle === "wide";

  return (
    <div className={`${fluentStyles.root} ${styles.articleRoot}`}>
      {/* Breadcrumb Navigation */}
      {showBreadcrumb && (
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Breadcrumb>
            <BreadcrumbItem>
              <a href="/">Home</a>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            {article.category && (
              <>
                <BreadcrumbItem>
                  <a href={`/category/${encodeURIComponent(article.category)}`}>
                    {article.category}
                  </a>
                </BreadcrumbItem>
                <BreadcrumbDivider />
              </>
            )}
            <BreadcrumbItem>
              {article.title}
            </BreadcrumbItem>
          </Breadcrumb>
        </nav>
      )}

      {/* Print Button */}
      <div className={styles.actionBar}>
        <Tooltip content="Print this article" relationship="label">
          <Button
            className={fluentStyles.printButton}
            icon={<Print24Regular />}
            appearance="subtle"
            onClick={handlePrint}
          >
            Print
          </Button>
        </Tooltip>
        <Badge color="informative" appearance="outline">
          {article.status}
        </Badge>
      </div>

      {/* Main Content Area */}
      <div className={isWideLayout ? styles.wideLayout : fluentStyles.contentArea}>
        {/* Article Content */}
        <article className={fluentStyles.mainContent}>
          <h1 className={styles.articleTitle}>{article.title}</h1>

          <div className={styles.articleMeta}>
            <Caption1>
              By {article.author} | Updated {formatDate(article.modified)} |{" "}
              <Eye24Regular style={{ verticalAlign: "middle", width: 16, height: 16 }} />{" "}
              {article.viewCount} views
            </Caption1>
          </div>

          <Divider style={{ margin: "16px 0" }} />

          <div
            className={fluentStyles.articleBody}
            dangerouslySetInnerHTML={{ __html: article.body }}
          />
        </article>

        {/* Metadata Sidebar */}
        {!isWideLayout && (
          <aside className={fluentStyles.sidebar}>
            <Card>
              <CardHeader
                header={<Text weight="semibold">Article Details</Text>}
              />
              <div style={{ padding: "0 16px 16px" }}>
                <div className={fluentStyles.metadataItem}>
                  <Person24Regular />
                  <div>
                    <Caption1>Author</Caption1>
                    <Body1>{article.author}</Body1>
                  </div>
                </div>

                <div className={fluentStyles.metadataItem}>
                  <Clock24Regular />
                  <div>
                    <Caption1>Last Updated</Caption1>
                    <Body1>{formatDate(article.modified)}</Body1>
                  </div>
                </div>

                <div className={fluentStyles.metadataItem}>
                  <Folder24Regular />
                  <div>
                    <Caption1>Category</Caption1>
                    <Body1>{article.category}</Body1>
                  </div>
                </div>

                <div className={fluentStyles.metadataItem}>
                  <Folder24Regular />
                  <div>
                    <Caption1>Department</Caption1>
                    <Body1>{article.department}</Body1>
                  </div>
                </div>

                <div className={fluentStyles.metadataItem}>
                  <Tag24Regular />
                  <div>
                    <Caption1>Tags</Caption1>
                    <div className={styles.tagList}>
                      {article.tags.map((tag, idx) => (
                        <Badge key={idx} appearance="outline" color="brand" size="small">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {article.reviewDate && (
                  <div className={fluentStyles.metadataItem}>
                    <Clock24Regular />
                    <div>
                      <Caption1>Review Date</Caption1>
                      <Body1>{formatDate(article.reviewDate)}</Body1>
                    </div>
                  </div>
                )}

                <div className={fluentStyles.metadataItem}>
                  <Eye24Regular />
                  <div>
                    <Caption1>Views</Caption1>
                    <Body1>{article.viewCount.toLocaleString()}</Body1>
                  </div>
                </div>
              </div>
            </Card>
          </aside>
        )}
      </div>

      {/* Related Articles */}
      {showRelatedArticles && state.relatedArticles.length > 0 && (
        <section className={styles.relatedSection}>
          <Divider style={{ margin: "32px 0 24px" }} />
          <Text size={500} weight="semibold" block style={{ marginBottom: "16px" }}>
            Related Articles
          </Text>
          <div className={styles.relatedGrid}>
            {state.relatedArticles.map((related) => (
              <Card
                key={related.id}
                className={fluentStyles.relatedCard}
                onClick={() =>
                  (window.location.href = `?articleId=${related.id}`)
                }
              >
                <CardHeader
                  header={<Text weight="semibold">{related.title}</Text>}
                  description={
                    <Caption1>
                      {related.category} | {formatDate(related.modified)}
                    </Caption1>
                  }
                  image={
                    <Avatar
                      name={related.author}
                      size={32}
                      color="colorful"
                    />
                  }
                />
                <Body1 truncate style={{ padding: "0 16px 16px" }}>
                  {related.description}
                </Body1>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Feedback Widget */}
      {showFeedback && (
        <section className={fluentStyles.feedbackSection}>
          <Text size={400} weight="semibold" block style={{ marginBottom: "12px" }}>
            Was this article helpful?
          </Text>

          {state.feedbackSubmitted ? (
            <MessageBar intent="success">
              <MessageBarBody>Thank you for your feedback!</MessageBarBody>
            </MessageBar>
          ) : (
            <>
              <div className={styles.feedbackButtons}>
                <Button
                  icon={
                    state.feedbackRating === "Helpful" ? (
                      <ThumbLike24Filled />
                    ) : (
                      <ThumbLike24Regular />
                    )
                  }
                  appearance={
                    state.feedbackRating === "Helpful" ? "primary" : "outline"
                  }
                  onClick={() => handleFeedback("Helpful")}
                >
                  Helpful ({state.feedbackStats.helpful})
                </Button>
                <Button
                  icon={
                    state.feedbackRating === "NotHelpful" ? (
                      <ThumbDislike24Filled />
                    ) : (
                      <ThumbDislike24Regular />
                    )
                  }
                  appearance={
                    state.feedbackRating === "NotHelpful" ? "primary" : "outline"
                  }
                  onClick={() => handleFeedback("NotHelpful")}
                >
                  Not Helpful ({state.feedbackStats.notHelpful})
                </Button>
              </div>

              {state.showFeedbackForm && (
                <div className={styles.feedbackForm}>
                  <Textarea
                    placeholder="Optional: Tell us how we can improve this article..."
                    value={state.feedbackComment}
                    onChange={(_, data) =>
                      setState((prev) => ({
                        ...prev,
                        feedbackComment: data.value,
                      }))
                    }
                    resize="vertical"
                    style={{ width: "100%", marginTop: "12px" }}
                  />
                  <Button
                    appearance="primary"
                    onClick={submitFeedback}
                    style={{ marginTop: "8px" }}
                  >
                    Submit Feedback
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
};
