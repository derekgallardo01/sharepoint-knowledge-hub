import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  CardHeader,
  CardPreview,
  CardFooter,
  Text,
  Body1,
  Caption1,
  Badge,
  Button,
  Spinner,
  Tab,
  TabList,
  tokens,
  makeStyles,
  shorthands,
} from "@fluentui/react-components";
import {
  Star24Filled,
  DataTrending24Regular,
  Eye24Regular,
  Clock24Regular,
  ChevronLeft24Regular,
  ChevronRight24Regular,
  LayoutColumnTwoSplitRight24Regular,
  SlideGrid24Regular,
} from "@fluentui/react-icons";

import { IFeaturedContentProps } from "./IFeaturedContentProps";
import { SearchService, ISearchResult } from "../../../services/SearchService";
import styles from "./FeaturedContent.module.scss";

type ContentTab = "featured" | "trending";

interface IFeaturedContentState {
  featuredItems: ISearchResult[];
  trendingItems: ISearchResult[];
  activeTab: ContentTab;
  loading: boolean;
  error: string;
  carouselIndex: number;
  layoutMode: "grid" | "carousel";
}

const useStyles = makeStyles({
  root: {
    ...shorthands.padding("24px"),
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    flexWrap: "wrap",
    ...shorthands.gap("12px"),
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    ...shorthands.gap("20px"),
  },
  card: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    cursor: "pointer",
    transitionProperty: "transform, box-shadow",
    transitionDuration: "0.2s",
    transitionTimingFunction: "ease",
    ":hover": {
      transform: "translateY(-4px)",
      boxShadow: tokens.shadow16,
    },
  },
  cardPreview: {
    height: "160px",
    backgroundColor: tokens.colorBrandBackground2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  cardPlaceholder: {
    fontSize: "48px",
    color: tokens.colorBrandForeground2,
    opacity: 0.3,
  },
  categoryBadge: {
    position: "absolute",
    top: "8px",
    left: "8px",
  },
  carousel: {
    position: "relative",
    overflow: "hidden",
    ...shorthands.borderRadius("12px"),
  },
  carouselTrack: {
    display: "flex",
    transitionProperty: "transform",
    transitionDuration: "0.5s",
    transitionTimingFunction: "ease-in-out",
  },
  carouselSlide: {
    minWidth: "100%",
    ...shorthands.padding("0", "8px"),
    boxSizing: "border-box",
  },
  carouselNav: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    ...shorthands.gap("8px"),
    marginTop: "16px",
  },
  carouselDot: {
    width: "10px",
    height: "10px",
    ...shorthands.borderRadius("50%"),
    backgroundColor: tokens.colorNeutralStroke1,
    cursor: "pointer",
    ...shorthands.border("none"),
    ...shorthands.padding("0"),
    transitionProperty: "background-color",
    transitionDuration: "0.2s",
  },
  carouselDotActive: {
    backgroundColor: tokens.colorBrandBackground,
  },
  statsRow: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("12px"),
    color: tokens.colorNeutralForeground3,
  },
  statItem: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("4px"),
  },
});

/**
 * FeaturedContent component displays featured and trending knowledge content
 * in configurable grid or carousel layouts.
 *
 * Features:
 * - "Featured" and "Trending" tabs
 * - Grid layout with animated card hover effects
 * - Carousel layout with auto-rotation and manual navigation
 * - Content cards with thumbnails, category badges, descriptions, view counts
 * - Layout toggle between grid and carousel
 * - Responsive design
 */
