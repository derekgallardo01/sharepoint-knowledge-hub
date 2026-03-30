import { WebPartContext } from "@microsoft/sp-webpart-base";

/**
 * Properties for the FaqAccordion React component.
 */
export interface IFaqAccordionProps {
  /** SPFx web part context for service initialization. */
  context: WebPartContext;
  /** Name of the SharePoint list containing FAQ items. */
  faqListName: string;
  /** Optional default category to pre-filter on load. */
  defaultCategory: string;
  /** Whether to show the search/filter input at the top. */
  showSearch: boolean;
  /** Whether to display helpful/not-helpful feedback buttons per FAQ item. */
  showFeedback: boolean;
  /** Whether to expand the first accordion item by default. */
  expandFirst: boolean;
}
