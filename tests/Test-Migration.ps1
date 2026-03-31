#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }

<#
.SYNOPSIS
    Pester v5 tests for the Knowledge Hub migration scripts and templates.

.DESCRIPTION
    Validates that each migration script exists, has correct parameters and
    help comments, and that CSV template files exist with correct headers.

.EXAMPLE
    Invoke-Pester -Path .\tests\Test-Migration.ps1
#>

BeforeAll {
    $projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    if (-not (Test-Path (Join-Path $projectRoot "migration"))) {
        $projectRoot = Split-Path -Parent $PSScriptRoot
    }
    $migrationDir = Join-Path $projectRoot "migration"
    $scriptsDir = Join-Path $migrationDir "scripts"
    $templatesDir = Join-Path $migrationDir "templates"
}

Describe "Migration Scripts" {

    Context "Import-ContentFromCsv.ps1" {
        BeforeAll {
            $scriptPath = Join-Path $scriptsDir "Import-ContentFromCsv.ps1"
        }

        It "Should exist at the expected path" {
            $scriptPath | Should -Exist
        }

        It "Should have CmdletBinding attribute" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[CmdletBinding'
        }

        It "Should have mandatory parameter SiteUrl" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Mandatory\s*=\s*\$true'
            $content | Should -Match '\$SiteUrl'
        }

        It "Should have mandatory parameter ListName" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$ListName'
        }

        It "Should have mandatory parameter CsvPath with validation" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$CsvPath'
            $content | Should -Match 'ValidateScript.*Test-Path'
        }

        It "Should have optional parameter MappingFile" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$MappingFile'
        }

        It "Should have parameter BatchSize with default of 50" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$BatchSize\s*=\s*50'
        }

        It "Should have parameter MaxRetries with ValidateRange" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'ValidateRange.*1.*10'
        }

        It "Should have .SYNOPSIS help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.SYNOPSIS'
        }

        It "Should have .DESCRIPTION help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.DESCRIPTION'
        }

        It "Should have .PARAMETER help comments" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.PARAMETER\s+SiteUrl'
            $content | Should -Match '\.PARAMETER\s+ListName'
            $content | Should -Match '\.PARAMETER\s+CsvPath'
        }

        It "Should have .EXAMPLE help comments" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.EXAMPLE'
        }

        It "Should have optional parameter Credential" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$Credential'
        }
    }

    Context "Export-SharePointContent.ps1" {
        BeforeAll {
            $scriptPath = Join-Path $scriptsDir "Export-SharePointContent.ps1"
        }

        It "Should exist at the expected path" {
            $scriptPath | Should -Exist
        }

        It "Should have CmdletBinding attribute" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[CmdletBinding'
        }

        It "Should have mandatory parameter SiteUrl" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Mandatory\s*=\s*\$true'
            $content | Should -Match '\$SiteUrl'
        }

        It "Should have mandatory parameter ListName" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$ListName'
        }

        It "Should have mandatory parameter OutputPath" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$OutputPath'
        }

        It "Should have switch parameter IncludeVersionHistory" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[switch\]\$IncludeVersionHistory'
        }

        It "Should have optional parameter Filter" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$Filter'
        }

        It "Should have optional parameter Credential" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$Credential'
        }

        It "Should have .SYNOPSIS help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.SYNOPSIS'
        }

        It "Should have .DESCRIPTION help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.DESCRIPTION'
        }

        It "Should have .EXAMPLE help comments" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.EXAMPLE'
        }

        It "Should set ErrorActionPreference to Stop" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match "\`\$ErrorActionPreference\s*=\s*['""]Stop['""]"
        }
    }

    Context "Validate-Migration.ps1" {
        BeforeAll {
            $scriptPath = Join-Path $scriptsDir "Validate-Migration.ps1"
        }

        It "Should exist at the expected path" {
            $scriptPath | Should -Exist
        }

        It "Should have CmdletBinding attribute" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[CmdletBinding'
        }

        It "Should have mandatory parameter SourceCsv with validation" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Mandatory\s*=\s*\$true'
            $content | Should -Match '\$SourceCsv'
            $content | Should -Match 'ValidateScript.*Test-Path'
        }

        It "Should have mandatory parameter SiteUrl" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$SiteUrl'
        }

        It "Should have mandatory parameter ListName" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$ListName'
        }

        It "Should have optional parameter MappingFile" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$MappingFile'
        }

        It "Should have optional parameter OutputPath" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$OutputPath'
        }

        It "Should have optional parameter Credential" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$Credential'
        }

        It "Should have .SYNOPSIS help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.SYNOPSIS'
        }

        It "Should have .DESCRIPTION help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.DESCRIPTION'
        }

        It "Should have .EXAMPLE help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.EXAMPLE'
        }

        It "Should set ErrorActionPreference to Stop" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match "\`\$ErrorActionPreference\s*=\s*['""]Stop['""]"
        }
    }

    Context "Transform-ContentMetadata.ps1" {
        BeforeAll {
            $scriptPath = Join-Path $scriptsDir "Transform-ContentMetadata.ps1"
        }

        It "Should exist at the expected path" {
            $scriptPath | Should -Exist
        }

        It "Should have CmdletBinding attribute" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[CmdletBinding'
        }

        It "Should have parameter InputCsv" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$InputCsv'
        }

        It "Should have parameter OutputCsv" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$OutputCsv'
        }

        It "Should have optional parameter MappingFile" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$MappingFile'
        }

        It "Should have parameter DateColumns" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$DateColumns'
        }

        It "Should have parameter UrlColumns" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$UrlColumns'
        }

        It "Should have parameter TitleColumn" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$TitleColumn'
        }

        It "Should have .SYNOPSIS help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.SYNOPSIS'
        }

        It "Should have .DESCRIPTION help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.DESCRIPTION'
        }

        It "Should have .EXAMPLE help comments" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.EXAMPLE'
        }

        It "Should describe supported transformations in help" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Title case|Whitespace|URL validation|Date format|Taxonomy'
        }
    }
}

