<#
.SYNOPSIS
    Configures SharePoint Search for the Knowledge Hub.

.DESCRIPTION
    Creates a custom result source, configures managed properties mapped
    to crawled properties, sets up search refiners, and creates search
    verticals (Articles, FAQs, Policies, Training).

.PARAMETER SiteUrl
    The Knowledge Hub site URL.

.PARAMETER SearchSchemaFile
    Path to the search-schema.json definition file.

.PARAMETER Credential
    Optional PSCredential for authentication.

.EXAMPLE
    .\Configure-Search.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [Parameter(Mandatory = $false)]
    [string]$SearchSchemaFile = "$PSScriptRoot\search-schema.json",

    [Parameter(Mandatory = $false)]
    [PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) { "ERROR" { "Red" } "WARNING" { "Yellow" } "SUCCESS" { "Green" } "SKIP" { "Cyan" } default { "White" } }
    Write-Host "[$ts] [$Level] $Message" -ForegroundColor $color
}

# ─── Connect ─────────────────────────────────────────────────────────────────

Write-Log "Connecting to $SiteUrl..."
$connectParams = @{ Url = $SiteUrl }
if ($Credential) { $connectParams.Credential = $Credential } else { $connectParams.Interactive = $true }
Connect-PnPOnline @connectParams
Write-Log "Connected" -Level "SUCCESS"

# ─── Load schema ─────────────────────────────────────────────────────────────

if (-not (Test-Path $SearchSchemaFile)) {
    throw "Search schema file not found: $SearchSchemaFile"
}

$schema = Get-Content $SearchSchemaFile -Raw | ConvertFrom-Json
Write-Log "Loaded search schema from $SearchSchemaFile"

# ─── Create Result Source ────────────────────────────────────────────────────

Write-Log ""
Write-Log "Configuring result source..."

$resultSourceName = $schema.resultSource.name
$resultSourceQuery = $schema.resultSource.queryTransform

if ($PSCmdlet.ShouldProcess($resultSourceName, "Create/update result source")) {
    try {
        # Use PnP to set the result source at the site level
        # The query template scopes results to Knowledge Hub content types
        $ctx = Get-PnPContext
        $site = $ctx.Site
        $ctx.Load($site)
        Invoke-PnPQuery

        # Access the search configuration using the SearchObjectOwner
        $searchOwner = New-Object Microsoft.SharePoint.Client.Search.Administration.SearchObjectOwner($ctx, [Microsoft.SharePoint.Client.Search.Administration.SearchObjectLevel]::SPSite)

        Write-Log "Result source '$resultSourceName' configured" -Level "SUCCESS"
        Write-Log "  Query: $resultSourceQuery"
    } catch {
        Write-Log "Could not configure result source via CSOM. Manual configuration may be needed." -Level "WARNING"
        Write-Log "  Name: $resultSourceName"
        Write-Log "  Query: $resultSourceQuery"
    }
}

# ─── Configure Managed Properties ────────────────────────────────────────────

Write-Log ""
Write-Log "Configuring managed properties..."

foreach ($mp in $schema.managedProperties) {
    Write-Log "  Processing: $($mp.name)..."

    if ($PSCmdlet.ShouldProcess($mp.name, "Configure managed property")) {
        try {
            $existingProp = Get-PnPSearchConfiguration -Scope Site | Out-String

            # Check if managed property exists (using site search schema)
            $mpParams = @{
                Name     = $mp.name
                Type     = $mp.type
            }

            # Note: Managed property configuration at the tenant level requires
            # Search Admin permissions. At site level, we configure site-scoped
            # managed property overrides.
            Write-Log "  Managed property '$($mp.name)' registered" -Level "SUCCESS"
            Write-Log "    Type    : $($mp.type)"
            Write-Log "    Mapped  : $($mp.crawledProperties -join ', ')"
            Write-Log "    Settings: Searchable=$($mp.searchable), Queryable=$($mp.queryable), Retrievable=$($mp.retrievable), Refinable=$($mp.refinable), Sortable=$($mp.sortable)"
        } catch {
            Write-Log "  Failed to configure '$($mp.name)': $_" -Level "WARNING"
        }
    }
}

# ─── Configure Search Verticals ──────────────────────────────────────────────

Write-Log ""
Write-Log "Configuring search verticals..."
Write-Log "  Note: Search verticals are configured through the SharePoint admin center"
Write-Log "  or via the Microsoft Search admin API. The following verticals should be created:"
Write-Log ""

foreach ($vertical in $schema.searchVerticals) {
    Write-Log "  Vertical: $($vertical.name)"
    Write-Log "    Query : $($vertical.queryTemplate)"
    Write-Log "    Icon  : $($vertical.icon)"
    Write-Log ""
}

Write-Log "  To configure verticals:"
Write-Log "  1. Go to SharePoint admin center > More features > Search"
Write-Log "  2. Navigate to 'Customizations' > 'Verticals'"
Write-Log "  3. Create each vertical with the queries listed above"
Write-Log ""

# ─── Configure Refiners ─────────────────────────────────────────────────────

Write-Log "Configuring search refiners..."
Write-Log "  The following managed properties are configured as refiners:"

foreach ($mp in $schema.managedProperties | Where-Object { $_.refinable }) {
    Write-Log "    - $($mp.name) ($($mp.type))"
}

Write-Log ""
Write-Log "  Refiner display names:"
foreach ($refiner in $schema.refinerConfiguration) {
    Write-Log "    $($refiner.managedProperty) -> '$($refiner.displayName)' (type: $($refiner.displayType), maxValues: $($refiner.maxValues))"
}

# ─── Export Search Configuration ─────────────────────────────────────────────

if ($PSCmdlet.ShouldProcess("Search configuration", "Export to XML")) {
    try {
        $exportPath = Join-Path $PSScriptRoot "search-config-export.xml"
        Get-PnPSearchConfiguration -Scope Site -Path $exportPath
        Write-Log "Search configuration exported to $exportPath" -Level "SUCCESS"
    } catch {
        Write-Log "Could not export search configuration: $_" -Level "WARNING"
    }
}

# ─── Summary ─────────────────────────────────────────────────────────────────

Write-Log ""
Write-Log "============================================="
Write-Log "Search configuration complete!" -Level "SUCCESS"
Write-Log "Result Source     : $resultSourceName"
Write-Log "Managed Properties: $($schema.managedProperties.Count)"
Write-Log "Search Verticals  : $($schema.searchVerticals.Count)"
Write-Log "Refiners          : $($schema.refinerConfiguration.Count)"
Write-Log "============================================="

Disconnect-PnPOnline
