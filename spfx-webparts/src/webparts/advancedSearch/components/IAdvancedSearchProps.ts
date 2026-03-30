import { WebPartContext } from "@microsoft/sp-webpart-base";

/**
 * Properties for the AdvancedSearch React component.
 */
export interface IAdvancedSearchProps {
  /** SPFx web part context for service initialization. */
  context: WebPartContext;
  /** Number of results to display per page. */
  resultsPerPage: number;
  /** Whether to show the refiner/filter panel. */
  showRefiners: boolean;
  /** Whether to enable typeahead search suggestions. */
  showSuggestions: boolean;
  /** Whether to display recent search history. */
  showSearchHistory: boolean;
  /** Optional result source GUID to scope search. */
  resultSourceId: string;
  /** Pre-populated search query from URL or parent component. */
  initialQuery: string;
}