Describe "Migration CSV Templates" {

    Context "Template files exist" {
        It "Should have the templates directory" {
            $templatesDir | Should -Exist
        }

        It "Should contain article-import-template.csv" {
            $path = Join-Path $templatesDir "article-import-template.csv"
            $path | Should -Exist
        }

        It "Should contain faq-import-template.csv" {
            $path = Join-Path $templatesDir "faq-import-template.csv"
            $path | Should -Exist
        }

        It "Should contain field-mapping-example.json" {
            $path = Join-Path $templatesDir "field-mapping-example.json"
            $path | Should -Exist
        }
    }

    Context "article-import-template.csv headers" {
        BeforeAll {
            $csvPath = Join-Path $templatesDir "article-import-template.csv"
            $csvContent = Get-Content -Path $csvPath
            $headerLine = $csvContent[0]
            $headers = $headerLine -split ','
        }

        It "Should have a header row" {
            $headerLine | Should -Not -BeNullOrEmpty
        }

        It "Should contain a Title column" {
            $headers | Should -Contain 'Title'
        }

        It "Should contain a Body column" {
            $headers | Should -Contain 'Body'
        }

        It "Should contain a Category column" {
            $headers | Should -Contain 'Category'
        }

        It "Should contain a Department column" {
            $headers | Should -Contain 'Department'
        }

        It "Should contain a Status column" {
            $headers | Should -Contain 'Status'
        }

        It "Should contain a ReviewDate column" {
            $headers | Should -Contain 'ReviewDate'
        }

        It "Should have sample data rows (at least 1 beyond header)" {
            $csvContent.Count | Should -BeGreaterThan 1
        }
    }

    Context "faq-import-template.csv headers" {
        BeforeAll {
            $csvPath = Join-Path $templatesDir "faq-import-template.csv"
            $csvContent = Get-Content -Path $csvPath
            $headerLine = $csvContent[0]
            $headers = $headerLine -split ','
        }

        It "Should have a header row" {
            $headerLine | Should -Not -BeNullOrEmpty
        }

        It "Should contain a Title column" {
            $headers | Should -Contain 'Title'
        }

        It "Should contain an Answer column" {
            $headers | Should -Contain 'Answer'
        }

        It "Should contain a Category column" {
            $headers | Should -Contain 'Category'
        }

        It "Should contain a SortOrder column" {
            $headers | Should -Contain 'SortOrder'
        }

        It "Should have sample data rows (at least 1 beyond header)" {
            $csvContent.Count | Should -BeGreaterThan 1
        }
    }

    Context "field-mapping-example.json validity" {
        BeforeAll {
            $jsonPath = Join-Path $templatesDir "field-mapping-example.json"
            $jsonContent = $null
            $parseError = $null
            try {
                $jsonContent = Get-Content -Path $jsonPath -Raw | ConvertFrom-Json
            }
            catch {
                $parseError = $_.Exception.Message
            }
        }

        It "Should be valid JSON" {
            $parseError | Should -BeNullOrEmpty
            $jsonContent | Should -Not -BeNullOrEmpty
        }
    }
}
