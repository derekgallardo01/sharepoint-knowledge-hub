<#
.SYNOPSIS
    Validates migrated content by comparing source CSV with SharePoint list.

.DESCRIPTION
    Compares the source CSV file used for import with the actual SharePoint
    list contents. Reports missing items, field mismatches, and metadata
    errors. Generates an HTML validation report.

.PARAMETER SourceCsv
    Path to the original source CSV that was imported.

.PARAMETER SiteUrl
    The SharePoint site URL containing the imported content.

.PARAMETER ListName
    The target SharePoint list to validate against.

.PARAMETER MappingFile
    Optional column mapping file (same format as Import-ContentFromCsv).

.PARAMETER OutputPath
    Directory for the validation report (defaults to same directory as CSV).

.PARAMETER Credential
    Optional PSCredential for authentication.

.EXAMPLE
    .\Validate-Migration.ps1 -SourceCsv ".\articles.csv" -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -ListName "Knowledge Articles"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ })]
    [string]$SourceCsv,

    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [Parameter(Mandatory = $true)]
    [string]$ListName,

    [Parameter(Mandatory = $false)]
    [string]$MappingFile,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath,

    [Parameter(Mandatory = $false)]
    [PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) { "ERROR" { "Red" } "WARNING" { "Yellow" } "SUCCESS" { "Green" } "MISMATCH" { "DarkYellow" } default { "White" } }
    Write-Host "[$ts] [$Level] $Message" -ForegroundColor $color
}

if (-not $OutputPath) {
    $OutputPath = Split-Path $SourceCsv
}

# ─── Connect ─────────────────────────────────────────────────────────────────

Write-Log "Connecting to $SiteUrl..."
$connectParams = @{ Url = $SiteUrl }
if ($Credential) { $connectParams.Credential = $Credential } else { $connectParams.Interactive = $true }
Connect-PnPOnline @connectParams
Write-Log "Connected" -Level "SUCCESS"

# ─── Load Source Data ────────────────────────────────────────────────────────

Write-Log "Loading source CSV..."
$sourceData = Import-Csv -Path $SourceCsv -Encoding UTF8
$sourceCount = $sourceData.Count
Write-Log "Source CSV: $sourceCount rows"

# ─── Load SharePoint Data ───────────────────────────────────────────────────

Write-Log "Loading SharePoint list data..."
$spItems = Get-PnPListItem -List $ListName -PageSize 500 -Fields "*"
$spCount = $spItems.Count
Write-Log "SharePoint list: $spCount items"

# ─── Build lookup by Title ───────────────────────────────────────────────────

$spLookup = @{}
foreach ($item in $spItems) {
    $title = $item["Title"]
    if ($title) {
        if (-not $spLookup.ContainsKey($title)) {
            $spLookup[$title] = @()
        }
        $spLookup[$title] += $item
    }
}

# ─── Load Column Mapping ─────────────────────────────────────────────────────

$columnMap = @{}
if ($MappingFile -and (Test-Path $MappingFile)) {
    $mappingDef = Get-Content $MappingFile -Raw | ConvertFrom-Json
    foreach ($mapping in $mappingDef.mappings) {
        $columnMap[$mapping.sourceColumn] = $mapping.targetField
    }
    Write-Log "Loaded column mapping from $MappingFile"
} else {
    # Direct mapping
    foreach ($header in $sourceData[0].PSObject.Properties.Name) {
        $columnMap[$header] = $header
    }
}

# ─── Validate ────────────────────────────────────────────────────────────────

Write-Log ""
Write-Log "Starting validation..."

$validationResults = @()
$missingItems = @()
$mismatchItems = @()
$matchedItems = @()
$rowNumber = 1

