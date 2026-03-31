# Quality Metrics & Performance Budgets

This document defines the quality targets, performance budgets, accessibility requirements, and compatibility matrix for the Knowledge Hub project.

## Code Coverage Targets

| Layer | Target | Rationale |
|---|---|---|
| Services (`*Service.ts`) | > 80% | Services contain critical business logic (caching, search, analytics, recommendations) |
| React Components (`*.tsx`) | > 60% | UI components tested for rendering, props, and user interactions |
| PowerShell Scripts (`*.ps1`) | > 70% | Provisioning and governance scripts tested with Pester |
| Utility Functions | > 90% | Pure functions with no side effects should be thoroughly tested |
| Overall | > 75% | Weighted average across all layers |

## Performance Budgets

All measurements taken on a mid-tier device (Intel i5, 8GB RAM, 100 Mbps connection) against a SharePoint Online tenant with 1,200+ articles.

### Web Part Performance

| Operation | Budget | Measurement Method |
|---|---|---|
| Advanced Search: initial load | < 2,000 ms | Time from web part mount to first results rendered |
| Advanced Search: query execution | < 1,500 ms | Time from search submit to results rendered (cached result source) |
| Advanced Search: refiner apply | < 500 ms | Time from refiner click to filtered results rendered |
| Advanced Search: typeahead suggestions | < 300 ms | Time from keystroke to suggestions dropdown displayed |
| Article Viewer: full load | < 1,000 ms | Time from navigation to article fully rendered (body + sidebar) |
| Article Viewer: related articles | < 800 ms | Time for related articles panel to populate |
| Featured Content: initial render | < 1,200 ms | Time from mount to carousel cards rendered with data |
| FAQ Accordion: category filter | < 400 ms | Time from category click to filtered FAQ list rendered |
| Recently Updated: timeline load | < 1,000 ms | Time from mount to timeline items rendered |
| Analytics Dashboard: chart render | < 2,500 ms | Time from mount to all charts rendered with data |
| Content Submission: auto-save | < 200 ms | Time for auto-save draft write to complete |

### API Performance

| Operation | Budget | Notes |
|---|---|---|
| SharePoint Search query | < 1,200 ms | Single query with 5 refiners, top 10 results |
| Search suggestions | < 250 ms | Pre-query suggestions via `/_api/search/suggest` |
| List item read (single) | < 500 ms | `GetById()` with field selection |
| List item write (single) | < 800 ms | `Add()` or `Update()` with metadata |
| Taxonomy term fetch | < 600 ms | Full term set load (cached after first fetch) |
| Analytics batch write | < 1,000 ms | Batch of 50 events written to analytics list |

### Bundle Size

| Asset | Budget | Notes |
|---|---|---|
| SPFx solution package (.sppkg) | < 5 MB | Compressed package uploaded to App Catalog |
| Individual web part JS bundle | < 250 KB | Gzipped size per web part chunk |
| Total JS loaded on hub home | < 500 KB | Combined gzipped JS for all web parts on home page |
| CSS (per web part) | < 30 KB | Compiled SCSS modules per web part |

### Cache Performance

| Metric | Target | Notes |
|---|---|---|
| Cache hit rate (memory tier) | > 80% | After initial warm-up period |
| Cache hit rate (all tiers) | > 90% | Combined memory + session + local |
| Cache read latency (memory) | < 1 ms | In-process Map lookup |
| Cache read latency (session) | < 5 ms | SessionStorage parse + promote |
| Cache read latency (local) | < 10 ms | LocalStorage parse + promote |
| LRU eviction accuracy | > 95% | Oldest accessed entry evicted first |

## Accessibility Targets

| Standard | Level | Notes |
|---|---|---|
| WCAG 2.1 | AA | All web parts must meet AA conformance |
| Section 508 | Compliant | Required for US government clients |
| Keyboard Navigation | Full | All interactive elements reachable via keyboard |
| Screen Reader | NVDA + JAWS | Tested with both screen readers on Edge and Chrome |
| Color Contrast | 4.5:1 (text), 3:1 (large text) | Verified with axe-core and Lighthouse |
| Focus Indicators | Visible | Custom focus styles matching Fluent UI v9 patterns |
| ARIA Labels | Complete | All icons, buttons, and interactive elements labeled |
| Reduced Motion | Respected | `prefers-reduced-motion` disables carousel and animations |

## Browser Support Matrix

| Browser | Version | Support Level |
|---|---|---|
| Microsoft Edge | Latest 2 versions | Full support (primary) |
| Google Chrome | Latest 2 versions | Full support |
| Mozilla Firefox | Latest 2 versions | Full support |
| Safari | Latest 2 versions | Full support |
| Safari iOS | Latest 2 versions | Full support (responsive) |
| Chrome Android | Latest 2 versions | Full support (responsive) |
| Internet Explorer 11 | N/A | Not supported (EOL) |

## SharePoint Compatibility

| Component | Version | Notes |
|---|---|---|
| SharePoint Online | Current | Target platform |
| SPFx Framework | 1.22.x | Latest GA release |
| Node.js | >= 18.17.1 | LTS version per SPFx requirements |
| PnP.PowerShell | >= 2.4.0 | For provisioning scripts |
| Microsoft Graph API | v1.0 | For user profile and presence data |
| SharePoint REST API | v1 | For search, list operations |
| Fluent UI React v9 | >= 9.40.0 | Component library |
| React | 18.x | UI framework |
| TypeScript | 4.7+ | Language version |

## API Rate Limit Budget

Estimated API call budget per user session (30 minutes):

| Operation | Estimated Calls | SharePoint Limit | Budget Utilization |
|---|---|---|---|
| Search queries | 15 | 600/min | 2.5% |
| List item reads | 30 | 600/min | 5.0% |
| Analytics batch writes | 2 | 600/min | 0.3% |
| Taxonomy term fetches | 3 | 600/min | 0.5% |
| User profile reads | 1 | 600/min | 0.2% |
| **Total per session** | **51** | **600/min** | **8.5%** |

The CacheService reduces redundant API calls by approximately 70%, keeping actual API usage well within SharePoint Online throttling limits (600 requests per minute per user).

## Monitoring & Alerting

| Metric | Threshold | Action |
|---|---|---|
| Search query latency p95 | > 3,000 ms | Investigate search index health |
| Cache hit rate | < 70% | Review cache TTL configuration |
| Analytics batch failure rate | > 5% | Check analytics list permissions and schema |
| Bundle size regression | > 10% increase | Review PR for unnecessary dependencies |
| Accessibility score (Lighthouse) | < 90 | Block PR merge until resolved |
| Content freshness (stale articles) | > 20% of total | Trigger governance review |
