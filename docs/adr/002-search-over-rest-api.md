# ADR-002: SharePoint Search API over Direct List Queries for Content Discovery

**Status:** Accepted
**Date:** 2025-09-15
**Decision Makers:** Solutions Architect, SharePoint Platform Team Lead

## Context

The Knowledge Hub aggregates content from multiple associated sites (see [ADR-001](./001-hub-site-architecture.md)). Users need to:

- Search across all knowledge content from the hub home page
- Filter results by category, department, content type, and date
- See relevance-ranked results with highlighted keyword matches
- Get search suggestions as they type
- Browse search verticals (Articles, Policies, Training, FAQs)

Two approaches were evaluated for content discovery:

1. **Direct list queries** -- Use REST API (`/_api/web/lists`) or CAML queries to fetch items from each associated site, then merge and rank results client-side
2. **SharePoint Search API** -- Use the Search REST API (`/_api/search/query`) with a custom result source scoped to the hub

## Decision

We will use the **SharePoint Search API** as the primary content discovery mechanism.

All cross-site content aggregation, search, filtering, and ranking will go through the Search REST API with a custom result source scoped to the hub site. Direct list queries are only used for single-item CRUD operations on known lists (e.g., loading an article by ID, submitting feedback).

## Rationale

### Why Search API (Chosen)

- **Cross-site aggregation** -- A single query returns results from all hub-associated sites without needing to know individual site URLs
- **Relevance ranking** -- Built-in BM25 ranking algorithm considers title, body, metadata, recency, and click-through signals
- **Managed properties** -- Custom managed properties (`KnowledgeCategoryOWSTEXT`, `KnowledgeDepartmentOWSTEXT`) enable typed filtering without parsing raw field values
- **Refiners** -- Native refiner support (`refiners='Category,Department,ContentType'`) returns faceted counts without additional queries
- **Query suggestions** -- Pre-query and post-query suggestions surface popular and recent search terms
- **Result sources** -- A custom result source scoped to `contentclass:STS_ListItem` within the hub scope eliminates noise from system pages, images, and other non-content items
- **Search verticals** -- Server-side verticals (Articles, Policies, Training, FAQs) filter results by content type without client-side processing
- **Performance at scale** -- Search index is pre-computed; query latency is O(1) relative to total item count, unlike list queries which degrade with list size
- **Keyword Query Language (KQL)** -- Powerful query syntax supports boolean operators, property restrictions, proximity search, and wildcards

### Why Not Direct List Queries

- **N+1 query problem** -- Querying 4+ sites means 4+ REST calls that must be parallelized, merged, and re-ranked client-side
- **No cross-site relevance** -- Client-side ranking across heterogeneous lists produces poor result quality
- **List view threshold** -- Lists with >5,000 items require indexed columns and paginated queries; search has no such limitation
- **No refiner support** -- Faceted counts must be computed client-side by fetching all items (expensive)
- **No suggestions** -- Typeahead suggestions require maintaining a separate suggestions index

## Trade-offs

| Factor | Search API | Direct List Queries |
|---|---|---|
| Crawl latency | 5-15 min delay for new/updated content to appear in results | Real-time (instant) |
| Query flexibility | KQL syntax, managed properties, refiners | Full CAML/OData filter support |
| Performance at scale | Excellent (pre-indexed) | Degrades with list size |
| Cross-site support | Native (single query) | Must query each site separately |
| Ranking quality | Server-side BM25 with signals | No ranking (sort by column only) |
| Offline/crawl failure | Results missing if crawl fails | Always returns current data |

### Mitigating Crawl Delay

The 5-15 minute crawl delay is mitigated by:

1. **Request on-demand crawl** after content submission via `/_api/search/administration/reindex`
2. **"Just published" banner** on newly submitted articles that reads directly from the list for the first 15 minutes
3. **Search freshness boost** in the result source query to prioritize recently modified items

## Consequences

- `SearchService.ts` is the primary service for all content discovery operations
- `Configure-Search.ps1` provisions the custom result source, managed property mappings, refiners, and search verticals
- All searchable metadata must be mapped to managed properties in the search schema (`search-schema.json`)
- Content submission workflow requests a re-crawl after publishing to minimize crawl delay
- Single-item operations (load article by ID, submit feedback, update metadata) use direct REST API calls via `KnowledgeService.ts`
- Analytics queries (top articles by views, popular search terms) use the Search Analytics API

## References

- [SharePoint Search REST API](https://learn.microsoft.com/en-us/sharepoint/dev/general-development/sharepoint-search-rest-api-overview)
- [Keyword Query Language (KQL)](https://learn.microsoft.com/en-us/sharepoint/dev/general-development/keyword-query-language-kql-syntax-reference)
- [Managed properties overview](https://learn.microsoft.com/en-us/sharepoint/manage-search-schema)
- [Search result sources](https://learn.microsoft.com/en-us/sharepoint/manage-result-sources)
