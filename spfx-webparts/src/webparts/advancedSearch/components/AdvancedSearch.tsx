import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Input,
  Button,
  Card,
  CardHeader,
  Text,
  Body1,
  Caption1,
  Badge,
  Spinner,
  Divider,
  Checkbox,
  RadioGroup,
  Radio,
  Dropdown,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  MessageBar,
  MessageBarBody,
  tokens,
  makeStyles,
  shorthands,
} from "@fluentui/react-components";
import {
  Search24Regular,
  Dismiss24Regular,
  ArrowSort24Regular,
  Filter24Regular,
  History24Regular,
  ChevronLeft24Regular,
  ChevronRight24Regular,
  DocumentText24Regular,
} from "@fluentui/react-icons";

import { IAdvancedSearchProps } from "./IAdvancedSearchProps";
import {
  SearchService,
  ISearchResult,
  IRefiner,
  IRefinerFilter,
  ISearchSuggestion,
  ISortOption,
} from "../../services/SearchService";
import styles from "./AdvancedSearch.module.scss";

type SortKey = "relevance" | "date" | "popularity";

interface ISearchState {
  query: string;
  results: ISearchResult[];
  refiners: IRefiner[];
  activeFilters: IRefinerFilter[];
  totalRows: number;
  currentPage: number;
  sortBy: SortKey;
  loading: boolean;
  error: string;
  suggestions: ISearchSuggestion[];
  showSuggestions: boolean;
  searchHistory: string[];
  hasSearched: boolean;
  spellingSuggestion: string;
}

const useStyles = makeStyles({
  root: {
    maxWidth: "1200px",
    marginLeft: "auto",
    marginRight: "auto",
    ...shorthands.padding("24px"),
  },
  searchBar: {
    display: "flex",
    ...shorthands.gap("8px"),
    marginBottom: "24px",
    position: "relative",
  },
  searchInput: {
    flex: "1 1 auto",
  },
  layout: {
    display: "flex",
    ...shorthands.gap("24px"),
    "@media (max-width: 768px)": {
      flexDirection: "column",
    },
  },
  refinerPanel: {
    width: "260px",
    flexShrink: 0,
    "@media (max-width: 768px)": {
      width: "100%",
    },
  },
  resultsPanel: {
    flex: "1 1 auto",
    minWidth: 0,
  },
  resultCard: {
    marginBottom: "12px",
    cursor: "pointer",
    ":hover": {
      boxShadow: tokens.shadow8,
    },
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    ...shorthands.gap("8px"),
    marginTop: "24px",
  },
  suggestionsDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    ...shorthands.borderRadius("4px"),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
    maxHeight: "300px",
    overflowY: "auto",
  },
  suggestionItem: {
    ...shorthands.padding("8px", "16px"),
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    flexWrap: "wrap",
    ...shorthands.gap("8px"),
  },
  noResults: {
    textAlign: "center" as const,
    ...shorthands.padding("48px", "24px"),
  },
  refinerSection: {
    marginBottom: "16px",
  },
});

const SORT_OPTIONS: Record<SortKey, ISortOption | undefined> = {
  relevance: undefined, // default relevance sort
  date: { property: "LastModifiedTime", direction: "descending" },
  popularity: { property: "ViewsLifeTime", direction: "descending" },
};

const SEARCH_HISTORY_KEY = "kh_search_history";
const MAX_HISTORY = 10;

/**
 * AdvancedSearch component provides a full-featured search experience:
 * - Search input with debounced typeahead suggestions
 * - Refiner panel with faceted filters (Category, Department, Content Type, Date)
 * - Paginated results with hit highlighting
 * - Sort options (Relevance, Date, Popularity)
 * - "No results" state with helpful suggestions
 * - Search history tracking
 */
