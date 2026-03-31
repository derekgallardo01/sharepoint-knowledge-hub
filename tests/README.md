# Testing

## Test Categories

### Provisioning Script Tests (`Test-Provisioning.ps1`)

Pester v5 tests that validate the provisioning PowerShell scripts without requiring a live SharePoint environment. Tests verify:

- Scripts exist at expected paths (sites/, taxonomy/, content-types/, search/, monitoring/)
- CmdletBinding attributes and parameter declarations are correct
- SupportsShouldProcess (WhatIf) is enabled where applicable
- Help comments (.SYNOPSIS, .DESCRIPTION, .PARAMETER, .EXAMPLE) are present
- ErrorActionPreference and StrictMode are set
- Companion JSON configuration files exist alongside their scripts

### Migration Script Tests (`Test-Migration.ps1`)

Validates migration scripts and CSV templates:

- Import-ContentFromCsv.ps1 parameters and validation
- Export-SharePointContent.ps1 parameters
- Validate-Migration.ps1 parameters
- Transform-ContentMetadata.ps1 parameters and transformation descriptions
- CSV template files exist with correct headers (Title, Body, Category, etc.)
- field-mapping-example.json is valid JSON

## Prerequisites

- **PowerShell 5.1+** or **PowerShell 7+**
- **Pester v5+**: Install with `Install-Module Pester -MinimumVersion 5.0 -Scope CurrentUser`

## Running Tests

```powershell
# Run all tests
Invoke-Pester -Path .\tests\

# Run with detailed output
Invoke-Pester -Path .\tests\ -Output Detailed

# Run only provisioning tests
Invoke-Pester -Path .\tests\Test-Provisioning.ps1

# Run only migration tests
Invoke-Pester -Path .\tests\Test-Migration.ps1

# Generate NUnit XML report for CI
Invoke-Pester -Path .\tests\ -OutputFormat NUnitXml -OutputFile .\tests\results.xml
```

## Test Categories Overview

| Category | File | Requires Live Environment |
|---|---|---|
| Provisioning script validation | `Test-Provisioning.ps1` | No |
| Migration script validation | `Test-Migration.ps1` | No |
| CSV template validation | `Test-Migration.ps1` | No |
| Integration testing | (manual) | Yes (SharePoint Online tenant) |

## CI/CD Integration

### Azure DevOps Pipeline example

```yaml
steps:
  - task: PowerShell@2
    displayName: 'Run Pester Tests'
    inputs:
      targetType: 'inline'
      script: |
        Install-Module Pester -MinimumVersion 5.0 -Force -Scope CurrentUser
        $results = Invoke-Pester -Path .\tests\ -OutputFormat NUnitXml -OutputFile .\tests\results.xml -PassThru
        if ($results.FailedCount -gt 0) { exit 1 }
      pwsh: true

  - task: PublishTestResults@2
    inputs:
      testResultsFormat: 'NUnit'
      testResultsFiles: 'tests/results.xml'
    condition: always()
```

### GitHub Actions example

```yaml
- name: Run Pester Tests
  shell: pwsh
  run: |
    Install-Module Pester -MinimumVersion 5.0 -Force -Scope CurrentUser
    Invoke-Pester -Path .\tests\ -Output Detailed -CI
```

## Notes

- All tests run offline and do not require a SharePoint connection or PnP.PowerShell module.
- Provisioning scripts support `-WhatIf` for dry-run testing in live environments.
- Migration CSV templates include sample data rows that can be used for manual import testing.
- The `field-mapping-example.json` template documents the expected column mapping format.
