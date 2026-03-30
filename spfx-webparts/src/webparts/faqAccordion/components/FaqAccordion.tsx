import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Input,
  Button,
  Badge,
  Spinner,
  Text,
  Body1,
  Caption1,
  Divider,
  MessageBar,
  MessageBarBody,
  tokens,
  makeStyles,
  shorthands,
} from "@fluentui/react-components";
import {
  Search24Regular,
  ThumbLike20Regular,
  ThumbDislike20Regular,
  ThumbLike20Filled,
  ThumbDislike20Filled,
  QuestionCircle24Regular,
  Mail24Regular,
} from "@fluentui/react-icons";

import { IFaqAccordionProps } from "./IFaqAccordionProps";
import { KnowledgeService, IFaqItem } from "../../services/KnowledgeService";
import styles from "./FaqAccordion.module.scss";

interface IFaqAccordionState {
  allItems: IFaqItem[];
  categories: string[];
  activeCategory: string;
  searchQuery: string;
  loading: boolean;
  error: string;
  feedbackGiven: Set<number>;
}

const useStyles = makeStyles({
  root: {
    maxWidth: "900px",
    marginLeft: "auto",
    marginRight: "auto",
    ...shorthands.padding("24px"),
  },
  header: {
    marginBottom: "24px",
  },
  searchBar: {
    marginBottom: "20px",
    maxWidth: "500px",
  },
  categoryPills: {
    display: "flex",
    flexWrap: "wrap",
    ...shorthands.gap("8px"),
    marginBottom: "24px",
  },
  categoryPill: {
    cursor: "pointer",
    transitionProperty: "all",
    transitionDuration: "0.2s",
  },
  accordionItem: {
    marginBottom: "8px",
    ...shorthands.borderRadius("8px"),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
    overflow: "hidden",
  },
  accordionHeader: {
    fontWeight: 600,
  },
  accordionPanel: {
    ...shorthands.padding("16px", "24px", "20px"),
    lineHeight: "1.7",
    "& a": {
      color: tokens.colorBrandForeground1,
    },
  },
  feedbackRow: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("8px"),
    marginTop: "16px",
    ...shorthands.padding("12px", "0", "0"),
    ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2),
  },
  emptyState: {
    textAlign: "center" as const,
    ...shorthands.padding("48px", "24px"),
  },
  suggestLink: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("8px"),
    marginTop: "24px",
    ...shorthands.padding("16px"),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius("8px"),
  },
});

/**
 * FaqAccordion component displays FAQ items in an interactive,
 * collapsible accordion with:
 * - Search filter for filtering questions
 * - Category pills/tabs for category-based filtering
 * - Smooth expand/collapse animations via Fluent UI Accordion
 * - Per-item "Was this helpful?" feedback buttons
 * - "Suggest a question" link
 */
