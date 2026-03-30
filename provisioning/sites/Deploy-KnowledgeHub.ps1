<#
.SYNOPSIS
    Deploys the Knowledge Hub site hierarchy to SharePoint Online.

.DESCRIPTION
    Creates the hub site and its four associated sites (Policies, TechDocs,
    Training, FAQs), configures mega-menu navigation, sets permissions,
    and applies the PnP site template.

    Requires:
    - PnP.PowerShell module (Install-Module PnP.PowerShell)
    - SharePoint Online tenant admin permissions

.PARAMETER TenantAdminUrl
    The SharePoint Online admin center URL (e.g., https://contoso-admin.sharepoint.com).

.PARAMETER HubSiteUrl
    The URL for the Knowledge Hub site (e.g., https://contoso.sharepoint.com/sites/KnowledgeHub).

.PARAMETER Credential
    PSCredential object for authentication. If not provided, interactive login is used.

.PARAMETER WhatIf
    Preview mode. Shows what would be created without making changes.

.EXAMPLE
    .\Deploy-KnowledgeHub.ps1 -TenantAdminUrl "https://contoso-admin.sharepoint.com" -HubSiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub"

.EXAMPLE
    $cred = Get-Credential
    .\Deploy-KnowledgeHub.ps1 -TenantAdminUrl "https://contoso-admin.sharepoint.com" -HubSiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -Credential $cred -WhatIf
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$TenantAdminUrl,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$HubSiteUrl,

    [Parameter(Mandatory = $false)]
    [PSCredential]$Credential,

    [Parameter(Mandatory = $false)]
    [string]$TemplateFile = "$PSScriptRoot\site-template.json"
)

# ─── Configuration ───────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$hubSiteTitle = "Knowledge Hub"
$hubSiteAlias = ($HubSiteUrl -split "/")[-1]
$tenantUrl = $HubSiteUrl -replace "/sites/.*$", ""

$associatedSites = @(
    @{
        Title = "Policies & Procedures"
        Alias = "KH-Policies"
        Url   = "$tenantUrl/sites/KH-Policies"
        Template = "STS#3"  # Modern team site (no group)
    },
    @{
        Title = "Technical Documentation"
        Alias = "KH-TechDocs"
        Url   = "$tenantUrl/sites/KH-TechDocs"
        Template = "STS#3"
    },
    @{
        Title = "Training Materials"
        Alias = "KH-Training"
        Url   = "$tenantUrl/sites/KH-Training"
        Template = "STS#3"
    },
    @{
        Title = "FAQs & Support"
        Alias = "KH-FAQs"
        Url   = "$tenantUrl/sites/KH-FAQs"
        Template = "STS#3"
    }
)

$permissionGroups = @{
    "KH Hub Owners"     = "Full Control"
    "KH Hub Members"    = "Edit"
    "KH Hub Visitors"   = "Read"
    "KH Content Authors" = "Edit"
}

# ─── Logging ─────────────────────────────────────────────────────────────────

$logFile = Join-Path $PSScriptRoot "Deploy-KnowledgeHub_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] [$Level] $Message"
    Write-Host $entry -ForegroundColor $(
        switch ($Level) {
            "ERROR"   { "Red" }
            "WARNING" { "Yellow" }
            "SUCCESS" { "Green" }
            default   { "White" }
        }
    )
    Add-Content -Path $logFile -Value $entry
}

# ─── Connection Helper ───────────────────────────────────────────────────────

function Connect-Site {
    param([string]$Url)
    $connectParams = @{ Url = $Url; ReturnConnection = $true }
    if ($Credential) {
        $connectParams.Credential = $Credential
    } else {
        $connectParams.Interactive = $true
    }
    return Connect-PnPOnline @connectParams
}

# ─── Main Deployment ─────────────────────────────────────────────────────────

