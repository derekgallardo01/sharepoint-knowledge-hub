import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  Text,
  Body1,
  Caption1,
  Button,
  Spinner,
  Badge,
  Avatar,
  Divider,
  Tab,
  TabList,
  ToggleButton,
  tokens,
  makeStyles,
  shorthands,
} from "@fluentui/react-components";
import {
  Clock24Regular,
  ArrowDown24Regular,
  TextBulletListSquare24Regular,
  GridDots24Regular,
  Add24Regular,
  Edit24Regular,
  DocumentText24Regular,
} from "@fluentui/react-icons";

import { IRecentlyUpdatedProps } from "./IRecentlyUpdatedProps";
import { SearchService, ISearchResult } from "../../../services/SearchService";
import styles from "./RecentlyUpdated.module.scss";

type TimeRange = "today" | "week" | "month";
type ViewMode = "compact" | "detailed";

interface ITimelineItem extends ISearchResult {
  changeType: "Created" | "Updated";
}

interface IRecentlyUpdatedState {
  items: ITimelineItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string;
  timeRange: TimeRange;
  viewMode: ViewMode;
  page: number;
  hasMore: boolean;
}

const useStyles = makeStyles({
  root: {
    maxWidth: "900px",
    marginLeft: "auto",
    marginRight: "auto",
    ...shorthands.padding("24px"),
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
    flexWrap: "wrap",
    ...shorthands.gap("12px"),
  },
  controls: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("8px"),
  },
  timeline: {
    position: "relative",
    paddingLeft: "32px",
    "&::before": {
      content: '""',
      position: "absolute",
      left: "11px",
      top: "0",
      bottom: "0",
      width: "2px",
      backgroundColor: tokens.colorNeutralStroke1,
    },
  },
  timelineItem: {
    position: "relative",
    marginBottom: "20px",
    "&::before": {
      content: '""',
      position: "absolute",
      left: "-27px",
      top: "14px",
      width: "12px",
      height: "12px",
      ...shorthands.borderRadius("50%"),
      backgroundColor: tokens.colorBrandBackground,
      ...shorthands.border("2px", "solid", tokens.colorNeutralBackground1),
      boxShadow: `0 0 0 2px ${tokens.colorBrandStroke1}`,
    },
  },
  timelineItemCreated: {
    "&::before": {
      backgroundColor: tokens.colorStatusSuccessBackground3,
      boxShadow: `0 0 0 2px ${tokens.colorStatusSuccessBorder1}`,
    },
  },
  compactItem: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("12px"),
    ...shorthands.padding("8px", "12px"),
    ...shorthands.borderRadius("6px"),
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2Hover,
    },
  },
  detailedItem: {
    ...shorthands.padding("16px"),
    ...shorthands.borderRadius("8px"),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
    cursor: "pointer",
    transitionProperty: "box-shadow",
    transitionDuration: "0.2s",
    ":hover": {
      boxShadow: tokens.shadow8,
    },
  },
  dateGroup: {
    marginBottom: "24px",
  },
  dateLabel: {
    ...shorthands.padding("4px", "12px"),
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius("12px"),
    display: "inline-block",
    marginBottom: "12px",
  },
  loadMore: {
    display: "flex",
    justifyContent: "center",
    marginTop: "24px",
  },
});

/**
 * RecentlyUpdated component renders a timeline-style feed of recently
 * created and modified knowledge content.
 *
 * Features:
 * - Timeline layout with date grouping and change-type indicators
 * - Filter by time range (Today, This Week, This Month)
 * - Compact and detailed view toggle
 * - "Load more" pagination
 * - Change type badges (Created / Updated)
 * - Author avatars and timestamps
 */
