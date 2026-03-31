# SharePoint Online Knowledge Hub

![SPFx 1.22](https://img.shields.io/badge/SPFx-1.22-green)
![React 18](https://img.shields.io/badge/React-18-blue)
![Fluent UI v9](https://img.shields.io/badge/Fluent%20UI-v9-purple)
![PnP PowerShell](https://img.shields.io/badge/PnP-PowerShell-orange)
![License MIT](https://img.shields.io/badge/License-MIT-yellow)

A comprehensive enterprise Knowledge Hub solution for SharePoint Online featuring SPFx web parts, automated provisioning, content migration tools, Power Automate workflows, and a complete governance framework.

![SharePoint Knowledge Hub Hero](docs/screenshots/hero-knowledge-hub.png)

## Overview

Organizations struggle with scattered knowledge across file shares, wikis, email threads, and individual team sites. The Knowledge Hub centralizes organizational knowledge into a structured, searchable, and governed platform built entirely on SharePoint Online and the Microsoft 365 ecosystem.

**Value Proposition:**
- **Single source of truth** for organizational knowledge across departments
- **Enterprise search** with faceted refinement, suggestions, and search verticals
- **Content governance** with automated review cycles and approval workflows
- **Self-service migration** tools for onboarding existing content
- **Zero additional licensing** -- built on standard Microsoft 365 capabilities

## Architecture

### Hub Site Hierarchy

```mermaid
graph TD
    subgraph HubSite["Knowledge Hub (Hub Site)"]
        style HubSite fill:#0078d4,color:#fff,stroke:#005a9e,stroke-width:3px
        KH["<b>Knowledge Hub</b><br/>/sites/KnowledgeHub<br/><br/>SPFx Web Parts &bull; SharePoint Lists<br/>Search &bull; Power Automate Workflows"]
    end

    subgraph Policies["Policies & Procedures"]
        style Policies fill:#107c10,color:#fff,stroke:#0b5c0b,stroke-width:2px
        P["Policy Documents<br/>Compliance Guides<br/>SOP Templates"]
    end

    subgraph TechDocs["Technical Documentation"]
        style TechDocs fill:#5c2d91,color:#fff,stroke:#441f6e,stroke-width:2px
        T["API Docs &bull; Architecture Guides<br/>Runbooks &bull; Code Standards"]
    end

    subgraph Training["Training & Onboarding"]
        style Training fill:#ca5010,color:#fff,stroke:#a1400c,stroke-width:2px
        TR["Training Courses<br/>Tutorials &bull; Learning Paths"]
    end

    subgraph FAQs["FAQs & How-To Guides"]
        style FAQs fill:#008272,color:#fff,stroke:#005e54,stroke-width:2px
        F["FAQ Items<br/>Troubleshooting Guides<br/>Support Articles"]
    end

    KH -->|"Hub Navigation<br/>(Mega Menu)"| P
    KH -->|"Hub Navigation<br/>(Mega Menu)"| T
    KH -->|"Hub Navigation<br/>(Mega Menu)"| TR
    KH -->|"Hub Navigation<br/>(Mega Menu)"| F

    subgraph SharedServices["Shared Platform Services"]
        style SharedServices fill:#323130,color:#fff,stroke:#201f1e,stroke-width:2px
        MMS["Managed Metadata Service<br/>Categories &bull; Departments &bull; Doc Types &bull; Audiences"]
    end

    KH --- MMS
```

<details>
<summary>View ASCII architecture diagram</summary>

```
+------------------------------------------------------------------+
|                    Microsoft 365 Tenant                           |
|                                                                  |
|  +------------------------------------------------------------+ |
|  |              Knowledge Hub (Hub Site)                       | |
|  |                                                             | |
|  |  +------------------+  +------------------+                 | |
|  |  | SPFx Web Parts   |  | SharePoint Lists |                 | |
|  |  |                  |  |                  |                 | |
|  |  | - Article Viewer |  | - Knowledge      |                 | |
|  |  | - Advanced Search|  |   Articles       |                 | |
|  |  | - Featured       |  | - FAQs           |                 | |
|  |  | - FAQ Accordion  |  | - Article        |                 | |
|  |  | - Recently       |  |   Feedback       |                 | |
|  |  |   Updated        |  +------------------+                 | |
|  |  +------------------+                                       | |
|  |                                                             | |
|  |  +------------------+  +------------------+                 | |
|  |  | SharePoint Search|  | Power Automate   |                 | |
|  |  |                  |  |                  |                 | |
|  |  | - Result Source  |  | - Content        |                 | |
|  |  | - Managed Props  |  |   Approval       |                 | |
|  |  | - Refiners       |  | - Review         |                 | |
|  |  | - Verticals      |  |   Reminders      |                 | |
|  |  +------------------+  +------------------+                 | |
|  +------------------------------------------------------------+ |
|       |              |              |              |             |
|  +----------+  +----------+  +----------+  +----------+        |
|  | Policies |  | TechDocs |  | Training |  |   FAQs   |        |
|  | (Assoc.) |  | (Assoc.) |  | (Assoc.) |  | (Assoc.) |        |
|  +----------+  +----------+  +----------+  +----------+        |
|                                                                  |
|  +------------------------------------------------------------+ |
|  |              Managed Metadata Service                       | |
|  |  Categories | Departments | Doc Types | Audiences           | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

</details>

## Features

### SPFx Web Parts (7)

| Web Part | Description | Icon |
|---|---|---|
| **Knowledge Article** | Full article viewer with metadata sidebar, breadcrumbs, related articles, and user feedback | ReadingMode |
| **Advanced Search** | Enterprise search with refiners, suggestions, sort options, search history, and pagination | Search |
| **Featured Content** | Featured/trending content in grid or carousel layout with animated transitions | FavoriteStar |
| **FAQ Accordion** | Interactive FAQ with category filters, search, and per-item helpfulness feedback | QandA |
| **Recently Updated** | Timeline-style feed with date grouping, change type indicators, and time range filters | Clock |
| **Analytics Dashboard** | Content analytics with top articles, search terms, freshness tracking, author contributions, and category distribution charts | BarChartVertical |
| **Content Submission** | Article submission form with Markdown editor, taxonomy picker, tags, file attachments, auto-save drafts, validation, and review workflow | EditCreate |

### Provisioning Scripts (PowerShell)

| Script | Purpose |
|---|---|
| `Deploy-KnowledgeHub.ps1` | Creates hub site + 4 associated sites with navigation and permissions |
| `Deploy-Taxonomy.ps1` | Deploys managed metadata (Categories, Departments, Doc Types, Audiences) |
| `Deploy-ContentTypes.ps1` | Creates content types (Knowledge Article, FAQ Item, Policy Document, Training Material) |
| `Configure-Search.ps1` | Configures result source, managed properties, refiners, and search verticals |
| `Backup-KnowledgeHub.ps1` | Exports all list items, document library files, and taxonomy terms to a timestamped backup folder with manifest |
| `Restore-KnowledgeHub.ps1` | Restores list items, documents, and taxonomy from a backup with -WhatIf support |

### Migration Toolkit

| Tool | Purpose |
|---|---|
| `Import-ContentFromCsv.ps1` | Bulk import from CSV with column mapping, taxonomy lookup, retry logic |
| `Export-SharePointContent.ps1` | Export list items to CSV with metadata and version history |
| `Validate-Migration.ps1` | Compare source CSV with SharePoint list and generate HTML validation report |
| `Transform-ContentMetadata.ps1` | Clean and normalize CSV data: title case, dates, URLs, taxonomy mapping |

### Content Health Monitoring

| Tool | Purpose |
|---|---|
| `Monitor-ContentHealth.ps1` | Detect stale content, orphaned pages, and broken links; generate HTML dashboard report |

### Advanced Services

| Service | Description |
|---|---|
| `CacheService.ts` | Multi-tier caching (memory > sessionStorage > localStorage) with TTL, LRU eviction, `getOrSet<T>()` pattern, hit/miss statistics |
| `AnalyticsService.ts` | Content analytics tracker with page view dedup, search tracking, feedback, time-on-page estimates, batched writes every 30s, privacy opt-out |
| `ContentRecommendationService.ts` | Recommendation engine: taxonomy-based related articles, co-view collaborative filtering, department trending, weighted scoring with confidence levels |
| `NotificationService.ts` | In-app notification bell with read/unread tracking, notification preferences (subscribed categories), and SharePoint list backend |

### Governance Automation

| Script | Purpose |
|---|---|
| `Invoke-ContentGovernance.ps1` | Scan for missing metadata, expired reviews, near-duplicates (Levenshtein), orphaned content; generate HTML report; notify owners |
| `Set-ContentRetention.ps1` | Apply retention labels, archive past-threshold content, flag for deletion, full audit trail with `-WhatIf` support |

### Power Automate Flows

| Flow | Purpose |
|---|---|
| Content Approval | Manager + optional SME review workflow for article publishing |
| Content Review Reminder | Weekly check for overdue reviews with escalation to managers |

### Governance Documentation

| Document | Description |
|---|---|
| Information Architecture | Site hierarchy, navigation, content types, taxonomy, URL strategy |
| Governance Framework | Permissions, content lifecycle, review schedule, compliance, training |
| Migration Guide | Pre-migration checklist, content audit, import steps, validation, rollback |
| Search Configuration | Managed properties, result sources, refiners, verticals, query rules |

## Content Lifecycle

The Knowledge Hub enforces a governed content lifecycle with automated review reminders and approval workflows.

```mermaid
stateDiagram-v2
    [*] --> Draft: Author creates content
    Draft --> InReview: Submit for Review
    InReview --> Published: Approve
    InReview --> Draft: Request Changes
    Published --> InReview: Content Review Due
    Published --> Archived: Archive
    Published --> Draft: Major Update
    Archived --> Published: Restore
    Archived --> Deleted: Permanent Delete
    Deleted --> [*]
```

## Architecture Decision Records

Key architectural decisions are documented as ADRs in `docs/adr/`:

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](docs/adr/001-hub-site-architecture.md) | **Hub site with associated sites** over flat site collection -- enables shared navigation, scoped search, and independent governance per content area | Accepted |
| [ADR-002](docs/adr/002-search-over-rest-api.md) | **SharePoint Search API** over direct list queries -- cross-site aggregation, managed property refiners, relevance ranking, and query suggestions | Accepted |
| [ADR-003](docs/adr/003-content-type-inheritance.md) | **Custom content types inheriting from system types** (Item, Document) -- consistent metadata, content type hub publishing, search schema compatibility | Accepted |
| [ADR-004](docs/adr/004-taxonomy-driven-navigation.md) | **Managed metadata over choice fields** -- hierarchical categories, global reuse, synonym support, and taxonomy-driven navigation | Accepted |

## Advanced Architecture

### Intelligent Caching (CacheService)

Three-tier caching layer that minimizes SharePoint API calls:

```
Request → Memory Cache (Map, <1ms) → SessionStorage (survives nav) → LocalStorage (persists)
```

- **`getOrSet<T>(key, factory, ttl)`** -- transparent cache-aside pattern
- Per-tier TTL defaults: memory 5 min, session 15 min, local 1 hr
- LRU eviction when storage quota approached
- Cache invalidation by key, prefix, or full flush
- Hit/miss/eviction statistics for monitoring

### Content Analytics (AnalyticsService)

Privacy-aware tracking with batched writes:

- **Page views** -- session-deduplicated, one count per article per session
- **Search queries** -- what users search, result count, zero-result tracking
- **Article feedback** -- helpful/not helpful with category attribution
- **Time-on-page** -- estimated via Page Visibility API (hidden/visible transitions)
- Batched writes to SharePoint list every 30 seconds (configurable)
- No PII stored, user opt-out via localStorage flag

### Content Recommendations (ContentRecommendationService)

Weighted multi-signal recommendation engine:

| Signal | Weight | Description |
|---|---|---|
| Taxonomy overlap | 45% | Shared categories, departments, and tags between articles |
| Co-view correlation | 30% | Articles frequently viewed in the same session |
| Department trending | 15% | Popular articles within the viewer's department |
| Recency boost | 10% | Recently modified articles receive a freshness bonus |

Returns ranked recommendations with confidence scores (high/medium/low) and human-readable reasons.

## Governance Automation

### Content Governance (`Invoke-ContentGovernance.ps1`)

Automated scanning for governance violations across all knowledge content:

- **Missing metadata** -- Published articles without required Category, Department, or Review Date
- **Expired reviews** -- Articles past their scheduled review date, grouped by owner
- **Near-duplicates** -- Title similarity detection using Levenshtein distance (configurable threshold)
- **Orphaned content** -- Published articles with zero views in 90+ days
- **Missing owner** -- Articles without an assigned content owner
- Generates styled HTML compliance report with summary cards
- Optionally sends notification emails to content owners with remediation instructions

### Content Retention (`Set-ContentRetention.ps1`)

Policy-driven retention lifecycle:

- Applies retention labels based on content type, category, and age
- Archives content past configurable age threshold (moves to Archived status)
- Flags content past deletion threshold for manual review (never auto-deletes)
- Full audit trail exported as CSV with timestamp, action, item, and rule name
- Supports `-WhatIf` for dry-run previews

## Quality Metrics

Performance budgets, accessibility targets, and compatibility requirements are documented in [`docs/quality-metrics.md`](docs/quality-metrics.md):

| Category | Key Targets |
|---|---|
| **Performance** | Search < 2s, article load < 1s, refiner apply < 500ms, suggestions < 300ms |
| **Code Coverage** | Services > 80%, components > 60%, scripts > 70%, overall > 75% |
| **Accessibility** | WCAG 2.1 AA, keyboard navigation, NVDA + JAWS tested, 4.5:1 contrast |
| **Browser Support** | Edge, Chrome, Firefox, Safari (latest 2 versions) |
| **SharePoint** | SPFx 1.22, SharePoint Online, PnP.PowerShell 2.4+ |
| **API Budget** | ~51 calls per 30-min session (8.5% of throttling limit), 70% reduction via caching |

## Visual Documentation

Detailed architecture diagrams are available in the `docs/diagrams/` directory:

| Diagram | Description | Path |
|---|---|---|
| **Hub Site Architecture** | Site hierarchy with hub navigation and associated sites | [`docs/diagrams/site-hierarchy.md`](docs/diagrams/site-hierarchy.md) |
| **Content Type Hierarchy** | SharePoint content type inheritance with field details | [`docs/diagrams/content-type-inheritance.md`](docs/diagrams/content-type-inheritance.md) |
| **Managed Metadata Taxonomy** | Term store structure (Categories, Departments, Doc Types, Audiences) | [`docs/diagrams/taxonomy-tree.md`](docs/diagrams/taxonomy-tree.md) |
| **Content Lifecycle** | State machine with transitions, roles, and notifications | [`docs/diagrams/content-lifecycle.md`](docs/diagrams/content-lifecycle.md) |
| **Permission Model** | Access matrix and permission inheritance flow | [`docs/diagrams/permission-model.md`](docs/diagrams/permission-model.md) |
| **Search Architecture** | End-to-end search flow sequence diagram | [`docs/diagrams/search-flow.md`](docs/diagrams/search-flow.md) |
| **Migration Pipeline** | Content migration workflow with validation steps | [`docs/diagrams/migration-flow.md`](docs/diagrams/migration-flow.md) |

## Screenshots

| | |
|---|---|
| ![Hub Home Page](docs/screenshots/hub-home.png) | ![Advanced Search](docs/screenshots/advanced-search.png) |
| *Hub Home Page* | *Advanced Search* |
| ![Article Viewer](docs/screenshots/article-viewer.png) | ![FAQ Accordion](docs/screenshots/faq-accordion.png) |
| *Article Viewer* | *FAQ Accordion* |
| ![Recently Updated](docs/screenshots/recently-updated.png) | ![Migration Report](docs/screenshots/migration-report.png) |
| *Recently Updated* | *Migration Report* |

<details>
<summary>Interactive HTML mockups (open in browser)</summary>

| View | Description | Path |
|---|---|---|
| **Knowledge Hub Hero** | Full hub experience: mega menu, hero search with animated placeholder, featured carousel, stats, categories, timeline, trending sidebar | [`docs/screenshots/hero-knowledge-hub.html`](docs/screenshots/hero-knowledge-hub.html) |
| **Hub Home Page** | Landing page with hero search, featured content, recent updates, and popular articles | [`docs/screenshots/hub-home.html`](docs/screenshots/hub-home.html) |
| **Advanced Search** | Search results with faceted refiners, sort options, search verticals, and pagination | [`docs/screenshots/advanced-search.html`](docs/screenshots/advanced-search.html) |
| **Article Viewer** | Knowledge article with metadata sidebar, table of contents, related articles, and feedback | [`docs/screenshots/article-viewer.html`](docs/screenshots/article-viewer.html) |
| **FAQ Accordion** | FAQ page with category pills, search filter, expandable answers, and helpfulness voting | [`docs/screenshots/faq-accordion.html`](docs/screenshots/faq-accordion.html) |
| **Recently Updated** | Timeline feed with date grouping, change type badges, and time range filters | [`docs/screenshots/recently-updated.html`](docs/screenshots/recently-updated.html) |
| **Migration Report** | Validation report dashboard with pass rate, detailed results table, and error summary | [`docs/screenshots/migration-report.html`](docs/screenshots/migration-report.html) |
</details>

## Prerequisites

- **Microsoft 365 tenant** with SharePoint Online
- **Node.js** >= 18.17.1 (for SPFx development)
- **PnP.PowerShell** module (`Install-Module PnP.PowerShell`)
- **SharePoint Administrator** role (for provisioning)
- **Global Reader** or **Search Administrator** role (for search configuration)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/sharepoint-knowledge-hub.git
cd sharepoint-knowledge-hub
```

### 2. Provision the Infrastructure

```powershell
# Deploy hub site and associated sites
.\provisioning\sites\Deploy-KnowledgeHub.ps1 `
    -TenantAdminUrl "https://contoso-admin.sharepoint.com" `
    -HubSiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub"

# Deploy managed metadata taxonomy
.\provisioning\taxonomy\Deploy-Taxonomy.ps1 `
    -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub"

# Deploy content types and lists
.\provisioning\content-types\Deploy-ContentTypes.ps1 `
    -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub"

# Configure search
.\provisioning\search\Configure-Search.ps1 `
    -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub"
```

### 3. Build and Deploy Web Parts

```bash
cd spfx-webparts
npm install
npm run package
```

Upload the `.sppkg` file from `sharepoint/solution/` to the App Catalog.

### 4. Migrate Content

```powershell
# Dry run first
.\migration\scripts\Import-ContentFromCsv.ps1 `
    -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" `
    -ListName "Knowledge Articles" `
    -CsvPath ".\migration\templates\article-import-template.csv" `
    -MappingFile ".\migration\templates\field-mapping-example.json" `
    -DryRun

# Full import
.\migration\scripts\Import-ContentFromCsv.ps1 `
    -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" `
    -ListName "Knowledge Articles" `
    -CsvPath ".\your-articles.csv" `
    -MappingFile ".\your-mapping.json"
```

### 5. Configure Power Automate Flows

Follow the instructions in `power-automate-flows/README.md` to create the approval and review reminder flows.

## Web Parts Reference

### Knowledge Article Viewer

**Properties:**

| Property | Type | Default | Description |
|---|---|---|---|
| `articleListName` | string | "Knowledge Articles" | Source list name |
| `showBreadcrumb` | boolean | true | Show breadcrumb navigation |
| `showRelatedArticles` | boolean | true | Show related articles section |
| `showFeedback` | boolean | true | Show feedback widget |
| `relatedArticleCount` | number | 5 | Number of related articles |
| `layoutStyle` | choice | "standard" | standard, wide, or compact |

### Advanced Search

**Properties:**

| Property | Type | Default | Description |
|---|---|---|---|
| `resultsPerPage` | number | 10 | Results per page (5-50) |
| `showRefiners` | boolean | true | Show refiner panel |
| `showSuggestions` | boolean | true | Enable typeahead suggestions |
| `showSearchHistory` | boolean | true | Show recent searches |
| `resultSourceId` | string | "" | Custom result source GUID |

### Featured Content

**Properties:**

| Property | Type | Default | Description |
|---|---|---|---|
| `contentSource` | string | "Knowledge Articles" | Source list name |
| `itemCount` | number | 6 | Number of items (3-12) |
| `layoutMode` | choice | "grid" | grid or carousel |
| `showTrending` | boolean | true | Show trending tab |
| `autoRotate` | boolean | true | Auto-rotate carousel |
| `rotateInterval` | number | 5 | Seconds between rotations |

### FAQ Accordion

**Properties:**

| Property | Type | Default | Description |
|---|---|---|---|
| `faqListName` | string | "FAQs" | FAQ list name |
| `defaultCategory` | string | "" | Pre-selected category |
| `showSearch` | boolean | true | Show search filter |
| `showFeedback` | boolean | true | Show helpfulness buttons |
| `expandFirst` | boolean | false | Auto-expand first item |

### Recently Updated

**Properties:**

| Property | Type | Default | Description |
|---|---|---|---|
| `itemCount` | number | 10 | Items per load (5-50) |
| `sourceLists` | string | "Knowledge Articles,FAQs" | Comma-separated list names |
| `defaultTimeRange` | choice | "week" | today, week, or month |
| `defaultViewMode` | choice | "compact" | compact or detailed |

### Analytics Dashboard

**Properties:**

| Property | Type | Default | Description |
|---|---|---|---|
| `articleListName` | string | "Knowledge Articles" | Source list for article data |
| `faqListName` | string | "FAQs" | Source list for FAQ data |
| `dateRange` | number | 30 | Date range in days (7-365) |
| `articleCount` | number | 10 | Number of top articles to display (5-25) |
| `chartType` | choice | "bar" | bar, horizontal, or donut |
| `showTopArticles` | boolean | true | Show top articles by views |
| `showSearchTerms` | boolean | true | Show popular search terms |
| `showContentFreshness` | boolean | true | Show content freshness indicators |
| `showAuthorContributions` | boolean | true | Show author contribution chart |
| `showCategoryDistribution` | boolean | true | Show category distribution chart |

### Content Submission

**Properties:**

| Property | Type | Default | Description |
|---|---|---|---|
| `draftListName` | string | "Knowledge Drafts" | SharePoint list for auto-saved drafts |
| `publishedListName` | string | "Knowledge Articles" | SharePoint list for submitted articles |
| `autoSaveIntervalSeconds` | number | 30 | Auto-save interval in seconds (10-120) |
| `maxTitleLength` | number | 200 | Maximum title character length (50-500) |
| `maxBodyLength` | number | 50000 | Maximum body character length (5000-100000) |
| `enableAttachments` | boolean | true | Enable file attachments |

## Provisioning Reference

All provisioning scripts support the `-WhatIf` flag for preview mode and accept an optional `-Credential` parameter for non-interactive authentication.

```powershell
# Preview mode (no changes made)
.\Deploy-KnowledgeHub.ps1 -TenantAdminUrl "..." -HubSiteUrl "..." -WhatIf

# Non-interactive with saved credentials
$cred = Get-Credential
.\Deploy-KnowledgeHub.ps1 -TenantAdminUrl "..." -HubSiteUrl "..." -Credential $cred
```

## Documentation Index

### Governance & Architecture Docs

| Document | Path | Description |
|---|---|---|
| Information Architecture | [`docs/information-architecture.md`](docs/information-architecture.md) | Site hierarchy, navigation, content types, managed metadata taxonomy, URL strategy |
| Governance Framework | [`docs/governance-framework.md`](docs/governance-framework.md) | Permissions model, content lifecycle, review schedule, compliance, training plan |
| Migration Guide | [`docs/migration-guide.md`](docs/migration-guide.md) | Content audit, field mapping, batch import, validation, rollback procedures |
| Search Configuration | [`docs/search-configuration.md`](docs/search-configuration.md) | Managed properties, result sources, refiners, verticals, query rules, analytics |
| Quality Metrics | [`docs/quality-metrics.md`](docs/quality-metrics.md) | Performance budgets, code coverage targets, accessibility targets, browser matrix |
| Power Automate Flows | [`power-automate-flows/README.md`](power-automate-flows/README.md) | Content approval and review reminder flow configuration |

### Architecture Decision Records

| ADR | Path | Decision |
|---|---|---|
| ADR-001 | [`docs/adr/001-hub-site-architecture.md`](docs/adr/001-hub-site-architecture.md) | Hub site with associated sites over flat site collection |
| ADR-002 | [`docs/adr/002-search-over-rest-api.md`](docs/adr/002-search-over-rest-api.md) | SharePoint Search API over direct list queries |
| ADR-003 | [`docs/adr/003-content-type-inheritance.md`](docs/adr/003-content-type-inheritance.md) | Custom content types inheriting from system types |
| ADR-004 | [`docs/adr/004-taxonomy-driven-navigation.md`](docs/adr/004-taxonomy-driven-navigation.md) | Managed metadata over choice fields for navigation |

### Architecture Diagrams

| Diagram | Path | Description |
|---|---|---|
| Site Hierarchy | [`docs/diagrams/site-hierarchy.md`](docs/diagrams/site-hierarchy.md) | Hub site + 4 associated sites with navigation model |
| Content Type Inheritance | [`docs/diagrams/content-type-inheritance.md`](docs/diagrams/content-type-inheritance.md) | System to custom content type inheritance tree |
| Taxonomy Tree | [`docs/diagrams/taxonomy-tree.md`](docs/diagrams/taxonomy-tree.md) | Full managed metadata term store structure |
| Content Lifecycle | [`docs/diagrams/content-lifecycle.md`](docs/diagrams/content-lifecycle.md) | State machine with roles and notifications |
| Permission Model | [`docs/diagrams/permission-model.md`](docs/diagrams/permission-model.md) | Access matrix and inheritance flow |
| Search Flow | [`docs/diagrams/search-flow.md`](docs/diagrams/search-flow.md) | End-to-end search sequence diagram |
| Migration Pipeline | [`docs/diagrams/migration-flow.md`](docs/diagrams/migration-flow.md) | 6-phase migration workflow |

## Project Structure

```
sharepoint-knowledge-hub/
|-- spfx-webparts/                    # SPFx web parts project
|   |-- src/
|   |   |-- services/                 # Shared service layer
|   |   |   |-- SearchService.ts      # Search + Graph API
|   |   |   |-- TaxonomyService.ts    # Managed metadata
|   |   |   |-- KnowledgeService.ts   # CRUD + feedback
|   |   |   |-- NotificationService.ts # In-app notification bell + preferences
|   |   |   |-- CacheService.ts       # Multi-tier caching (memory/session/local)
|   |   |   |-- AnalyticsService.ts   # Content analytics + batched tracking
|   |   |   +-- ContentRecommendationService.ts # Recommendation engine
|   |   +-- webparts/
|   |       |-- knowledgeArticle/     # Article viewer web part
|   |       |-- advancedSearch/       # Search web part
|   |       |-- featuredContent/      # Featured/trending web part
|   |       |-- faqAccordion/         # FAQ web part
|   |       |-- recentlyUpdated/      # Recent updates web part
|   |       |-- analyticsDashboard/   # Analytics dashboard web part
|   |       +-- contentSubmission/    # Article submission form web part
|   |           |-- ContentSubmissionWebPart.ts
|   |           |-- ContentSubmissionWebPart.manifest.json
|   |           +-- components/
|   |               |-- ContentSubmission.tsx
|   |               |-- ContentSubmission.module.scss
|   |               +-- IContentSubmissionProps.ts
|   |-- config/                       # SPFx build configuration
|   +-- package.json
|-- provisioning/                     # Infrastructure as code
|   |-- sites/                        # Hub site + associated sites
|   |-- taxonomy/                     # Managed metadata term sets
|   |-- content-types/                # Content types + site columns
|   |-- search/                       # Search schema + verticals
|   |-- monitoring/                   # Content health monitoring scripts
|   |-- governance/                   # Content governance automation
|   |   |-- Invoke-ContentGovernance.ps1 # Compliance scanning + reporting
|   |   +-- Set-ContentRetention.ps1     # Retention policy enforcement
|   +-- backup/                       # Backup and restore scripts
|       |-- Backup-KnowledgeHub.ps1   # Full site backup with manifest
|       +-- Restore-KnowledgeHub.ps1  # Restore from backup
|-- migration/                        # Content migration toolkit
|   |-- scripts/                      # Import, export, validate, transform
|   +-- templates/                    # CSV templates + mapping files
|-- power-automate-flows/             # Workflow definitions
|-- docs/                             # Governance documentation
|   |-- adr/                          # Architecture Decision Records
|   |   |-- 001-hub-site-architecture.md
|   |   |-- 002-search-over-rest-api.md
|   |   |-- 003-content-type-inheritance.md
|   |   +-- 004-taxonomy-driven-navigation.md
|   +-- quality-metrics.md            # Performance budgets + targets
+-- README.md
```

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for prerequisites, setup instructions, development workflow, and code style guidelines.

---

## Changelog

### v1.3.0

- Added `CacheService.ts` with multi-tier caching (memory / sessionStorage / localStorage), TTL per entry, LRU eviction, `getOrSet<T>()` pattern, cache invalidation by key or prefix, and hit/miss/eviction statistics
- Added `AnalyticsService.ts` for privacy-aware content analytics: page view tracking with session deduplication, search query tracking, article feedback, time-on-page estimates via Visibility API, batched writes every 30 seconds, user opt-out support, and dashboard data aggregation methods
- Added `ContentRecommendationService.ts` with three recommendation strategies: taxonomy-based related articles, co-view collaborative filtering, and department trending -- produces weighted scores with confidence levels
- Added `Invoke-ContentGovernance.ps1` for automated governance enforcement: missing metadata detection, expired review date scanning, near-duplicate detection (Levenshtein distance), orphaned content identification, missing owner checks, HTML compliance report generation, and owner notification emails
- Added `Set-ContentRetention.ps1` for retention policy enforcement: rule-based retention label application, content archival past age threshold, deletion flagging with manual review, full CSV audit trail, and -WhatIf support
- Added 4 Architecture Decision Records (ADRs): hub site architecture, search API strategy, content type inheritance, and taxonomy-driven navigation
- Added `docs/quality-metrics.md` with performance budgets, code coverage targets, accessibility requirements (WCAG 2.1 AA), browser support matrix, and API rate limit budget
- Added hero Knowledge Hub screenshot (`docs/screenshots/hero-knowledge-hub.html`) with dark-themed glassmorphism design, animated search placeholder, featured content carousel, stats bar, category grid, timeline feed, and trending sidebar

### v1.2.0

- Added Content Submission web part with Markdown editor and live preview, taxonomy category picker, department selector, multi-value tags, audience targeting, file attachments, auto-save drafts to SharePoint every 30 seconds, form validation, and submit for review workflow
- Added `NotificationService.ts` for in-app notifications: fetch/create notifications, mark read/unread, notification preferences with category subscriptions, unread count caching, and Fluent UI icon mapping
- Added `Backup-KnowledgeHub.ps1` for comprehensive site backup: exports list items (with optional version history), document library files, taxonomy term sets, and generates a manifest.json with backup metadata
- Added `Restore-KnowledgeHub.ps1` for restoring from backup: reads manifest, restores taxonomy terms, list items, and documents with -WhatIf support
- Updated web part count from 6 to 7

### v1.1.0

- Added Analytics Dashboard web part with top articles, search terms, content freshness, author contributions, and category distribution (pure CSS charts)
- Added `Monitor-ContentHealth.ps1` for detecting stale content, orphaned pages, and broken links with HTML dashboard report generation
- Added `Transform-ContentMetadata.ps1` for CSV data cleaning: title case, date normalization, URL validation, and taxonomy value mapping
- Updated web part count from 5 to 6

### v1.0.0

- Five SPFx web parts: Knowledge Article, Advanced Search, Featured Content, FAQ Accordion, Recently Updated
- Hub site provisioning with 4 associated sites, managed metadata taxonomy, content types, and search configuration
- Migration toolkit: CSV import, SharePoint export, and validation reporting
- Power Automate flows: Content Approval and Content Review Reminder
- Governance documentation: information architecture, governance framework, migration guide, search configuration
- Architecture diagrams and HTML screenshot mockups

---

## Roadmap

Planned features for future releases:

- **AI-powered search suggestions** -- Microsoft Copilot / Azure OpenAI integration for intelligent search auto-complete and answer extraction
- **Content translation** -- automatic article translation using Azure Cognitive Services with side-by-side bilingual views
- **Microsoft Teams tab integration** -- Teams tab app for browsing knowledge articles and FAQs without leaving Teams
- **Mobile app** -- Power Apps mobile companion for offline article reading and quick feedback submission
- **Content analytics API** -- REST API endpoint (Azure Function) exposing analytics data for external reporting and dashboard integration

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