try {
    Write-Log "============================================="
    Write-Log "Knowledge Hub Deployment Started"
    Write-Log "============================================="
    Write-Log "Tenant Admin URL : $TenantAdminUrl"
    Write-Log "Hub Site URL     : $HubSiteUrl"
    Write-Log "WhatIf Mode      : $($WhatIfPreference)"
    Write-Log "Log File         : $logFile"
    Write-Log ""

    # ── Step 1: Connect to tenant admin ──────────────────────────────────────

    Write-Log "Connecting to tenant admin..."
    $adminConn = Connect-Site -Url $TenantAdminUrl
    Write-Log "Connected to tenant admin" -Level "SUCCESS"

    # ── Step 2: Create Hub Site ──────────────────────────────────────────────

    Write-Log "Checking if hub site exists at $HubSiteUrl..."
    $existingHubSite = $null
    try {
        $existingHubSite = Get-PnPTenantSite -Url $HubSiteUrl -Connection $adminConn -ErrorAction SilentlyContinue
    } catch {
        # Site does not exist
    }

    if ($null -eq $existingHubSite) {
        if ($PSCmdlet.ShouldProcess($HubSiteUrl, "Create hub site")) {
            Write-Log "Creating hub site: $hubSiteTitle..."
            New-PnPSite -Type CommunicationSite `
                -Title $hubSiteTitle `
                -Url $HubSiteUrl `
                -Description "Enterprise Knowledge Hub - Central portal for organizational knowledge management." `
                -Connection $adminConn

            Write-Log "Hub site created successfully" -Level "SUCCESS"

            # Wait for site provisioning
            Start-Sleep -Seconds 10

            # Register as hub site
            Write-Log "Registering site as hub site..."
            Register-PnPHubSite -Site $HubSiteUrl -Connection $adminConn
            Write-Log "Hub site registration complete" -Level "SUCCESS"
        }
    } else {
        Write-Log "Hub site already exists at $HubSiteUrl" -Level "WARNING"
    }

    # ── Step 3: Create Associated Sites ──────────────────────────────────────

    foreach ($site in $associatedSites) {
        Write-Log ""
        Write-Log "Processing associated site: $($site.Title)..."

        $existingSite = $null
        try {
            $existingSite = Get-PnPTenantSite -Url $site.Url -Connection $adminConn -ErrorAction SilentlyContinue
        } catch {
            # Site does not exist
        }

        if ($null -eq $existingSite) {
            if ($PSCmdlet.ShouldProcess($site.Url, "Create associated site '$($site.Title)'")) {
                Write-Log "Creating site: $($site.Title) at $($site.Url)..."
                New-PnPSite -Type CommunicationSite `
                    -Title $site.Title `
                    -Url $site.Url `
                    -Description "Knowledge Hub associated site - $($site.Title)" `
                    -Connection $adminConn

                Write-Log "Site created: $($site.Title)" -Level "SUCCESS"

                # Wait for provisioning
                Start-Sleep -Seconds 5

                # Associate with hub
                Write-Log "Associating $($site.Title) with hub site..."
                Add-PnPHubSiteAssociation -Site $site.Url -HubSite $HubSiteUrl -Connection $adminConn
                Write-Log "Association complete" -Level "SUCCESS"
            }
        } else {
            Write-Log "Site already exists: $($site.Url)" -Level "WARNING"

            # Ensure hub association
            try {
                $siteProps = Get-PnPTenantSite -Url $site.Url -Connection $adminConn
                if ($siteProps.HubSiteId -eq [Guid]::Empty) {
                    if ($PSCmdlet.ShouldProcess($site.Url, "Associate with hub site")) {
                        Add-PnPHubSiteAssociation -Site $site.Url -HubSite $HubSiteUrl -Connection $adminConn
                        Write-Log "Added missing hub association for $($site.Title)" -Level "SUCCESS"
                    }
                }
            } catch {
                Write-Log "Could not verify hub association for $($site.Url): $_" -Level "WARNING"
            }
        }
    }

    # ── Step 4: Configure Hub Navigation ─────────────────────────────────────

    Write-Log ""
    Write-Log "Configuring hub navigation (mega menu)..."

    $hubConn = Connect-Site -Url $HubSiteUrl

    if ($PSCmdlet.ShouldProcess($HubSiteUrl, "Configure mega menu navigation")) {
        # Clear existing nav and build mega menu
        $topNav = Get-PnPNavigationNode -Location TopNavigationBar -Connection $hubConn
        foreach ($node in $topNav) {
            Remove-PnPNavigationNode -Identity $node.Id -Force -Connection $hubConn
        }

        # Home
        Add-PnPNavigationNode -Location TopNavigationBar -Title "Home" -Url $HubSiteUrl -Connection $hubConn

        # Knowledge Base
        $kbNode = Add-PnPNavigationNode -Location TopNavigationBar -Title "Knowledge Base" -Url "$HubSiteUrl/SitePages/Articles.aspx" -Connection $hubConn
        Add-PnPNavigationNode -Location TopNavigationBar -Title "All Articles" -Url "$HubSiteUrl/SitePages/Articles.aspx" -Parent $kbNode.Id -Connection $hubConn
        Add-PnPNavigationNode -Location TopNavigationBar -Title "Search" -Url "$HubSiteUrl/SitePages/Search.aspx" -Parent $kbNode.Id -Connection $hubConn
        Add-PnPNavigationNode -Location TopNavigationBar -Title "Recently Updated" -Url "$HubSiteUrl/SitePages/Recent.aspx" -Parent $kbNode.Id -Connection $hubConn

        # Policies
        Add-PnPNavigationNode -Location TopNavigationBar -Title "Policies" -Url "$tenantUrl/sites/KH-Policies" -Connection $hubConn

        # Technical Docs
        Add-PnPNavigationNode -Location TopNavigationBar -Title "Tech Docs" -Url "$tenantUrl/sites/KH-TechDocs" -Connection $hubConn

        # Training
        Add-PnPNavigationNode -Location TopNavigationBar -Title "Training" -Url "$tenantUrl/sites/KH-Training" -Connection $hubConn

        # FAQs
        Add-PnPNavigationNode -Location TopNavigationBar -Title "FAQs" -Url "$tenantUrl/sites/KH-FAQs" -Connection $hubConn

        Write-Log "Hub navigation configured" -Level "SUCCESS"
    }

    # ── Step 5: Set Permissions ──────────────────────────────────────────────

    Write-Log ""
    Write-Log "Configuring permissions..."

    if ($PSCmdlet.ShouldProcess($HubSiteUrl, "Configure SharePoint groups and permissions")) {
        foreach ($groupName in $permissionGroups.Keys) {
            $roleDefinition = $permissionGroups[$groupName]
            try {
                $group = Get-PnPGroup -Identity $groupName -Connection $hubConn -ErrorAction SilentlyContinue
                if ($null -eq $group) {
                    Write-Log "Creating group: $groupName with role: $roleDefinition"
                    New-PnPGroup -Title $groupName -Connection $hubConn
                    Set-PnPGroupPermissions -Identity $groupName -AddRole $roleDefinition -Connection $hubConn
                    Write-Log "Group created: $groupName" -Level "SUCCESS"
                } else {
                    Write-Log "Group already exists: $groupName" -Level "WARNING"
                }
            } catch {
                Write-Log "Failed to configure group '$groupName': $_" -Level "ERROR"
            }
        }
    }

    # ── Step 6: Apply PnP Site Template ──────────────────────────────────────

    if (Test-Path $TemplateFile) {
        Write-Log ""
        Write-Log "Applying PnP site template from $TemplateFile..."

        if ($PSCmdlet.ShouldProcess($HubSiteUrl, "Apply PnP site template")) {
            Invoke-PnPSiteTemplate -Path $TemplateFile -Connection $hubConn
            Write-Log "Site template applied" -Level "SUCCESS"
        }
    } else {
        Write-Log "Site template file not found at $TemplateFile - skipping template application" -Level "WARNING"
    }

    # ── Summary ──────────────────────────────────────────────────────────────

    Write-Log ""
    Write-Log "============================================="
    Write-Log "Deployment Summary"
    Write-Log "============================================="
    Write-Log "Hub Site     : $HubSiteUrl"
    foreach ($site in $associatedSites) {
        Write-Log "  Associated : $($site.Url) ($($site.Title))"
    }
    Write-Log ""
    Write-Log "Knowledge Hub deployment completed successfully!" -Level "SUCCESS"

} catch {
    Write-Log "DEPLOYMENT FAILED: $($_.Exception.Message)" -Level "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" -Level "ERROR"
    throw
} finally {
    # Disconnect all sessions
    try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch {}
    Write-Log "Disconnected from SharePoint Online"
    Write-Log "Full log available at: $logFile"
}