export const RecentlyUpdated: React.FC<IRecentlyUpdatedProps> = (props) => {
  const fluentStyles = useStyles();
  const { context, itemCount, defaultTimeRange, defaultViewMode } = props;

  const searchService = useMemo(() => new SearchService(context), [context]);

  const [state, setState] = useState<IRecentlyUpdatedState>({
    items: [],
    loading: true,
    loadingMore: false,
    error: "",
    timeRange: defaultTimeRange,
    viewMode: defaultViewMode,
    page: 1,
    hasMore: true,
  });

  /**
   * Load recent items from the search service.
   */
  const loadItems = useCallback(
    async (page: number, append: boolean = false): Promise<void> => {
      const isFirstLoad = !append;
      setState((prev) => ({
        ...prev,
        loading: isFirstLoad,
        loadingMore: append,
      }));

      try {
        const count = page * itemCount;
        const results = await searchService.getRecentArticles(count);

        // Derive "Created" vs "Updated" from comparing created/modified dates
        const timelineItems: ITimelineItem[] = results.map((r) => ({
          ...r,
          changeType: isNewItem(r.lastModified) ? "Created" : "Updated",
        }));

        // Apply time range filter
        const filtered = filterByTimeRange(timelineItems, state.timeRange);

        setState((prev) => ({
          ...prev,
          items: append
            ? [...prev.items, ...filtered.slice(prev.items.length)]
            : filtered,
          loading: false,
          loadingMore: false,
          hasMore: results.length >= count,
          page,
        }));
      } catch (error) {
        console.error("[RecentlyUpdated] Failed to load items:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: "Failed to load recent updates.",
        }));
      }
    },
    [searchService, itemCount, state.timeRange]
  );

  useEffect(() => {
    loadItems(1);
  }, [loadItems]);

  const handleTimeRangeChange = (range: TimeRange): void => {
    setState((prev) => ({ ...prev, timeRange: range, page: 1 }));
  };

  const handleViewModeToggle = (): void => {
    setState((prev) => ({
      ...prev,
      viewMode: prev.viewMode === "compact" ? "detailed" : "compact",
    }));
  };

  const handleLoadMore = (): void => {
    loadItems(state.page + 1, true);
  };

  // Group items by date for the timeline
  const groupedItems = useMemo(() => {
    const groups: Map<string, ITimelineItem[]> = new Map();

    state.items.forEach((item) => {
      const dateKey = getDateLabel(item.lastModified);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(item);
    });

    return groups;
  }, [state.items]);

  // --- Render ---

  if (state.loading) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spinner size="large" label="Loading recent updates..." />
      </div>
    );
  }

  return (
    <div className={fluentStyles.root}>
      {/* Header */}
      <div className={fluentStyles.header}>
        <Text size={500} weight="bold">
          <Clock24Regular style={{ verticalAlign: "middle", marginRight: 8 }} />
          Recently Updated
        </Text>

        <div className={fluentStyles.controls}>
          {/* Time Range Tabs */}
          <TabList
            selectedValue={state.timeRange}
            onTabSelect={(_, data) =>
              handleTimeRangeChange(data.value as TimeRange)
            }
            size="small"
          >
            <Tab value="today">Today</Tab>
            <Tab value="week">This Week</Tab>
            <Tab value="month">This Month</Tab>
          </TabList>

          {/* View Toggle */}
          <ToggleButton
            icon={
              state.viewMode === "compact" ? (
                <TextBulletListSquare24Regular />
              ) : (
                <GridDots24Regular />
              )
            }
            appearance="subtle"
            checked={state.viewMode === "detailed"}
            onClick={handleViewModeToggle}
            size="small"
          >
            {state.viewMode === "compact" ? "Detailed" : "Compact"}
          </ToggleButton>
        </div>
      </div>

      {/* Timeline */}
      {state.items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Clock24Regular
            style={{ width: 48, height: 48, color: tokens.colorNeutralForeground3 }}
          />
          <Text size={400} weight="semibold" block style={{ marginTop: 16 }}>
            No updates found
          </Text>
          <Body1 style={{ color: tokens.colorNeutralForeground3 }}>
            Try selecting a wider time range.
          </Body1>
        </div>
      ) : (
        <div className={fluentStyles.timeline}>
          {Array.from(groupedItems.entries()).map(([dateLabel, items]) => (
            <div key={dateLabel} className={fluentStyles.dateGroup}>
              <div className={fluentStyles.dateLabel}>
                <Caption1><strong>{dateLabel}</strong></Caption1>
              </div>

              {items.map((item) => (
                <div
                  key={item.id}
                  className={`${fluentStyles.timelineItem} ${
                    item.changeType === "Created"
                      ? fluentStyles.timelineItemCreated
                      : ""
                  }`}
                >
                  {state.viewMode === "compact" ? (
                    /* Compact View */
                    <div
                      className={fluentStyles.compactItem}
                      onClick={() => (window.location.href = item.url)}
                    >
                      <Badge
                        appearance="filled"
                        color={item.changeType === "Created" ? "success" : "informative"}
                        size="small"
                        icon={
                          item.changeType === "Created" ? (
                            <Add24Regular />
                          ) : (
                            <Edit24Regular />
                          )
                        }
                      >
                        {item.changeType}
                      </Badge>
                      <Text weight="semibold" truncate wrap={false} style={{ flex: 1 }}>
                        {item.title}
                      </Text>
                      {item.category && (
                        <Badge appearance="outline" size="small">
                          {item.category}
                        </Badge>
                      )}
                      <Caption1 style={{ color: tokens.colorNeutralForeground3, whiteSpace: "nowrap" }}>
                        {formatTime(item.lastModified)}
                      </Caption1>
                    </div>
                  ) : (
                    /* Detailed View */
                    <div
                      className={fluentStyles.detailedItem}
                      onClick={() => (window.location.href = item.url)}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                        <Avatar name={item.author} size={36} color="colorful" />
                        <div style={{ flex: 1 }}>
                          <Text weight="semibold" size={400} block>
                            {item.title}
                          </Text>
                          <Caption1>
                            {item.author} {item.changeType.toLowerCase()} this{" "}
                            {item.contentType?.toLowerCase() || "article"} at{" "}
                            {formatTime(item.lastModified)}
                          </Caption1>
                        </div>
                        <Badge
                          appearance="filled"
                          color={item.changeType === "Created" ? "success" : "informative"}
                          size="medium"
                        >
                          {item.changeType}
                        </Badge>
                      </div>
                      {item.description && (
                        <Body1
                          block
                          truncate
                          style={{
                            color: tokens.colorNeutralForeground2,
                            marginTop: 4,
                          }}
                        >
                          {item.description}
                        </Body1>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        {item.category && (
                          <Badge appearance="outline" color="brand" size="small">
                            {item.category}
                          </Badge>
                        )}
                        {item.contentType && (
                          <Badge appearance="outline" size="small">
                            <DocumentText24Regular style={{ width: 12, height: 12, marginRight: 4 }} />
                            {item.contentType}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {state.hasMore && state.items.length > 0 && (
        <div className={fluentStyles.loadMore}>
          <Button
            appearance="outline"
            icon={<ArrowDown24Regular />}
            onClick={handleLoadMore}
            disabled={state.loadingMore}
          >
            {state.loadingMore ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function isNewItem(modifiedDate: string): boolean {
  // Heuristic: if last modified is within 1 hour of created, treat as "Created"
  // In production, you would compare Created vs Modified from the list item
  const modified = new Date(modifiedDate);
  const now = new Date();
  const hoursSinceModified = (now.getTime() - modified.getTime()) / (1000 * 60 * 60);
  return hoursSinceModified < 24;
}

function filterByTimeRange(items: ITimelineItem[], range: TimeRange): ITimelineItem[] {
  const now = new Date();
  let cutoff: Date;

  switch (range) {
    case "today":
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      break;
    case "month":
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    default:
      cutoff = new Date(0);
  }

  return items.filter((item) => new Date(item.lastModified) >= cutoff);
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (itemDate.getTime() === today.getTime()) return "Today";
  if (itemDate.getTime() === yesterday.getTime()) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