foreach ($sourceRow in $sourceData) {
    $rowNumber++
    $sourceTitle = $sourceRow.Title

    Write-Progress -Activity "Validating migration" `
        -Status "Row $rowNumber of $($sourceCount + 1)" `
        -PercentComplete (($rowNumber / ($sourceCount + 1)) * 100)

    # Find matching SP item
    $matches = $spLookup[$sourceTitle]

    if (-not $matches -or $matches.Count -eq 0) {
        $missingItems += [PSCustomObject]@{
            Row    = $rowNumber
            Title  = $sourceTitle
            Issue  = "Item not found in SharePoint list"
        }
        Write-Log "  Row $rowNumber: MISSING - '$sourceTitle'" -Level "ERROR"
        continue
    }

    $spItem = $matches[0]  # Use first match if duplicates exist

    # Compare fields
    $fieldMismatches = @()

    foreach ($csvColumn in $columnMap.Keys) {
        if ($csvColumn -eq "Title") { continue }  # Already matched

        $targetField = $columnMap[$csvColumn]
        $sourceValue = $sourceRow.$csvColumn
        $spValue = $spItem[$targetField]

        # Normalize values for comparison
        if ($null -eq $sourceValue) { $sourceValue = "" }
        if ($null -eq $spValue) { $spValue = "" }

        # Handle taxonomy field values
        if ($spValue -is [Microsoft.SharePoint.Client.Taxonomy.TaxonomyFieldValue]) {
            $spValue = $spValue.Label
        }
        # Handle lookup values
        elseif ($spValue -is [Microsoft.SharePoint.Client.FieldLookupValue]) {
            $spValue = $spValue.LookupValue
        }

        $sourceStr = $sourceValue.ToString().Trim()
        $spStr = $spValue.ToString().Trim()

        if ($sourceStr -ne $spStr -and -not [string]::IsNullOrEmpty($sourceStr)) {
            $fieldMismatches += [PSCustomObject]@{
                Field       = $csvColumn
                SourceValue = $sourceStr
                SPValue     = $spStr
            }
        }
    }

    if ($fieldMismatches.Count -gt 0) {
        $mismatchItems += [PSCustomObject]@{
            Row        = $rowNumber
            Title      = $sourceTitle
            Mismatches = $fieldMismatches
        }
        Write-Log "  Row $rowNumber: MISMATCH - '$sourceTitle' ($($fieldMismatches.Count) fields)" -Level "MISMATCH"
    } else {
        $matchedItems += [PSCustomObject]@{
            Row   = $rowNumber
            Title = $sourceTitle
        }
    }

    if ($matches.Count -gt 1) {
        Write-Log "  Row $rowNumber: WARNING - '$sourceTitle' has $($matches.Count) duplicates in SP" -Level "WARNING"
    }
}

Write-Progress -Activity "Validating" -Completed

# ─── Check for extra items in SP ─────────────────────────────────────────────

$sourceTitles = $sourceData | ForEach-Object { $_.Title }
$extraItems = @()
foreach ($spItem in $spItems) {
    $spTitle = $spItem["Title"]
    if ($spTitle -and $sourceTitles -notcontains $spTitle) {
        $extraItems += [PSCustomObject]@{
            ID    = $spItem.Id
            Title = $spTitle
            Issue = "Item exists in SharePoint but not in source CSV"
        }
    }
}

# ─── Generate HTML Report ───────────────────────────────────────────────────

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportPath = Join-Path $OutputPath "validation-report_$timestamp.html"

$totalIssues = $missingItems.Count + $mismatchItems.Count + $extraItems.Count
$passRate = if ($sourceCount -gt 0) { [math]::Round(($matchedItems.Count / $sourceCount) * 100, 1) } else { 0 }
$statusColor = if ($passRate -ge 95) { "#28a745" } elseif ($passRate -ge 80) { "#ffc107" } else { "#dc3545" }