export const FaqAccordion: React.FC<IFaqAccordionProps> = (props) => {
  const fluentStyles = useStyles();
  const { context, defaultCategory, showSearch, showFeedback, expandFirst } = props;

  const knowledgeService = useMemo(() => new KnowledgeService(context), [context]);

  const [state, setState] = useState<IFaqAccordionState>({
    allItems: [],
    categories: [],
    activeCategory: defaultCategory || "All",
    searchQuery: "",
    loading: true,
    error: "",
    feedbackGiven: new Set<number>(),
  });

  /**
   * Load FAQ items and extract unique categories.
   */
  const loadFaqs = useCallback(async (): Promise<void> => {
    try {
      setState((prev) => ({ ...prev, loading: true }));

      const [items, categories] = await Promise.all([
        knowledgeService.getFaqItems(),
        knowledgeService.getFaqCategories(),
      ]);

      setState((prev) => ({
        ...prev,
        allItems: items,
        categories: ["All", ...categories],
        loading: false,
      }));
    } catch (error) {
      console.error("[FaqAccordion] Failed to load FAQs:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Failed to load FAQ items. Please try again.",
      }));
    }
  }, [knowledgeService]);

  useEffect(() => {
    loadFaqs();
  }, [loadFaqs]);

  /**
   * Filter items by active category and search query.
   */
  const filteredItems = useMemo((): IFaqItem[] => {
    let items = state.allItems;

    // Category filter
    if (state.activeCategory && state.activeCategory !== "All") {
      items = items.filter((item) => item.category === state.activeCategory);
    }

    // Search filter
    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.question.toLowerCase().includes(query) ||
          item.answer.toLowerCase().includes(query)
      );
    }

    return items;
  }, [state.allItems, state.activeCategory, state.searchQuery]);

  const handleCategoryChange = (category: string): void => {
    setState((prev) => ({ ...prev, activeCategory: category }));
  };

  const handleSearchChange = (value: string): void => {
    setState((prev) => ({ ...prev, searchQuery: value }));
  };

  const handleFeedback = async (faqId: number, helpful: boolean): Promise<void> => {
    try {
      await knowledgeService.submitFaqFeedback(faqId, helpful);
      setState((prev) => ({
        ...prev,
        feedbackGiven: new Set(prev.feedbackGiven).add(faqId),
        allItems: prev.allItems.map((item) => {
          if (item.id !== faqId) return item;
          return {
            ...item,
            helpfulCount: helpful ? item.helpfulCount + 1 : item.helpfulCount,
            notHelpfulCount: helpful ? item.notHelpfulCount : item.notHelpfulCount + 1,
          };
        }),
      }));
    } catch {
      console.error("[FaqAccordion] Feedback submission failed");
    }
  };

  // Determine default open items
  const defaultOpenItems = expandFirst && filteredItems.length > 0 ? [filteredItems[0].id.toString()] : [];

  // --- Render ---

  if (state.loading) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spinner size="large" label="Loading FAQs..." />
      </div>
    );
  }

  if (state.error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{state.error}</MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={fluentStyles.root}>
      {/* Header */}
      <div className={fluentStyles.header}>
        <Text size={600} weight="bold" block>
          <QuestionCircle24Regular style={{ verticalAlign: "middle", marginRight: 8 }} />
          Frequently Asked Questions
        </Text>
      </div>

      {/* Search Filter */}
      {showSearch && (
        <div className={fluentStyles.searchBar}>
          <Input
            contentBefore={<Search24Regular />}
            placeholder="Search questions..."
            value={state.searchQuery}
            onChange={(_, data) => handleSearchChange(data.value)}
            style={{ width: "100%" }}
          />
        </div>
      )}

      {/* Category Pills */}
      {state.categories.length > 1 && (
        <div className={fluentStyles.categoryPills}>
          {state.categories.map((cat) => (
            <Badge
              key={cat}
              appearance={state.activeCategory === cat ? "filled" : "outline"}
              color={state.activeCategory === cat ? "brand" : "informative"}
              className={fluentStyles.categoryPill}
              size="large"
              onClick={() => handleCategoryChange(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      )}

      {/* FAQ Accordion */}
      {filteredItems.length === 0 ? (
        <div className={fluentStyles.emptyState}>
          <QuestionCircle24Regular
            style={{ width: 48, height: 48, color: tokens.colorNeutralForeground3 }}
          />
          <Text size={400} weight="semibold" block style={{ marginTop: 16 }}>
            No matching questions found
          </Text>
          <Body1 block style={{ marginTop: 8, color: tokens.colorNeutralForeground3 }}>
            Try adjusting your search or selecting a different category.
          </Body1>
        </div>
      ) : (
        <Accordion
          defaultOpenItems={defaultOpenItems}
          collapsible
          multiple
        >
          {filteredItems.map((item) => (
            <AccordionItem
              key={item.id}
              value={item.id.toString()}
              className={fluentStyles.accordionItem}
            >
              <AccordionHeader className={fluentStyles.accordionHeader} size="large">
                {item.question}
              </AccordionHeader>
              <AccordionPanel className={fluentStyles.accordionPanel}>
                <div dangerouslySetInnerHTML={{ __html: item.answer }} />

                {/* Feedback */}
                {showFeedback && (
                  <div className={fluentStyles.feedbackRow}>
                    {state.feedbackGiven.has(item.id) ? (
                      <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                        Thank you for your feedback!
                      </Caption1>
                    ) : (
                      <>
                        <Caption1>Was this helpful?</Caption1>
                        <Button
                          icon={<ThumbLike20Regular />}
                          appearance="subtle"
                          size="small"
                          onClick={() => handleFeedback(item.id, true)}
                        >
                          Yes ({item.helpfulCount})
                        </Button>
                        <Button
                          icon={<ThumbDislike20Regular />}
                          appearance="subtle"
                          size="small"
                          onClick={() => handleFeedback(item.id, false)}
                        >
                          No ({item.notHelpfulCount})
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Suggest a Question */}
      <div className={fluentStyles.suggestLink}>
        <Mail24Regular />
        <div>
          <Text weight="semibold" block>
            Can't find what you're looking for?
          </Text>
          <Body1>
            <a href="mailto:knowledgehub@company.com?subject=FAQ Suggestion">
              Suggest a question
            </a>{" "}
            and our team will add it to the knowledge base.
          </Body1>
        </div>
      </div>
    </div>
  );
};
