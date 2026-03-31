# ADR-003: Custom Content Types Inheriting from System Types

**Status:** Accepted
**Date:** 2025-09-15
**Decision Makers:** Solutions Architect, Information Architect, SharePoint Platform Team Lead

## Context

The Knowledge Hub manages four distinct types of content:

1. **Knowledge Articles** -- General knowledge base articles with rich text body, category, department, and review cycle
2. **FAQ Items** -- Question-answer pairs with category, helpfulness tracking, and keyword tags
3. **Policy Documents** -- Document files with compliance metadata, effective dates, and mandatory acknowledgment tracking
4. **Training Materials** -- Learning resources with difficulty level, estimated duration, prerequisites, and completion tracking

Each content type requires:

- A consistent set of base metadata (title, author, modified date, status)
- Type-specific metadata fields
- Searchable managed properties mapped to each field
- Content type hub publishing to all associated sites

Two approaches were evaluated:

1. **Custom content types from scratch** -- Create entirely new content types with custom base IDs
2. **Inherit from system content types** -- Extend `Item` (0x01) and `Document` (0x0101) with custom columns

## Decision

We will use **custom content types that inherit from SharePoint system content types**.

| Custom Content Type | Parent | Content Type ID Prefix | Used In |
|---|---|---|---|
| Knowledge Article | Item (0x01) | `0x0100...` | Knowledge Articles list |
| FAQ Item | Item (0x01) | `0x0100...` | FAQs list |
| Policy Document | Document (0x0101) | `0x0101...` | Policy Documents library |
| Training Material | Document (0x0101) | `0x0101...` | Training Materials library |

## Rationale

### Why Inherit from System Types (Chosen)

- **System field inheritance** -- Child types automatically get Title, Author, Created, Modified, and all standard list behaviors without redefinition
- **Document library compatibility** -- Types inheriting from `Document` (0x0101) automatically support file upload, versioning, check-in/check-out, and co-authoring
- **Content type hub publishing** -- System-derived types publish reliably through the Content Type Hub to all associated sites
- **Search schema compatibility** -- System crawled properties (ows_Title, ows_Author, etc.) are already mapped to managed properties; only custom fields need new mappings
- **Template support** -- Document-based types support associated document templates (e.g., Policy Document template with standard header/footer)
- **Compliance features** -- Inheriting from Document enables retention labels, sensitivity labels, and DLP policy enforcement
- **Upgrade path** -- Microsoft updates to system types (new fields, behaviors) automatically propagate to child types

### Why Not Custom Base Types

- **Missing system behaviors** -- Custom base types don't automatically support versioning, check-out, or compliance features
- **Broken search mappings** -- System crawled properties aren't generated for non-standard base types
- **Content type hub issues** -- Non-standard type hierarchies can cause publishing failures
- **Maintenance burden** -- Must manually replicate system field definitions (Title, Author, etc.)

## Content Type Schema

### Knowledge Article (inherits from Item)

| Field | Internal Name | Type | Required |
|---|---|---|---|
| Title | Title | Single line of text | Yes |
| Article Body | KHArticleBody | Multiple lines (Enhanced Rich Text) | Yes |
| Category | KHCategory | Managed Metadata (Categories term set) | Yes |
| Department | KHDepartment | Managed Metadata (Departments term set) | Yes |
| Article Status | KHStatus | Choice (Draft, In Review, Published, Archived) | Yes |
| Review Date | KHReviewDate | Date | Yes |
| Target Audience | KHAudience | Managed Metadata (Audiences term set) | No |
| Tags | KHTags | Managed Metadata (multi-value) | No |
| View Count | KHViewCount | Number | No |
| Helpful Count | KHHelpfulCount | Number | No |

### FAQ Item (inherits from Item)

| Field | Internal Name | Type | Required |
|---|---|---|---|
| Question | Title | Single line of text | Yes |
| Answer | KHFAQAnswer | Multiple lines (Enhanced Rich Text) | Yes |
| Category | KHCategory | Managed Metadata (Categories term set) | Yes |
| Sort Order | KHSortOrder | Number | No |
| Helpful Yes | KHHelpfulYes | Number | No |
| Helpful No | KHHelpfulNo | Number | No |
| Keywords | KHKeywords | Multiple lines of text | No |

### Policy Document (inherits from Document)

| Field | Internal Name | Type | Required |
|---|---|---|---|
| Name | FileLeafRef | File | Yes |
| Policy Number | KHPolicyNumber | Single line of text | Yes |
| Effective Date | KHEffectiveDate | Date | Yes |
| Expiration Date | KHExpirationDate | Date | No |
| Compliance Area | KHComplianceArea | Managed Metadata | Yes |
| Mandatory | KHMandatory | Yes/No | No |
| Acknowledgment Required | KHAckRequired | Yes/No | No |

### Training Material (inherits from Document)

| Field | Internal Name | Type | Required |
|---|---|---|---|
| Name | FileLeafRef | File | Yes |
| Difficulty Level | KHDifficulty | Choice (Beginner, Intermediate, Advanced) | Yes |
| Estimated Duration | KHDuration | Single line of text | Yes |
| Prerequisites | KHPrerequisites | Multiple lines of text | No |
| Learning Path | KHLearningPath | Managed Metadata | No |
| Completion Tracking | KHTrackCompletion | Yes/No | No |

## Trade-offs

| Factor | Inherit from System | Custom Base Types |
|---|---|---|
| System field support | Automatic | Manual |
| Document features | Full support | Partial/none |
| Search compatibility | Native mappings | Custom mappings required |
| Content type hub | Reliable publishing | Potential issues |
| Flexibility | Constrained by parent | Full control |
| Upgrade path | Auto-inherits updates | Manual updates |

## Consequences

- `Deploy-ContentTypes.ps1` creates all four content types with proper parent inheritance and deploys site columns
- Content types are defined in `content-types.json` with explicit parent content type IDs
- All custom fields use the `KH` prefix to avoid naming collisions with system or third-party fields
- Managed metadata fields reference term sets deployed by `Deploy-Taxonomy.ps1` (see [ADR-004](./004-taxonomy-driven-navigation.md))
- Search schema (`search-schema.json`) maps all `KH*` crawled properties to managed properties
- Content type hub publishing is configured to push types to all associated sites automatically

## References

- [SharePoint content type overview](https://learn.microsoft.com/en-us/sharepoint/dev/schema/content-type-definitions)
- [Content Type IDs](https://learn.microsoft.com/en-us/previous-versions/office/developer/sharepoint-2010/aa543822(v=office.14))
- [Content type hub in SharePoint Online](https://learn.microsoft.com/en-us/sharepoint/manage-content-type-publishing)
