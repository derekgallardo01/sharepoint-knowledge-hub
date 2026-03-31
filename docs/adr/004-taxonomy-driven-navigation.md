# ADR-004: Managed Metadata for Categorization over Choice Fields

**Status:** Accepted
**Date:** 2025-09-15
**Decision Makers:** Solutions Architect, Information Architect, Content Governance Lead

## Context

The Knowledge Hub requires a categorization system that supports:

- Hierarchical categories (e.g., IT > Security > Endpoint Protection)
- Department-based filtering across all content types
- Audience targeting (e.g., All Employees, Managers, IT Staff)
- Document type classification (e.g., Policy, SOP, Runbook, FAQ)
- Navigation driven by category structure
- Consistent terminology across all associated sites

Two approaches were evaluated:

1. **Choice fields** -- SharePoint column type with predefined dropdown values per list
2. **Managed metadata (taxonomy)** -- Centralized Term Store with term sets, hierarchy, and cross-site reuse

## Decision

We will use **managed metadata (Term Store)** for all categorization, filtering, and navigation taxonomy.

Four term sets are deployed to the Term Store:

| Term Set | Purpose | Example Terms |
|---|---|---|
| Knowledge Categories | Hierarchical content categorization | IT > Security > Endpoint Protection |
| Departments | Organizational departments | Engineering, Human Resources, Finance |
| Document Types | Content type classification | Policy, SOP, Runbook, FAQ, Tutorial |
| Audiences | Target audience segments | All Employees, Managers, IT Staff, New Hires |

## Rationale

### Why Managed Metadata (Chosen)

- **Hierarchical structure** -- Term sets support parent-child relationships enabling drill-down navigation (e.g., IT > Security > Endpoint Protection > Antivirus)
- **Global reuse** -- Terms are defined once in the Term Store and reused across all associated sites, lists, and content types without duplication
- **Synonyms and alternate labels** -- Terms can have synonyms (e.g., "HR" maps to "Human Resources"), improving search recall without duplicate categories
- **Centralized governance** -- Term Store administrators control the taxonomy centrally; content authors select from approved terms only
- **Navigation integration** -- SharePoint hub navigation can be driven by term sets, creating automatic mega menu structure that reflects the taxonomy
- **Search refiners** -- Managed metadata columns generate taxonomy-aware refiners with proper hierarchy display in search results
- **Multi-language support** -- Terms can have labels in multiple languages, supporting future localization
- **Deprecation without deletion** -- Terms can be deprecated (hidden from new tagging) while existing tagged content retains the association
- **Pinning and reuse** -- Terms can be pinned across term sets, enabling a "Department" term to appear in both navigation and content metadata

### Why Not Choice Fields

- **Flat structure only** -- Choice fields have no hierarchy; cannot represent "IT > Security > Endpoint Protection"
- **Per-list definition** -- Each list maintains its own choice values; adding a new category requires updating every list on every site
- **No synonym support** -- Users must know the exact choice value; "HR" and "Human Resources" would be separate choices
- **No centralized governance** -- Any list owner can add/modify choice values, leading to inconsistent taxonomy across sites
- **Limited search refiners** -- Choice field refiners are flat text values with no hierarchy or grouping
- **Rename propagation** -- Renaming a choice value doesn't update existing items (they retain the old value); managed metadata renames propagate automatically

## Taxonomy Design

```
Term Store
└── Knowledge Hub (Term Group)
    ├── Knowledge Categories (Term Set)
    │   ├── Policies & Compliance
    │   │   ├── Corporate Policies
    │   │   ├── Regulatory Compliance
    │   │   ├── Data Privacy
    │   │   └── Security Policies
    │   ├── IT & Infrastructure
    │   │   ├── Network & Connectivity
    │   │   ├── Cloud Services
    │   │   ├── DevOps & CI/CD
    │   │   └── Security & Identity
    │   ├── Human Resources
    │   │   ├── Benefits & Compensation
    │   │   ├── Recruitment
    │   │   ├── Performance Management
    │   │   └── Employee Relations
    │   ├── Training & Development
    │   │   ├── Technical Training
    │   │   ├── Leadership Development
    │   │   ├── Onboarding
    │   │   └── Certifications
    │   └── Operations
    │       ├── Project Management
    │       ├── Quality Assurance
    │       ├── Facilities
    │       └── Procurement
    │
    ├── Departments (Term Set)
    │   ├── Engineering
    │   ├── Human Resources
    │   ├── Finance
    │   ├── Marketing
    │   ├── Sales
    │   ├── Legal
    │   ├── IT Operations
    │   └── Executive
    │
    ├── Document Types (Term Set)
    │   ├── Policy
    │   ├── Standard Operating Procedure
    │   ├── Runbook
    │   ├── FAQ
    │   ├── Tutorial
    │   ├── Architecture Guide
    │   ├── Meeting Notes
    │   └── Template
    │
    └── Audiences (Term Set)
        ├── All Employees
        ├── Managers
        ├── IT Staff
        ├── New Hires
        ├── Contractors
        └── Executive Leadership
```

## Trade-offs

| Factor | Managed Metadata | Choice Fields |
|---|---|---|
| Setup complexity | Higher -- Term Store admin, term group, term sets | Lower -- define choices in column settings |
| Hierarchy support | Full parent-child tree | Flat list only |
| Cross-site consistency | Automatic via Term Store | Manual per-list maintenance |
| User experience | Taxonomy picker (richer but more clicks) | Simple dropdown |
| Synonym support | Native | None |
| Search refiner quality | Hierarchical, grouped refiners | Flat text refiners |
| Governance control | Centralized Term Store admins | Per-list owners |
| Rename propagation | Automatic to all tagged items | Does not update existing items |

## Consequences

- `Deploy-Taxonomy.ps1` provisions the term group, term sets, and all terms defined in `term-sets.json`
- All content type fields that reference categories, departments, document types, or audiences use managed metadata columns
- `TaxonomyService.ts` provides methods for reading term sets, resolving term GUIDs, and populating taxonomy pickers in SPFx web parts
- Hub navigation mega menu is driven by the Knowledge Categories term set, automatically reflecting taxonomy changes
- Search refiners are configured with managed property mappings to taxonomy fields for proper hierarchy display
- Content submission forms use the SPFx taxonomy picker component for term selection
- Adding a new category or department is a Term Store operation -- no code changes or redeployment required

## References

- [Managed metadata overview](https://learn.microsoft.com/en-us/sharepoint/managed-metadata)
- [Plan managed metadata in SharePoint](https://learn.microsoft.com/en-us/sharepoint/plan-managed-metadata)
- [Taxonomy-driven navigation in SharePoint](https://learn.microsoft.com/en-us/sharepoint/dev/general-development/managed-navigation-in-sharepoint)
- [PnP Taxonomy Picker for SPFx](https://pnp.github.io/sp-dev-fx-controls-react/controls/TaxonomyPicker/)
