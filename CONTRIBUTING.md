# Contributing

Thank you for your interest in contributing to the SharePoint Knowledge Hub project.

## Prerequisites

- **Node.js** 18.x LTS (>= 18.17.1)
- **npm** 9+
- **Gulp CLI**: `npm install -g gulp-cli`
- **PnP.PowerShell** 2.x+: `Install-Module PnP.PowerShell`
- A **SharePoint Online** tenant with an App Catalog and SharePoint Administrator access
- **Global Reader** or **Search Administrator** role (for search configuration testing)

## Setup

```bash
# Clone and install
git clone https://github.com/your-org/sharepoint-knowledge-hub.git
cd sharepoint-knowledge-hub/spfx-webparts
npm install

# Start the local workbench
gulp serve
```

## Development Workflow

1. Create a feature branch from `main`: `git checkout -b feature/your-change`
2. Make your changes.
3. Test locally:
   - **SPFx web parts**: `gulp serve` and test in the SharePoint Workbench. Verify all property pane settings.
   - **Provisioning scripts**: Run with `-WhatIf` first, then test against a dev site.
   - **Migration scripts**: Test with a sample CSV before running on real data.
   - **Power Automate flows**: Validate JSON, then test-import in a dev environment.
4. Verify the build passes: `gulp build`
5. Commit with a clear message and open a Pull Request against `main`.

## Code Style

- **TypeScript**: Follow existing patterns. Use Fluent UI v9 components. Use PnP SPFx controls where applicable.
- **SPFx patterns**: Web parts should use `SPHttpClient` for list operations. Use the shared service layer (`services/`) for reusable logic. Support theme variants.
- **PowerShell**: Use `[CmdletBinding(SupportsShouldProcess)]` on all scripts. Use `PnP.PowerShell` cmdlets. Follow the `Write-StatusLine` convention for console output.
- **Governance docs**: Follow the existing Markdown structure. Include Mermaid diagrams where helpful.

## Submitting Changes

1. Ensure TypeScript compiles without errors (`gulp build`).
2. Ensure PowerShell scripts pass `Invoke-ScriptAnalyzer` and support `-WhatIf`.
3. Ensure all web parts handle loading, error, and empty states.
4. Include screenshots or HTML mockups for UI changes.
5. Open a Pull Request with a clear description of what changed and why.
