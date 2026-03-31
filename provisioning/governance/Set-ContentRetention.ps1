<#
.SYNOPSIS
    Content retention policy enforcement for the Knowledge Hub.

.DESCRIPTION
    Applies retention labels and enforces retention lifecycle on knowledge content.
    Processes articles based on rules defined in a JSON policy file:

    - Applies retention labels (e.g., "3-Year Retention", "Permanent") based on content type and category
    - Archives content that has exceeded the archive threshold (moves to Archived status)
    - Flags content past the deletion threshold for manual review
    - Generates a full audit trail of all retention actions

.PARAMETER SiteUrl
    URL of the Knowledge Hub hub site.

.PARAMETER PolicyFile
    Path to JSON file defining retention rules. See below for schema.

.PARAMETER OutputPath
    Directory for audit log output. Defaults to current directory.

.PARAMETER Credential
    PnP Online credentials for non-interactive authentication.

.PARAMETER WhatIf
    Preview mode -- shows what would happen without applying any changes.

.EXAMPLE
    .\Set-ContentRetention.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -PolicyFile ".\retention-policy.json" -WhatIf

.NOTES
    Policy File Schema:
    {
        "rules": [
            {
                "name": "Policy Documents - 5 Year Retention",
                "listName": "Knowledge Articles",
                "contentTypeFilter": "Policy",
                "categoryFilter": null,
                "retentionLabel": "5-Year Retention",
                "archiveAfterDays": 1825,
                "deleteAfterDays": 2555,
                "notifyOwnerDaysBeforeArchive": 30
            }
        ],
        "defaultRetentionLabel": "3-Year Retention",
        "defaultArchiveAfterDays": 1095,
        "auditAllActions": true
    }
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [Parameter(Mandatory = $true)]
    [string]$PolicyFile,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath = ".",

    [Parameter(Mandatory = $false)]
    [PSCredential]$Credential
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Load Policy ──────────────────────────────────────────────────────────

if (-not (Test-Path $PolicyFile)) {
    throw "Policy file not found: $PolicyFile"
}

$policy = Get-Content $PolicyFile -Raw | ConvertFrom-Json
Write-Host "`n=== Knowledge Hub Content Retention ===" -ForegroundColor Yellow
Write-Host "Site: $SiteUrl" -ForegroundColor Gray
Write-Host "Policy: $PolicyFile ($($policy.rules.Count) rules)" -ForegroundColor Gray
Write-Host ""

# ── Connect ──────────────────────────────────────────────────────────────

$connectParams = @{ Url = $SiteUrl; Interactive = $true }
if ($Credential) { $connectParams.Remove("Interactive"); $connectParams.Credentials = $Credential }
Connect-PnPOnline @connectParams

# ── Audit Log ────────────────────────────────────────────────────────────

$auditLog = @()
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"

function Add-AuditEntry {
    param(
        [string]$Action,
        [int]$ItemId,
        [string]$Title,
        [string]$ListName,
        [string]$RuleName,
        [string]$Details
    )

    $script:auditLog += [PSCustomObject]@{
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Action    = $Action
        ItemId    = $ItemId
        Title     = $Title
        ListName  = $ListName
        RuleName  = $RuleName
        Details   = $Details
        WhatIf    = $WhatIfPreference
    }
}

# ── Process Retention Rules ──────────────────────────────────────────────

$now = Get-Date
$stats = @{
    LabelsApplied   = 0
    Archived        = 0
    FlaggedForDelete = 0
    Skipped         = 0
    Errors          = 0
}

