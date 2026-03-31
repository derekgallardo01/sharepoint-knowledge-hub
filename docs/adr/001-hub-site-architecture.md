# ADR-001: Hub Site Architecture over Flat Site Collection

**Status:** Accepted
**Date:** 2025-09-15
**Decision Makers:** Solutions Architect, SharePoint Platform Team Lead, IT Governance Board

## Context

The Knowledge Hub requires a site architecture that supports:

- Cross-departmental content organized by subject area (Policies, Technical Docs, Training, FAQs)
- Shared navigation and branding across all content areas
- Scoped search across all knowledge content
- Independent permission models per content area
- Future extensibility for new content areas without rearchitecting

Two primary approaches were evaluated:

1. **Flat site collection** -- All content in a single site with document libraries and lists organized by category
2. **Hub site with associated sites** -- A central hub site with dedicated associated sites per content area

## Decision

We will use a **hub site with associated sites** architecture.

The Knowledge Hub hub site (`/sites/KnowledgeHub`) acts as the central entry point with shared navigation, search scope, and branding. Each major content area is an associated site:

| Associated Site | Purpose | URL |
|---|---|---|
| Policies & Procedures | Corporate policies, compliance docs, SOPs | `/sites/KH-Policies` |
| Technical Documentation | API docs, architecture guides, runbooks | `/sites/KH-TechDocs` |
| Training & Onboarding | Courses, tutorials, learning paths | `/sites/KH-Training` |
| FAQs & How-To | FAQ items, troubleshooting, support articles | `/sites/KH-FAQs` |

## Rationale

### Why Hub Site (Chosen)

- **Shared mega menu navigation** propagates automatically to all associated sites without custom code
- **Search scope** can target the entire hub (all associated sites) or individual sites, enabling both broad and targeted search
- **Independent permissions** -- each associated site has its own permission model, allowing department-specific access control without complex list-level permissions
- **Content type hub publishing** works naturally across hub-associated sites via the content type gallery
- **Branding consistency** -- hub themes and site designs apply uniformly across all associated sites
- **Scalability** -- new content areas are added by creating a new site and associating it to the hub, no migration required
- **Storage isolation** -- each site has its own storage quota, preventing one department from consuming all capacity
- **Site-level features** -- each site can enable different features (e.g., Training site can enable Stream video embedding)

### Why Not Flat Site Collection

- **Permission complexity** -- A single site requires item-level or library-level permissions, which are notoriously difficult to maintain and debug in SharePoint Online
- **List view threshold** -- A single "Knowledge Articles" list exceeding 5,000 items in a single view triggers throttling; splitting across sites naturally partitions data
- **No search scoping** -- All content in one site makes it harder to create focused search experiences per content area
- **Monolithic risk** -- Any site-level issue (corruption, permission misconfiguration) affects all content simultaneously
- **URL structure** -- Flat lists produce less intuitive URLs than site-based hierarchy

## Trade-offs

| Factor | Hub Site | Flat Site Collection |
|---|---|---|
| Provisioning complexity | Higher -- must script hub registration + site creation + association | Lower -- single site creation |
| Cross-site queries | Requires Search API or Graph API | Direct REST/CAML on same site |
| Navigation management | Automatic hub nav propagation | Manual navigation per page |
| Permission model | Clean site-level boundaries | Complex item/library-level permissions |
| Content type deployment | Content type hub publishing | Local content types only |
| Future extensibility | Add new associated site | Add new lists (scaling concerns) |

## Consequences

- Provisioning scripts (`Deploy-KnowledgeHub.ps1`) must create the hub site, register it as a hub, create all associated sites, and configure the association
- SPFx web parts that aggregate content across sites must use the SharePoint Search API or Microsoft Graph rather than direct list queries (see [ADR-002](./002-search-over-rest-api.md))
- Content types are published from the hub content type gallery to all associated sites (see [ADR-003](./003-content-type-inheritance.md))
- Navigation taxonomy terms drive the mega menu structure across all sites (see [ADR-004](./004-taxonomy-driven-navigation.md))
- Site administrators can be delegated per content area without granting hub-level admin

## References

- [Microsoft Docs: Planning your SharePoint hub sites](https://learn.microsoft.com/en-us/sharepoint/planning-hub-sites)
- [SharePoint hub site best practices](https://learn.microsoft.com/en-us/sharepoint/hub-site-best-practices)
- [List view threshold in SharePoint Online](https://learn.microsoft.com/en-us/microsoft-365/community/large-lists-large-libraries-in-sharepoint)