$html = @"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Migration Validation Report</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; color: #333; }
  h1 { border-bottom: 3px solid #0078d4; padding-bottom: 10px; }
  h2 { color: #0078d4; margin-top: 30px; }
  .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
  .summary-card { padding: 20px; border-radius: 8px; background: #f5f5f5; flex: 1; min-width: 200px; text-align: center; }
  .summary-card .number { font-size: 36px; font-weight: bold; }
  .pass-rate { color: $statusColor; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { background: #0078d4; color: white; padding: 10px; text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f9f9f9; }
  .badge-error { background: #dc3545; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .badge-warn { background: #ffc107; color: #333; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .badge-ok { background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .timestamp { color: #888; font-size: 14px; }
</style>
</head>
<body>
<h1>Migration Validation Report</h1>
<p class="timestamp">Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss") | Source: $SourceCsv | Target: $ListName</p>

<div class="summary">
  <div class="summary-card"><div class="number">$sourceCount</div>Source Rows</div>
  <div class="summary-card"><div class="number">$spCount</div>SP Items</div>
  <div class="summary-card"><div class="number pass-rate">${passRate}%</div>Pass Rate</div>
  <div class="summary-card"><div class="number" style="color:#28a745">$($matchedItems.Count)</div>Matched</div>
  <div class="summary-card"><div class="number" style="color:#dc3545">$($missingItems.Count)</div>Missing</div>
  <div class="summary-card"><div class="number" style="color:#ffc107">$($mismatchItems.Count)</div>Mismatches</div>
</div>

<h2>Missing Items ($($missingItems.Count))</h2>
$(if ($missingItems.Count -eq 0) {
    "<p><span class='badge-ok'>PASS</span> All source items found in SharePoint.</p>"
} else {
    "<table><tr><th>Row</th><th>Title</th><th>Issue</th></tr>"
    $missingItems | ForEach-Object { "<tr><td>$($_.Row)</td><td>$($_.Title)</td><td><span class='badge-error'>$($_.Issue)</span></td></tr>" }
    "</table>"
})

<h2>Field Mismatches ($($mismatchItems.Count))</h2>
$(if ($mismatchItems.Count -eq 0) {
    "<p><span class='badge-ok'>PASS</span> All fields match between source and SharePoint.</p>"
} else {
    $mismatchItems | ForEach-Object {
        $item = $_
        "<h3>Row $($item.Row): $($item.Title)</h3><table><tr><th>Field</th><th>Source Value</th><th>SharePoint Value</th></tr>"
        $item.Mismatches | ForEach-Object { "<tr><td>$($_.Field)</td><td>$($_.SourceValue)</td><td>$($_.SPValue)</td></tr>" }
        "</table>"
    }
})

<h2>Extra Items in SharePoint ($($extraItems.Count))</h2>
$(if ($extraItems.Count -eq 0) {
    "<p><span class='badge-ok'>PASS</span> No unexpected items in SharePoint.</p>"
} else {
    "<table><tr><th>SP ID</th><th>Title</th><th>Issue</th></tr>"
    $extraItems | ForEach-Object { "<tr><td>$($_.ID)</td><td>$($_.Title)</td><td><span class='badge-warn'>$($_.Issue)</span></td></tr>" }
    "</table>"
})

</body>
</html>
"@

$html | Out-File -FilePath $reportPath -Encoding UTF8
Write-Log "HTML report generated: $reportPath" -Level "SUCCESS"

# ─── Summary ─────────────────────────────────────────────────────────────────

Write-Log ""
Write-Log "============================================="
Write-Log "Validation Complete!" -Level $(if ($passRate -ge 95) { "SUCCESS" } else { "WARNING" })
Write-Log "============================================="
Write-Log "Source Rows  : $sourceCount"
Write-Log "SP Items     : $spCount"
Write-Log "Matched      : $($matchedItems.Count)"
Write-Log "Missing      : $($missingItems.Count)"
Write-Log "Mismatches   : $($mismatchItems.Count)"
Write-Log "Extra in SP  : $($extraItems.Count)"
Write-Log "Pass Rate    : ${passRate}%"
Write-Log "Report       : $reportPath"
Write-Log "============================================="

Disconnect-PnPOnline
