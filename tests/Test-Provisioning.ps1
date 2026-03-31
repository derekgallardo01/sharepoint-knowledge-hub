#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }

<#
.SYNOPSIS
    Pester v5 tests for the Knowledge Hub provisioning scripts.

.DESCRIPTION
    Validates that each provisioning script exists, has correct CmdletBinding,
    expected parameters, proper help comments, SupportsShouldProcess where
    applicable, and error handling.

.EXAMPLE
    Invoke-Pester -Path .\tests\Test-Provisioning.ps1
#>

BeforeAll {
    $projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    if (-not (Test-Path (Join-Path $projectRoot "provisioning"))) {
        $projectRoot = Split-Path -Parent $PSScriptRoot
    }
    $provisioningDir = Join-Path $projectRoot "provisioning"
}

Describe "Knowledge Hub Provisioning Scripts" {

    Context "Deploy-KnowledgeHub.ps1" {
        BeforeAll {
            $scriptPath = Join-Path $provisioningDir "sites" "Deploy-KnowledgeHub.ps1"
        }

        It "Should exist at the expected path" {
            $scriptPath | Should -Exist
        }

        It "Should have CmdletBinding attribute" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[CmdletBinding'
        }

        It "Should support -WhatIf (SupportsShouldProcess)" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'SupportsShouldProcess'
        }

        It "Should have mandatory parameter TenantAdminUrl" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Mandatory\s*=\s*\$true'
            $content | Should -Match '\$TenantAdminUrl'
        }

        It "Should have mandatory parameter HubSiteUrl" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$HubSiteUrl'
        }

        It "Should have optional parameter Credential" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[PSCredential\]\$Credential'
        }

        It "Should have optional parameter TemplateFile" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$TemplateFile'
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
            $content | Should -Match '\.PARAMETER\s+TenantAdminUrl'
            $content | Should -Match '\.PARAMETER\s+HubSiteUrl'
        }

        It "Should have .EXAMPLE help comment" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.EXAMPLE'
        }

        It "Should reference the site-template.json file" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'site-template\.json'
        }
    }

    Context "Deploy-Taxonomy.ps1" {
        BeforeAll {
            $scriptPath = Join-Path $provisioningDir "taxonomy" "Deploy-Taxonomy.ps1"
        }

        It "Should exist at the expected path" {
            $scriptPath | Should -Exist
        }

        It "Should have CmdletBinding attribute" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[CmdletBinding'
        }

        It "Should support -WhatIf (SupportsShouldProcess)" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'SupportsShouldProcess'
        }

        It "Should have mandatory parameter SiteUrl" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Mandatory\s*=\s*\$true'
            $content | Should -Match '\$SiteUrl'
        }

        It "Should have optional parameter TermStoreFile" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$TermStoreFile'
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

        It "Should reference the term-sets.json file" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'term-sets\.json'
        }
    }

    Context "Deploy-ContentTypes.ps1" {
        BeforeAll {
            $scriptPath = Join-Path $provisioningDir "content-types" "Deploy-ContentTypes.ps1"
        }

        It "Should exist at the expected path" {
            $scriptPath | Should -Exist
        }

        It "Should have CmdletBinding attribute" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[CmdletBinding'
        }

        It "Should support -WhatIf (SupportsShouldProcess)" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'SupportsShouldProcess'
        }

        It "Should have mandatory parameter SiteUrl" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Mandatory\s*=\s*\$true'
            $content | Should -Match '\$SiteUrl'
        }

        It "Should have optional parameter ContentTypesFile" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$ContentTypesFile'
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

        It "Should reference the content-types.json file" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'content-types\.json'
        }
    }

    Context "Configure-Search.ps1" {
        BeforeAll {
            $scriptPath = Join-Path $provisioningDir "search" "Configure-Search.ps1"
        }

        It "Should exist at the expected path" {
            $scriptPath | Should -Exist
        }

        It "Should have CmdletBinding attribute" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[CmdletBinding'
        }

        It "Should support -WhatIf (SupportsShouldProcess)" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'SupportsShouldProcess'
        }

        It "Should have mandatory parameter SiteUrl" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Mandatory\s*=\s*\$true'
            $content | Should -Match '\$SiteUrl'
        }

        It "Should have optional parameter SearchSchemaFile" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$SearchSchemaFile'
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

        It "Should reference the search-schema.json file" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'search-schema\.json'
        }
    }

    Context "Monitor-ContentHealth.ps1" {
        BeforeAll {
            $scriptPath = Join-Path $provisioningDir "monitoring" "Monitor-ContentHealth.ps1"
        }

        It "Should exist at the expected path" {
            $scriptPath | Should -Exist
        }

        It "Should have CmdletBinding attribute" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\[CmdletBinding'
        }

        It "Should support -WhatIf (SupportsShouldProcess)" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'SupportsShouldProcess'
        }

        It "Should have mandatory parameter SiteUrl" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Mandatory\s*=\s*\$true'
            $content | Should -Match '\$SiteUrl'
        }

        It "Should validate SiteUrl is a SharePoint URL" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'ValidatePattern.*sharepoint\.com'
        }

        It "Should have parameter DaysStale with default value of 90" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$DaysStale\s*=\s*90'
        }

        It "Should have parameter ListName with default value" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\$ListName\s*=\s*"Knowledge Articles"'
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

        It "Should have .PARAMETER help comments" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.PARAMETER\s+SiteUrl'
            $content | Should -Match '\.PARAMETER\s+DaysStale'
        }

        It "Should have .EXAMPLE help comments" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match '\.EXAMPLE'
        }

        It "Should set ErrorActionPreference to Stop" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match "\`\$ErrorActionPreference\s*=\s*['""]Stop['""]"
        }

        It "Should set StrictMode" {
            $content = Get-Content -Path $scriptPath -Raw
            $content | Should -Match 'Set-StrictMode'
        }
    }

    Context "Companion JSON configuration files exist" {
        It "Should have site-template.json alongside Deploy-KnowledgeHub.ps1" {
            $path = Join-Path $provisioningDir "sites" "site-template.json"
            $path | Should -Exist
        }

        It "Should have term-sets.json alongside Deploy-Taxonomy.ps1" {
            $path = Join-Path $provisioningDir "taxonomy" "term-sets.json"
            $path | Should -Exist
        }

        It "Should have content-types.json alongside Deploy-ContentTypes.ps1" {
            $path = Join-Path $provisioningDir "content-types" "content-types.json"
            $path | Should -Exist
        }

        It "Should have search-schema.json alongside Configure-Search.ps1" {
            $path = Join-Path $provisioningDir "search" "search-schema.json"
            $path | Should -Exist
        }
    }
}
