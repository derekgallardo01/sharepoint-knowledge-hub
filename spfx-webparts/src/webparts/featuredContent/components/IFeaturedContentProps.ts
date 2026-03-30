import { WebPartContext } from "@microsoft/sp-webpart-base";

/**
 * Properties for the FeaturedContent React component.
 */
export interface IFeaturedContentProps {
  /** SPFx web part context for service initialization. */
  context: WebPartContext;
  /** Name of the SharePoint list to pull content from. */
  contentSource: string;
  /** Number of featured items to display. */
  itemCount: number;
  /** Layout mode: grid of cards or rotating carousel. */
  layoutMode: "grid" | "carousel";
  /** Whether to include a "Trending" tab alongside "Featured". */
  showTrending: boolean;
  /** Whether the carousel should auto-rotate. */
  autoRotate: boolean;
  /** Seconds between carousel rotations. */
  rotateInterval: number;
}