foreach ($rule in $policy.rules) {
    Write-Host "Processing rule: $($rule.name)" -ForegroundColor Cyan

    try {
        # Fetch items from the target list
        $items = Get-PnPListItem -List $rule.listName -PageSize 500 -Fields "Title", "KHStatus", "KHCategory", "KHOwner", "KHReviewDate", "Modified", "ContentType", "_ComplianceTag"

        # Apply filters
        $filtered = $items
        if ($rule.contentTypeFilter) {
            $filtered = $filtered | Where-Object { $_["ContentType"].Name -like "*$($rule.contentTypeFilter)*" }
        }
        if ($rule.categoryFilter) {
            $filtered = $filtered | Where-Object { $_["KHCategory"] -and $_["KHCategory"].Label -eq $rule.categoryFilter }
        }

        $filteredCount = ($filtered | Measure-Object).Count
        Write-Host "  Matching items: $filteredCount" -ForegroundColor Gray

        foreach ($item in $filtered) {
            $itemTitle = $item["Title"]
            $itemStatus = $item["KHStatus"]
            $modified = $item["Modified"]
            $daysSinceModified = [Math]::Round(($now - $modified).TotalDays)
            $currentLabel = $item["_ComplianceTag"]

            # Step 1: Apply retention label if not already set
            $targetLabel = if ($rule.retentionLabel) { $rule.retentionLabel } else { $policy.defaultRetentionLabel }
            if (-not $currentLabel -and $targetLabel) {
                if ($PSCmdlet.ShouldProcess("$itemTitle (ID: $($item.Id))", "Apply retention label '$targetLabel'")) {
                    try {
                        Set-PnPListItem -List $rule.listName -Identity $item.Id -Values @{ "_ComplianceTag" = $targetLabel }
                        $stats.LabelsApplied++
                        Add-AuditEntry -Action "LabelApplied" -ItemId $item.Id -Title $itemTitle -ListName $rule.listName -RuleName $rule.name -Details "Applied label: $targetLabel"
                        Write-Host "    [LABEL] $itemTitle -> $targetLabel" -ForegroundColor Green
                    }
                    catch {
                        $stats.Errors++
                        Add-AuditEntry -Action "Error" -ItemId $item.Id -Title $itemTitle -ListName $rule.listName -RuleName $rule.name -Details "Failed to apply label: $_"
                        Write-Warning "    Failed to apply label to '$itemTitle': $_"
                    }
                }
            }

            # Step 2: Archive if past archive threshold
            $archiveDays = if ($rule.archiveAfterDays) { $rule.archiveAfterDays } else { $policy.defaultArchiveAfterDays }
            if ($itemStatus -eq "Published" -and $daysSinceModified -gt $archiveDays) {
                if ($PSCmdlet.ShouldProcess("$itemTitle (ID: $($item.Id))", "Archive (${daysSinceModified}d since modified, threshold: ${archiveDays}d)")) {
                    try {
                        Set-PnPListItem -List $rule.listName -Identity $item.Id -Values @{ "KHStatus" = "Archived" }
                        $stats.Archived++
                        Add-AuditEntry -Action "Archived" -ItemId $item.Id -Title $itemTitle -ListName $rule.listName -RuleName $rule.name -Details "Archived after $daysSinceModified days (threshold: $archiveDays)"
                        Write-Host "    [ARCHIVE] $itemTitle ($daysSinceModified days old)" -ForegroundColor Yellow
                    }
                    catch {
                        $stats.Errors++
                        Add-AuditEntry -Action "Error" -ItemId $item.Id -Title $itemTitle -ListName $rule.listName -RuleName $rule.name -Details "Failed to archive: $_"
                        Write-Warning "    Failed to archive '$itemTitle': $_"
                    }
                }
            }

            # Step 3: Flag for deletion if past delete threshold
            if ($rule.deleteAfterDays -and $itemStatus -eq "Archived" -and $daysSinceModified -gt $rule.deleteAfterDays) {
                $stats.FlaggedForDelete++
                Add-AuditEntry -Action "FlaggedForDeletion" -ItemId $item.Id -Title $itemTitle -ListName $rule.listName -RuleName $rule.name -Details "Flagged for deletion review after $daysSinceModified days (threshold: $($rule.deleteAfterDays))"
                Write-Host "    [FLAG DELETE] $itemTitle ($daysSinceModified days old)" -ForegroundColor Red
            }
        }
    }
    catch {
        Write-Warning "Error processing rule '$($rule.name)': $_"
        $stats.Errors++
    }
}

# ── Export Audit Log ─────────────────────────────────────────────────────

if ($policy.auditAllActions -and $auditLog.Count -gt 0) {
    $auditFile = Join-Path $OutputPath "retention-audit_$timestamp.csv"
    $auditLog | Export-Csv -Path $auditFile -NoTypeInformation -Encoding UTF8
    Write-Host "`nAudit log saved to: $auditFile" -ForegroundColor Green
}

# ── Summary ──────────────────────────────────────────────────────────────

Write-Host "`n=== Retention Summary ===" -ForegroundColor Yellow
Write-Host "  Labels Applied:       $($stats.LabelsApplied)" -ForegroundColor Green
Write-Host "  Archived:             $($stats.Archived)" -ForegroundColor Yellow
Write-Host "  Flagged for Deletion: $($stats.FlaggedForDelete)" -ForegroundColor Red
Write-Host "  Errors:               $($stats.Errors)" -ForegroundColor $(if ($stats.Errors -gt 0) { "Red" } else { "Green" })
Write-Host "  Audit entries:        $($auditLog.Count)" -ForegroundColor Gray
Write-Host ""

Disconnect-PnPOnline
