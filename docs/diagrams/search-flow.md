# Search Architecture

The following sequence diagram illustrates the end-to-end search flow in the Knowledge Hub, from the user entering a query through result rendering and article viewing. The architecture leverages SharePoint Search with custom managed properties, a scoped result source, and SPFx web parts for the presentation layer.

```mermaid
sequenceDiagram
    actor User
    participant SearchWP as SPFx Advanced<br/>Search Web Part
    participant SearchAPI as SharePoint<br/>Search REST API
    participant ResultSource as Result Source<br/>(Knowledge Hub Content)
    participant ContentProc as Content Processing<br/>(Managed Properties)
    participant Refiners as Refiner Engine<br/>(Category, Dept, Type,<br/>Date, Author)
    participant ArticleWP as SPFx Article<br/>Viewer Web Part

    User->>SearchWP: Enter search query<br/>"cloud migration"
    activate SearchWP

    SearchWP->>SearchWP: Show typeahead suggestions<br/>from search history

    SearchWP->>SearchAPI: POST /_api/search/postquery<br/>querytext, refiners, sourceid,<br/>rowlimit, startrow
    activate SearchAPI

    SearchAPI->>ResultSource: Apply result source scope<br/>contenttype:"Knowledge Article"<br/>OR "FAQ Item" OR "Policy Document"<br/>OR "Training Material"
    activate ResultSource

    ResultSource->>ContentProc: Query against index<br/>Match managed properties:<br/>KHCategory, KHDepartment,<br/>KHTags, Title, Body
    activate ContentProc

    ContentProc-->>ResultSource: Return matched items<br/>with relevance ranking
    deactivate ContentProc

    ResultSource-->>SearchAPI: Scoped result set<br/>(46 results)
    deactivate ResultSource

    SearchAPI->>Refiners: Calculate refiner counts<br/>for result set
    activate Refiners

    Refiners-->>SearchAPI: Refiner values:<br/>Category: IT(23), Ops(8), Eng(15)<br/>Dept: IT(18), Eng(12), DevOps(6)<br/>Type: Guide(10), Policy(5)
    deactivate Refiners

    SearchAPI-->>SearchWP: JSON response:<br/>results[], refiners[],<br/>totalRows, suggestions[]
    deactivate SearchAPI

    SearchWP->>SearchWP: Render results with:<br/>- Hit-highlighted snippets<br/>- Metadata badges<br/>- Refiner panel (left)<br/>- Pagination controls

    SearchWP-->>User: Display search results page<br/>with refiners and 46 results

    User->>SearchWP: Apply refiner:<br/>Category = "IT"

    SearchWP->>SearchAPI: POST with refinementfilter:<br/>KHCategory:"IT"
    SearchAPI-->>SearchWP: Filtered results (23 items)
    SearchWP-->>User: Updated results + refiners

    User->>SearchWP: Click result:<br/>"Cloud Migration Strategy Guide"

    SearchWP->>ArticleWP: Navigate to article page<br/>?articleId=42
    activate ArticleWP

    ArticleWP->>ArticleWP: Load article data<br/>Render with metadata sidebar,<br/>breadcrumbs, related articles,<br/>feedback widget

    ArticleWP->>ArticleWP: Increment KHViewCount

    ArticleWP-->>User: Display full article
    deactivate ArticleWP
    deactivate SearchWP
```

## Search Components Summary

| Component | Technology | Purpose |
|---|---|---|
| **Search Web Part** | SPFx (React 18 + Fluent UI v9) | User-facing search interface with refiners, suggestions, history |
| **Search REST API** | SharePoint REST (`/_api/search/postquery`) | Backend query execution and result retrieval |
| **Result Source** | SharePoint Search Administration | Scopes queries to Knowledge Hub content types only |
| **Managed Properties** | SharePoint Search Schema | Maps crawled properties to queryable/refinable properties |
| **Refiners** | SharePoint Search Refinement | Faceted navigation: Category, Department, Content Type, Date, Author |
| **Article Viewer** | SPFx (React 18 + Fluent UI v9) | Renders full article with metadata, related content, feedback |

## Query Flow Details

1. **User Input** -- User types query in the Advanced Search web part; typeahead suggestions appear from search history and popular queries
2. **Query Construction** -- Web part builds a Search REST API POST request with the query text, result source ID, requested managed properties, refiners, row limit, and start row for pagination
3. **Result Source Scoping** -- The Knowledge Hub Content result source applies a KQL filter to limit results to the four Knowledge Hub content types
4. **Index Matching** -- SharePoint Search matches the query against the full-text index and managed properties (KHCategory, KHDepartment, KHTags, Title, Body)
5. **Relevance Ranking** -- Results are ranked by relevance using SharePoint's ranking model, which considers term frequency, field weights, recency, and popularity (view count)
6. **Refiner Calculation** -- The refiner engine calculates value counts for each configured refiner within the result set
7. **Response Rendering** -- The web part renders results with hit-highlighted snippets, metadata badges, a left-panel refiner UI, and pagination controls
8. **Refiner Filtering** -- When a user selects a refiner value, the web part sends a new query with a `refinementfilter` parameter to narrow results
9. **Article Navigation** -- Clicking a result navigates to the article page, where the Article Viewer web part loads and renders the full content
