import { WebPartContext } from "@microsoft/sp-webpart-base";

/**
 * Properties for the RecentlyUpdated React component.
 */
export interface IRecentlyUpdatedProps {
  /** SPFx web part context for service initialization. */
  context: WebPartContext;
  /** Number of items to load per batch. */
  itemCount: number;
  /** SharePoint list names to pull recent updates from. */
  sourceLists: string[];
  /** Default time range filter. */
  defaultTimeRange: "today" | "week" | "month";
  /** Default view mode: compact (single-line) or detailed (expanded). */
  defaultViewMode: "compact" | "detailed";
}
