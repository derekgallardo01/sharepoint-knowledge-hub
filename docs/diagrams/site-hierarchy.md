# Hub Site Architecture

The following diagram illustrates the SharePoint Online hub site architecture, including the central Knowledge Hub and its four associated sites. Hub navigation (mega menu) connects all sites into a unified information architecture.

```mermaid
graph TD
    subgraph HubSite["Knowledge Hub (Hub Site)"]
        style HubSite fill:#0078d4,color:#fff,stroke:#005a9e,stroke-width:3px
        KH["<b>Knowledge Hub</b><br/>/sites/KnowledgeHub<br/><br/>Central Portal &amp; Search<br/>Featured Content<br/>Knowledge Articles<br/>FAQs<br/>Article Feedback"]
    end

    subgraph Policies["Policies & Procedures"]
        style Policies fill:#107c10,color:#fff,stroke:#0b5c0b,stroke-width:2px
        P["<b>Policies & Procedures</b><br/>/sites/KH-Policies<br/><br/>Policy Documents<br/>Compliance Guides<br/>SOP Templates<br/>Regulatory Standards"]
    end

    subgraph TechDocs["Technical Documentation"]
        style TechDocs fill:#5c2d91,color:#fff,stroke:#441f6e,stroke-width:2px
        T["<b>Technical Documentation</b><br/>/sites/KH-TechDocs<br/><br/>API Documentation<br/>Architecture Guides<br/>Runbooks &amp; Playbooks<br/>Code Standards"]
    end

    subgraph Training["Training & Onboarding"]
        style Training fill:#ca5010,color:#fff,stroke:#a1400c,stroke-width:2px
        TR["<b>Training & Onboarding</b><br/>/sites/KH-Training<br/><br/>Training Courses<br/>Tutorials &amp; Videos<br/>Learning Paths<br/>Certification Guides"]
    end

    subgraph FAQs["FAQs & How-To Guides"]
        style FAQs fill:#008272,color:#fff,stroke:#005e54,stroke-width:2px
        F["<b>FAQs & How-To Guides</b><br/>/sites/KH-FAQs<br/><br/>FAQ Items<br/>Troubleshooting Guides<br/>Support Articles<br/>Quick Reference Cards"]
    end

    KH -->|"Hub Navigation<br/>(Mega Menu)"| P
    KH -->|"Hub Navigation<br/>(Mega Menu)"| T
    KH -->|"Hub Navigation<br/>(Mega Menu)"| TR
    KH -->|"Hub Navigation<br/>(Mega Menu)"| F

    P -.->|"Shared Navigation<br/>& Search"| KH
    T -.->|"Shared Navigation<br/>& Search"| KH
    TR -.->|"Shared Navigation<br/>& Search"| KH
    F -.->|"Shared Navigation<br/>& Search"| KH

    subgraph SharedServices["Shared Platform Services"]
        style SharedServices fill:#323130,color:#fff,stroke:#201f1e,stroke-width:2px
        MMS["Managed Metadata<br/>Service"]
        Search["SharePoint<br/>Search"]
        PA["Power Automate<br/>Workflows"]
    end

    KH --- MMS
    KH --- Search
    KH --- PA
```

## Navigation Model

All associated sites inherit the hub site mega menu navigation, providing a consistent top-level experience across the entire Knowledge Hub ecosystem. Users can seamlessly navigate between any site without losing context.

| Navigation Element | Scope | Items |
|---|---|---|
| **Hub Mega Menu** | All 5 sites | Home, Knowledge Base, Policies, Tech Docs, Training, FAQs |
| **Hub Site Local Nav** | Knowledge Hub only | Home, Articles, FAQs, Search, Categories, Submit Content |
| **Associated Site Local Nav** | Each associated site | Home, Documents, By Category, By Department, Recent |