export const FeaturedContent: React.FC<IFeaturedContentProps> = (props) => {
  const fluentStyles = useStyles();
  const {
    context,
    itemCount,
    layoutMode: defaultLayout,
    showTrending,
    autoRotate,
    rotateInterval,
  } = props;

  const searchService = React.useMemo(() => new SearchService(context), [context]);
  const carouselTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<IFeaturedContentState>({
    featuredItems: [],
    trendingItems: [],
    activeTab: "featured",
    loading: true,
    error: "",
    carouselIndex: 0,
    layoutMode: defaultLayout,
  });

  /**
   * Load featured (recent) and trending (popular) articles.
   */
  const loadContent = useCallback(async (): Promise<void> => {
    try {
      setState((prev) => ({ ...prev, loading: true }));

      const [featured, trending] = await Promise.all([
        searchService.getRecentArticles(itemCount),
        showTrending ? searchService.getPopularArticles(itemCount) : Promise.resolve([]),
      ]);

      setState((prev) => ({
        ...prev,
        featuredItems: featured,
        trendingItems: trending,
        loading: false,
      }));
    } catch (error) {
      console.error("[FeaturedContent] Failed to load content:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Failed to load content.",
      }));
    }
  }, [searchService, itemCount, showTrending]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // Carousel auto-rotation
  useEffect(() => {
    if (state.layoutMode === "carousel" && autoRotate) {
      const items =
        state.activeTab === "featured"
          ? state.featuredItems
          : state.trendingItems;
      if (items.length <= 1) return;

      carouselTimer.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          carouselIndex: (prev.carouselIndex + 1) % items.length,
        }));
      }, rotateInterval * 1000);

      return () => {
        if (carouselTimer.current) clearInterval(carouselTimer.current);
      };
    }
    return undefined;
  }, [
    state.layoutMode,
    state.activeTab,
    state.featuredItems.length,
    state.trendingItems.length,
    autoRotate,
    rotateInterval,
  ]);

  const currentItems =
    state.activeTab === "featured" ? state.featuredItems : state.trendingItems;

  const handleTabChange = (tab: ContentTab): void => {
    setState((prev) => ({ ...prev, activeTab: tab, carouselIndex: 0 }));
  };

  const handleCarouselPrev = (): void => {
    setState((prev) => ({
      ...prev,
      carouselIndex:
        prev.carouselIndex === 0
          ? currentItems.length - 1
          : prev.carouselIndex - 1,
    }));
  };

  const handleCarouselNext = (): void => {
    setState((prev) => ({
      ...prev,
      carouselIndex: (prev.carouselIndex + 1) % currentItems.length,
    }));
  };

  const toggleLayout = (): void => {
    setState((prev) => ({
      ...prev,
      layoutMode: prev.layoutMode === "grid" ? "carousel" : "grid",
      carouselIndex: 0,
    }));
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // --- Render ---

  if (state.loading) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spinner size="large" label="Loading content..." />
      </div>
    );
  }

  return (
    <div className={fluentStyles.root}>
      {/* Header */}
      <div className={fluentStyles.header}>
        <TabList
          selectedValue={state.activeTab}
          onTabSelect={(_, data) => handleTabChange(data.value as ContentTab)}
        >
          <Tab value="featured" icon={<Star24Filled />}>
            Featured
          </Tab>
          {showTrending && (
            <Tab value="trending" icon={<DataTrending24Regular />}>
              Trending
            </Tab>
          )}
        </TabList>

        <Button
          icon={
            state.layoutMode === "grid" ? (
              <SlideGrid24Regular />
            ) : (
              <LayoutColumnTwoSplitRight24Regular />
            )
          }
          appearance="subtle"
          onClick={toggleLayout}
        >
          {state.layoutMode === "grid" ? "Carousel" : "Grid"}
        </Button>
      </div>

      {/* Content */}
      {currentItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Text size={400} style={{ color: tokens.colorNeutralForeground3 }}>
            No content available.
          </Text>
        </div>
      ) : state.layoutMode === "grid" ? (
        /* Grid Layout */
        <div className={fluentStyles.grid}>
          {currentItems.map((item) => (
            <Card
              key={item.id}
              className={fluentStyles.card}
              onClick={() => (window.location.href = item.url)}
            >
              <CardPreview className={fluentStyles.cardPreview}>
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className={fluentStyles.cardImage}
                  />
                ) : (
                  <div className={fluentStyles.cardPlaceholder}>
                    {item.contentType === "FAQ Item" ? "?" : getInitials(item.title)}
                  </div>
                )}
                {item.category && (
                  <div className={fluentStyles.categoryBadge}>
                    <Badge appearance="filled" color="brand" size="small">
                      {item.category}
                    </Badge>
                  </div>
                )}
              </CardPreview>

              <CardHeader
                header={
                  <Text weight="semibold" size={400} truncate wrap={false}>
                    {item.title}
                  </Text>
                }
                description={
                  <Body1 truncate wrap={false} style={{ color: tokens.colorNeutralForeground3 }}>
                    {item.description}
                  </Body1>
                }
              />

              <CardFooter>
                <div className={fluentStyles.statsRow}>
                  <div className={fluentStyles.statItem}>
                    <Eye24Regular style={{ width: 16, height: 16 }} />
                    <Caption1>{item.viewCount}</Caption1>
                  </div>
                  <div className={fluentStyles.statItem}>
                    <Clock24Regular style={{ width: 16, height: 16 }} />
                    <Caption1>{formatDate(item.lastModified)}</Caption1>
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        /* Carousel Layout */
        <div className={fluentStyles.carousel}>
          <div
            className={fluentStyles.carouselTrack}
            style={{
              transform: `translateX(-${state.carouselIndex * 100}%)`,
            }}
          >
            {currentItems.map((item) => (
              <div key={item.id} className={fluentStyles.carouselSlide}>
                <Card
                  className={styles.carouselCard}
                  onClick={() => (window.location.href = item.url)}
                  style={{ cursor: "pointer" }}
                >
                  <div className={styles.carouselContent}>
                    <div className={styles.carouselImageArea}>
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: tokens.colorBrandBackground2,
                            fontSize: 64,
                            color: tokens.colorBrandForeground2,
                            opacity: 0.3,
                          }}
                        >
                          {getInitials(item.title)}
                        </div>
                      )}
                    </div>
                    <div className={styles.carouselTextArea}>
                      {item.category && (
                        <Badge appearance="filled" color="brand" size="medium" style={{ marginBottom: 12 }}>
                          {item.category}
                        </Badge>
                      )}
                      <Text size={600} weight="bold" block style={{ marginBottom: 8 }}>
                        {item.title}
                      </Text>
                      <Body1 block style={{ marginBottom: 16, color: tokens.colorNeutralForeground2 }}>
                        {item.description}
                      </Body1>
                      <div className={fluentStyles.statsRow}>
                        <div className={fluentStyles.statItem}>
                          <Eye24Regular style={{ width: 16, height: 16 }} />
                          <Caption1>{item.viewCount} views</Caption1>
                        </div>
                        <div className={fluentStyles.statItem}>
                          <Clock24Regular style={{ width: 16, height: 16 }} />
                          <Caption1>{formatDate(item.lastModified)}</Caption1>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>

          {/* Carousel Navigation */}
          <div className={fluentStyles.carouselNav}>
            <Button
              icon={<ChevronLeft24Regular />}
              appearance="subtle"
              onClick={handleCarouselPrev}
              size="small"
            />
            {currentItems.map((_, idx) => (
              <button
                key={idx}
                className={`${fluentStyles.carouselDot} ${
                  idx === state.carouselIndex ? fluentStyles.carouselDotActive : ""
                }`}
                onClick={() =>
                  setState((prev) => ({ ...prev, carouselIndex: idx }))
                }
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
            <Button
              icon={<ChevronRight24Regular />}
              appearance="subtle"
              onClick={handleCarouselNext}
              size="small"
            />
          </div>
        </div>
      )}
    </div>
  );
};

function getInitials(title: string): string {
  return title
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
