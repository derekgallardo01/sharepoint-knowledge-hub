# Content Type Hierarchy

The Knowledge Hub uses SharePoint content type inheritance to define structured content schemas. System content types (Item and Document) serve as the base, with custom content types inheriting and extending them with Knowledge Hub-specific fields.

```mermaid
graph TD
    subgraph SystemTypes["System Content Types"]
        style SystemTypes fill:#0078d4,color:#fff,stroke:#005a9e,stroke-width:2px
        Item["<b>Item</b><br/>ID: 0x01<br/><br/><i>Built-in Fields:</i><br/>Title<br/>Created / Modified<br/>Created By / Modified By"]
        Document["<b>Document</b><br/>ID: 0x0101<br/><br/><i>Built-in Fields:</i><br/>Name / Title<br/>File Size / Type<br/>Created / Modified<br/>Checked Out To"]
    end

    subgraph CustomListTypes["Custom List Content Types"]
        style CustomListTypes fill:#107c10,color:#fff,stroke:#0b5c0b,stroke-width:2px
        KA["<b>Knowledge Article</b><br/>ID: 0x010100A1...<br/><br/><i>Custom Fields:</i><br/>KHBody (Rich Text)<br/>KHDescription (Text)<br/>KHCategory (Taxonomy)<br/>KHDepartment (Taxonomy)<br/>KHTags (Text, multi)<br/>KHReviewDate (DateTime)<br/>KHStatus (Choice)<br/>KHViewCount (Number)<br/>KHThumbnail (Image)"]
        FAQ["<b>FAQ Item</b><br/>ID: 0x010100B2...<br/><br/><i>Custom Fields:</i><br/>KHAnswer (Rich Text)<br/>KHCategory (Taxonomy)<br/>KHSortOrder (Number)<br/>KHHelpfulCount (Number)<br/>KHNotHelpfulCount (Number)"]
    end

    subgraph CustomDocTypes["Custom Document Content Types"]
        style CustomDocTypes fill:#5c2d91,color:#fff,stroke:#441f6e,stroke-width:2px
        PD["<b>Policy Document</b><br/>ID: 0x010101C3...<br/><br/><i>Custom Fields:</i><br/>KHCategory (Taxonomy)<br/>KHDepartment (Taxonomy)<br/>KHEffectiveDate (DateTime)<br/>KHReviewDate (DateTime)<br/>KHPolicyOwner (Person)<br/>KHStatus (Choice)"]
        TM["<b>Training Material</b><br/>ID: 0x010101D4...<br/><br/><i>Custom Fields:</i><br/>KHCategory (Taxonomy)<br/>KHDepartment (Taxonomy)<br/>KHAudience (Taxonomy)<br/>KHDuration (Text)<br/>KHDifficulty (Choice)<br/>KHStatus (Choice)"]
    end

    Item -->|"Inherits"| KA
    Item -->|"Inherits"| FAQ
    Document -->|"Inherits"| PD
    Document -->|"Inherits"| TM

    subgraph SharedColumns["Shared Site Columns (KH Prefix)"]
        style SharedColumns fill:#323130,color:#fff,stroke:#201f1e,stroke-width:2px
        SC["KHCategory &bull; KHDepartment &bull; KHStatus<br/>KHReviewDate &bull; KHTags &bull; KHAudience"]
    end

    SC -.->|"Used by"| KA
    SC -.->|"Used by"| FAQ
    SC -.->|"Used by"| PD
    SC -.->|"Used by"| TM
```

## Field Details

### Knowledge Article Fields

| Field | Internal Name | Type | Required | Description |
|---|---|---|---|---|
| Title | `Title` | Single line of text | Yes | Article title (inherited from Item) |
| Body | `KHBody` | Rich text (HTML) | Yes | Full article content |
| Description | `KHDescription` | Multiple lines (plain) | No | Short summary for search results |
| Category | `KHCategory` | Managed Metadata | Yes | Primary topic category |
| Department | `KHDepartment` | Managed Metadata | Yes | Owning department |
| Tags | `KHTags` | Single line of text | No | Semicolon-separated keywords |
| Review Date | `KHReviewDate` | Date/Time | Yes | Next scheduled review |
| Status | `KHStatus` | Choice | Yes | Draft, In Review, Published, Archived |
| View Count | `KHViewCount` | Number | No | Total page views |
| Thumbnail | `KHThumbnail` | Image | No | Card thumbnail image |

### FAQ Item Fields

| Field | Internal Name | Type | Required | Description |
|---|---|---|---|---|
| Question | `Title` | Single line of text | Yes | The FAQ question (uses Title field) |
| Answer | `KHAnswer` | Rich text (HTML) | Yes | The answer content |
| Category | `KHCategory` | Managed Metadata | Yes | FAQ category |
| Sort Order | `KHSortOrder` | Number | No | Display order within category |
| Helpful Count | `KHHelpfulCount` | Number | No | "Yes, helpful" votes |
| Not Helpful Count | `KHNotHelpfulCount` | Number | No | "No, not helpful" votes |

### Policy Document Fields

| Field | Internal Name | Type | Required | Description |
|---|---|---|---|---|
| Category | `KHCategory` | Managed Metadata | Yes | Policy category |
| Department | `KHDepartment` | Managed Metadata | Yes | Owning department |
| Effective Date | `KHEffectiveDate` | Date/Time | Yes | When policy takes effect |
| Review Date | `KHReviewDate` | Date/Time | Yes | Next review date |
| Policy Owner | `KHPolicyOwner` | Person or Group | Yes | Responsible person |
| Status | `KHStatus` | Choice | Yes | Draft, In Review, Published, Archived |

### Training Material Fields

| Field | Internal Name | Type | Required | Description |
|---|---|---|---|---|
| Category | `KHCategory` | Managed Metadata | Yes | Training category |
| Department | `KHDepartment` | Managed Metadata | Yes | Owning department |
| Audience | `KHAudience` | Managed Metadata | Yes | Target audience |
| Duration | `KHDuration` | Single line of text | No | Estimated duration (e.g., "45 min") |
| Difficulty | `KHDifficulty` | Choice | No | Beginner, Intermediate, Advanced |
| Status | `KHStatus` | Choice | Yes | Draft, In Review, Published, Archived |