export const AdvancedSearch: React.FC<IAdvancedSearchProps> = (props) => {
  const fluentStyles = useStyles();
  const {
    context,
    resultsPerPage,
    showRefiners,
    showSuggestions: enableSuggestions,
    showSearchHistory,
    initialQuery,
  } = props;

  const searchService = React.useMemo(() => new SearchService(context), [context]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<ISearchState>({
    query: initialQuery || "",
    results: [],
    refiners: [],
    activeFilters: [],
    totalRows: 0,
    currentPage: 1,
    sortBy: "relevance",
    loading: false,
    error: "",
    suggestions: [],
    showSuggestions: false,
    searchHistory: loadSearchHistory(),
    hasSearched: false,
    spellingSuggestion: "",
  });

  /**
   * Execute search with current query, filters, sort, and page.
   */
  const executeSearch = useCallback(
    async (
      query: string,
      filters: IRefinerFilter[],
      page: number,
      sortBy: SortKey
    ): Promise<void> => {
      if (!query.trim()) {
        setState((prev) => ({
          ...prev,
          results: [],
          refiners: [],
          totalRows: 0,
          hasSearched: false,
        }));
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: "" }));

      try {
        const response = await searchService.searchArticles(
          query,
          filters.length > 0 ? filters : undefined,
          page,
          resultsPerPage,
          SORT_OPTIONS[sortBy]
        );

        setState((prev) => ({
          ...prev,
          results: response.results,
          refiners: response.refiners,
          totalRows: response.totalRows,
          spellingSuggestion: response.spellingSuggestion,
          loading: false,
          hasSearched: true,
        }));

        // Save to search history
        saveToHistory(query);
      } catch (error) {
        console.error("[AdvancedSearch] Search failed:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Search failed. Please try again.",
          hasSearched: true,
        }));
      }
    },
    [searchService, resultsPerPage]
  );

  // Auto-search if initial query provided
  useEffect(() => {
    if (initialQuery) {
      executeSearch(initialQuery, [], 1, "relevance");
    }
  }, [initialQuery, executeSearch]);

  /**
   * Handle search input changes with debounced suggestions.
   */
  const handleQueryChange = (value: string): void => {
    setState((prev) => ({ ...prev, query: value }));

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (enableSuggestions && value.length >= 3) {
      debounceTimer.current = setTimeout(async () => {
        try {
          const suggestions = await searchService.getSuggestions(value);
          setState((prev) => ({
            ...prev,
            suggestions,
            showSuggestions: suggestions.length > 0,
          }));
        } catch {
          // Suggestion failures are non-blocking
        }
      }, 300);
    } else {
      setState((prev) => ({ ...prev, suggestions: [], showSuggestions: false }));
    }
  };

  const handleSearch = (): void => {
    setState((prev) => ({ ...prev, currentPage: 1, showSuggestions: false }));
    executeSearch(state.query, state.activeFilters, 1, state.sortBy);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter") {
      handleSearch();
    }
    if (e.key === "Escape") {
      setState((prev) => ({ ...prev, showSuggestions: false }));
    }
  };

  const handleSuggestionClick = (suggestion: string): void => {
    setState((prev) => ({
      ...prev,
      query: suggestion,
      showSuggestions: false,
      currentPage: 1,
    }));
    executeSearch(suggestion, state.activeFilters, 1, state.sortBy);
  };

  const handleRefinerToggle = (refinerName: string, value: string): void => {
    setState((prev) => {
      const existing = prev.activeFilters.find((f) => f.name === refinerName);
      let newFilters: IRefinerFilter[];

      if (existing) {
        const hasValue = existing.values.includes(value);
        const newValues = hasValue
          ? existing.values.filter((v) => v !== value)
          : [...existing.values, value];

        if (newValues.length === 0) {
          newFilters = prev.activeFilters.filter((f) => f.name !== refinerName);
        } else {
          newFilters = prev.activeFilters.map((f) =>
            f.name === refinerName ? { ...f, values: newValues } : f
          );
        }
      } else {
        newFilters = [...prev.activeFilters, { name: refinerName, values: [value] }];
      }

      executeSearch(prev.query, newFilters, 1, prev.sortBy);
      return { ...prev, activeFilters: newFilters, currentPage: 1 };
    });
  };

  const handleSortChange = (sortBy: SortKey): void => {
    setState((prev) => ({ ...prev, sortBy, currentPage: 1 }));
    executeSearch(state.query, state.activeFilters, 1, sortBy);
  };

  const handlePageChange = (page: number): void => {
    setState((prev) => ({ ...prev, currentPage: page }));
    executeSearch(state.query, state.activeFilters, page, state.sortBy);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearFilters = (): void => {
    setState((prev) => ({ ...prev, activeFilters: [], currentPage: 1 }));
    executeSearch(state.query, [], 1, state.sortBy);
  };

  const handleHistoryClick = (historyQuery: string): void => {
    setState((prev) => ({ ...prev, query: historyQuery, currentPage: 1 }));
    executeSearch(historyQuery, state.activeFilters, 1, state.sortBy);
  };

  const totalPages = Math.ceil(state.totalRows / resultsPerPage);
  const isRefinerActive = (refinerName: string, value: string): boolean => {
    const filter = state.activeFilters.find((f) => f.name === refinerName);
    return filter ? filter.values.includes(value) : false;
  };

  return (
    <div className={fluentStyles.root}>
      {/* Search Bar */}
      <div className={fluentStyles.searchBar}>
        <Input
          ref={searchInputRef}
          className={fluentStyles.searchInput}
          contentBefore={<Search24Regular />}
          contentAfter={
            state.query ? (
              <Button
                icon={<Dismiss24Regular />}
                appearance="transparent"
                size="small"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    query: "",
                    results: [],
                    hasSearched: false,
                  }))
                }
              />
            ) : undefined
          }
          placeholder="Search knowledge articles, FAQs, policies..."
          value={state.query}
          onChange={(_, data) => handleQueryChange(data.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (state.suggestions.length > 0) {
              setState((prev) => ({ ...prev, showSuggestions: true }));
            }
          }}
          onBlur={() => {
            // Delay to allow suggestion clicks
            setTimeout(() => {
              setState((prev) => ({ ...prev, showSuggestions: false }));
            }, 200);
          }}
          size="large"
        />
        <Button appearance="primary" icon={<Search24Regular />} onClick={handleSearch} size="large">
          Search
        </Button>

        {/* Suggestions Dropdown */}
        {state.showSuggestions && state.suggestions.length > 0 && (
          <div className={fluentStyles.suggestionsDropdown}>
            {state.suggestions.map((s, idx) => (
              <div
                key={idx}
                className={fluentStyles.suggestionItem}
                onClick={() => handleSuggestionClick(s.query)}
                role="option"
              >
                <Text size={300}>
                  <Search24Regular style={{ width: 14, height: 14, marginRight: 8, verticalAlign: "middle" }} />
                  {s.query}
                  {s.isPersonal && (
                    <Caption1 style={{ marginLeft: 8, color: tokens.colorNeutralForeground3 }}>
                      (recent)
                    </Caption1>
                  )}
                </Text>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spelling Suggestion */}
      {state.spellingSuggestion && (
        <div style={{ marginBottom: 16 }}>
          <Text>
            Did you mean:{" "}
            <Button
              appearance="transparent"
              onClick={() => handleSuggestionClick(state.spellingSuggestion)}
              style={{ fontStyle: "italic" }}
            >
              {state.spellingSuggestion}
            </Button>
          </Text>
        </div>
      )}

      {/* Search History */}
      {showSearchHistory && !state.hasSearched && state.searchHistory.length > 0 && (
        <div className={styles.historySection}>
          <Text size={400} weight="semibold">
            <History24Regular style={{ verticalAlign: "middle", marginRight: 8 }} />
            Recent Searches
          </Text>
          <div className={styles.historyList}>
            {state.searchHistory.map((h, idx) => (
              <Badge
                key={idx}
                appearance="outline"
                style={{ cursor: "pointer", margin: "4px" }}
                onClick={() => handleHistoryClick(h)}
              >
                {h}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Results Area */}
      {state.hasSearched && (
        <div className={fluentStyles.layout}>
          {/* Refiner Panel */}
          {showRefiners && state.refiners.length > 0 && (
            <aside className={fluentStyles.refinerPanel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text size={400} weight="semibold">
                  <Filter24Regular style={{ verticalAlign: "middle", marginRight: 4 }} />
                  Filters
                </Text>
                {state.activeFilters.length > 0 && (
                  <Button appearance="transparent" size="small" onClick={clearFilters}>
                    Clear all
                  </Button>
                )}
              </div>

              {state.refiners.map((refiner) => (
                <div key={refiner.name} className={fluentStyles.refinerSection}>
                  <Text weight="semibold" size={300} block style={{ marginBottom: 8 }}>
                    {formatRefinerName(refiner.name)}
                  </Text>
                  {refiner.values.slice(0, 10).map((rv) => (
                    <Checkbox
                      key={rv.token}
                      label={`${rv.value} (${rv.count})`}
                      checked={isRefinerActive(refiner.name, rv.value)}
                      onChange={() => handleRefinerToggle(refiner.name, rv.value)}
                      style={{ display: "block", marginBottom: 4 }}
                    />
                  ))}
                  <Divider style={{ margin: "12px 0" }} />
                </div>
              ))}
            </aside>
          )}

          {/* Results Panel */}
          <main className={fluentStyles.resultsPanel}>
            {/* Toolbar */}
            <div className={fluentStyles.toolbar}>
              <Caption1>
                {state.totalRows > 0
                  ? `${state.totalRows.toLocaleString()} results found`
                  : "No results found"}
              </Caption1>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ArrowSort24Regular />
                <Dropdown
                  value={state.sortBy === "relevance" ? "Relevance" : state.sortBy === "date" ? "Date" : "Popularity"}
                  onOptionSelect={(_, data) => handleSortChange(data.optionValue as SortKey)}
                  style={{ minWidth: 140 }}
                >
                  <Option value="relevance">Relevance</Option>
                  <Option value="date">Date</Option>
                  <Option value="popularity">Popularity</Option>
                </Dropdown>
              </div>
            </div>

            {/* Loading */}
            {state.loading && (
              <div style={{ textAlign: "center", padding: 48 }}>
                <Spinner size="large" label="Searching..." />
              </div>
            )}

            {/* Error */}
            {state.error && (
              <MessageBar intent="error" style={{ marginBottom: 16 }}>
                <MessageBarBody>{state.error}</MessageBarBody>
              </MessageBar>
            )}

            {/* Results */}
            {!state.loading && !state.error && state.results.length > 0 && (
              <>
                {state.results.map((result) => (
                  <Card
                    key={result.id}
                    className={fluentStyles.resultCard}
                    onClick={() => (window.location.href = result.url)}
                  >
                    <CardHeader
                      image={<DocumentText24Regular />}
                      header={
                        <Text weight="semibold" size={400}>
                          <a
                            href={result.url}
                            onClick={(e) => e.stopPropagation()}
                            className={styles.resultLink}
                          >
                            {result.title}
                          </a>
                        </Text>
                      }
                      description={
                        <Caption1>
                          {result.url}
                        </Caption1>
                      }
                    />
                    <div style={{ padding: "0 16px 12px" }}>
                      <Body1>
                        <span
                          dangerouslySetInnerHTML={{
                            __html: result.hitHighlightedSummary || result.description,
                          }}
                        />
                      </Body1>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {result.category && (
                          <Badge appearance="tint" color="brand" size="small">
                            {result.category}
                          </Badge>
                        )}
                        {result.contentType && (
                          <Badge appearance="outline" size="small">
                            {result.contentType}
                          </Badge>
                        )}
                        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                          {result.author} | {formatDate(result.lastModified)} | {result.viewCount} views
                        </Caption1>
                      </div>
                    </div>
                  </Card>
                ))}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className={fluentStyles.pagination}>
                    <Button
                      icon={<ChevronLeft24Regular />}
                      appearance="subtle"
                      disabled={state.currentPage <= 1}
                      onClick={() => handlePageChange(state.currentPage - 1)}
                    />
                    {generatePageNumbers(state.currentPage, totalPages).map((pageNum, idx) =>
                      pageNum === -1 ? (
                        <Text key={`ellipsis-${idx}`}>...</Text>
                      ) : (
                        <Button
                          key={pageNum}
                          appearance={pageNum === state.currentPage ? "primary" : "subtle"}
                          onClick={() => handlePageChange(pageNum)}
                          size="small"
                        >
                          {pageNum}
                        </Button>
                      )
                    )}
                    <Button
                      icon={<ChevronRight24Regular />}
                      appearance="subtle"
                      disabled={state.currentPage >= totalPages}
                      onClick={() => handlePageChange(state.currentPage + 1)}
                    />
                  </div>
                )}
              </>
            )}

            {/* No Results */}
            {!state.loading && !state.error && state.hasSearched && state.results.length === 0 && (
              <div className={fluentStyles.noResults}>
                <Search24Regular style={{ width: 48, height: 48, color: tokens.colorNeutralForeground3 }} />
                <Text size={500} weight="semibold" block style={{ marginTop: 16 }}>
                  No results found
                </Text>
                <Body1 block style={{ marginTop: 8, color: tokens.colorNeutralForeground3 }}>
                  Try adjusting your search terms or removing filters.
                </Body1>
                <div style={{ marginTop: 16 }}>
                  <Text size={300} block>Suggestions:</Text>
                  <ul style={{ textAlign: "left", display: "inline-block", marginTop: 8 }}>
                    <li>Check your spelling</li>
                    <li>Use more general keywords</li>
                    <li>Remove some filters</li>
                    <li>Try searching for related topics</li>
                  </ul>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function formatRefinerName(name: string): string {
  const map: Record<string, string> = {
    Category: "Category",
    Department: "Department",
    ContentType: "Content Type",
    LastModifiedTime: "Date Range",
    AuthorOWSUSER: "Author",
  };
  return map[name] || name;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function generatePageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: number[] = [1];
  if (current > 3) pages.push(-1); // ellipsis
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push(-1); // ellipsis
  pages.push(total);

  return pages;
}

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToHistory(query: string): void {
  try {
    const history = loadSearchHistory().filter((h) => h !== query);
    history.unshift(query);
    localStorage.setItem(
      SEARCH_HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_HISTORY))
    );
  } catch {
    // localStorage unavailable
  }
}
