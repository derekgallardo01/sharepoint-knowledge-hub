<#
.SYNOPSIS
    Exports SharePoint list items or document library contents to CSV.

.DESCRIPTION
    Exports list items with all metadata to CSV format. For document libraries,
    also exports file metadata and version history information. Useful for
    content backup and migration validation.

.PARAMETER SiteUrl
    The SharePoint site URL to export from.

.PARAMETER ListName
    The list or document library to export.

.PARAMETER OutputPath
    Directory where the CSV export file will be saved.

.PARAMETER IncludeVersionHistory
    Include version history summary (version count, latest version) in export.

.PARAMETER Filter
    Optional CAML query filter to export a subset of items.

.PARAMETER Credential
    Optional PSCredential for authentication.

.EXAMPLE
    .\Export-SharePointContent.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -ListName "Knowledge Articles" -OutputPath "C:\Exports"

.EXAMPLE
    .\Export-SharePointContent.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -ListName "Knowledge Articles" -OutputPath "C:\Exports" -IncludeVersionHistory
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [Parameter(Mandatory = $true)]
    [string]$ListName,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [Parameter(Mandatory = $false)]
    [switch]$IncludeVersionHistory,

    [Parameter(Mandatory = $false)]
    [string]$Filter,

    [Parameter(Mandatory = $false)]
    [PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) { "ERROR" { "Red" } "WARNING" { "Yellow" } "SUCCESS" { "Green" } default { "White" } }
    Write-Host "[$ts] [$Level] $Message" -ForegroundColor $color
}

# ─── Connect ─────────────────────────────────────────────────────────────────

Write-Log "Connecting to $SiteUrl..."
$connectParams = @{ Url = $SiteUrl }
if ($Credential) { $connectParams.Credential = $Credential } else { $connectParams.Interactive = $true }
Connect-PnPOnline @connectParams
Write-Log "Connected" -Level "SUCCESS"

# ─── Validate ────────────────────────────────────────────────────────────────

if (-not (Test-Path $OutputPath)) {
    New-Item -Path $OutputPath -ItemType Directory -Force | Out-Null
    Write-Log "Created output directory: $OutputPath"
}

$list = Get-PnPList -Identity $ListName -ErrorAction Stop
$isDocLib = $list.BaseTemplate -eq 101
Write-Log "List: $ListName (BaseTemplate: $($list.BaseTemplate), Items: $($list.ItemCount))"

# ─── Export Items ────────────────────────────────────────────────────────────

Write-Log "Retrieving items..."

$getItemParams = @{
    List     = $ListName
    PageSize = 500
    Fields   = "*"
}

if ($Filter) {
    $getItemParams.Query = $Filter
}

$items = Get-PnPListItem @getItemParams
$totalItems = $items.Count
Write-Log "Retrieved $totalItems items"

if ($totalItems -eq 0) {
    Write-Log "No items to export." -Level "WARNING"
    Disconnect-PnPOnline
    exit 0
}

# ─── Build Export Data ───────────────────────────────────────────────────────

Write-Log "Processing items for export..."

$exportData = @()
$count = 0

foreach ($item in $items) {
    $count++
    Write-Progress -Activity "Exporting $ListName" `
        -Status "Processing item $count of $totalItems" `
        -PercentComplete (($count / $totalItems) * 100)

    $record = [ordered]@{
        ID            = $item.Id
        Title         = $item["Title"]
        Created       = $item["Created"]
        Modified      = $item["Modified"]
        Author        = $item["Author"].LookupValue
        Editor        = $item["Editor"].LookupValue
        ContentType   = $item["ContentType"].Name
    }

    # Export all custom Knowledge Hub fields
    $fieldPrefixes = @("KH")
    foreach ($fieldName in $item.FieldValues.Keys) {
        $isKHField = $false
        foreach ($prefix in $fieldPrefixes) {
            if ($fieldName.StartsWith($prefix)) {
                $isKHField = $true
                break
            }
        }

        if ($isKHField) {
            $value = $item[$fieldName]

            # Handle taxonomy fields
            if ($value -is [Microsoft.SharePoint.Client.Taxonomy.TaxonomyFieldValue]) {
                $record[$fieldName] = $value.Label
                $record["${fieldName}_TermId"] = $value.TermGuid
            }
            # Handle lookup fields
            elseif ($value -is [Microsoft.SharePoint.Client.FieldLookupValue]) {
                $record[$fieldName] = $value.LookupValue
            }
            # Handle user fields
            elseif ($value -is [Microsoft.SharePoint.Client.FieldUserValue]) {
                $record[$fieldName] = $value.LookupValue
                $record["${fieldName}_Email"] = $value.Email
            }
            else {
                $record[$fieldName] = $value
            }
        }
    }

    # Document library specific fields
    if ($isDocLib) {
        $record["FileRef"]          = $item["FileRef"]
        $record["FileLeafRef"]      = $item["FileLeafRef"]
        $record["File_x0020_Size"]  = $item["File_x0020_Size"]
        $record["CheckoutUser"]     = $item["CheckoutUser"]?.LookupValue ?? ""
    }

    # Version history
    if ($IncludeVersionHistory) {
        try {
            $versions = Get-PnPProperty -ClientObject $item -Property "Versions"
            $record["VersionCount"] = $versions.Count
            if ($versions.Count -gt 0) {
                $record["LatestVersion"] = $versions[0].VersionLabel
            }
        } catch {
            $record["VersionCount"] = "Error"
            Write-Log "  Could not get versions for item $($item.Id): $_" -Level "WARNING"
        }
    }

    $exportData += [PSCustomObject]$record
}

Write-Progress -Activity "Exporting" -Completed

# ─── Write CSV ───────────────────────────────────────────────────────────────

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$safeListName = $ListName -replace '[^\w]', '_'
$csvFileName = "${safeListName}_export_${timestamp}.csv"
$csvPath = Join-Path $OutputPath $csvFileName

Write-Log "Writing CSV to $csvPath..."
$exportData | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
Write-Log "CSV export complete: $csvPath" -Level "SUCCESS"

# ─── Summary ─────────────────────────────────────────────────────────────────

$fileSize = [math]::Round((Get-Item $csvPath).Length / 1KB, 1)

Write-Log ""
Write-Log "============================================="
Write-Log "Export Complete!" -Level "SUCCESS"
Write-Log "============================================="
Write-Log "List       : $ListName"
Write-Log "Items      : $totalItems"
Write-Log "Output     : $csvPath"
Write-Log "File Size  : ${fileSize} KB"
Write-Log "============================================="

Disconnect-PnPOnline
