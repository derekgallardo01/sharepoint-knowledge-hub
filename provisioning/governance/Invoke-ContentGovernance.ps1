<#
.SYNOPSIS
    Automated content governance enforcement for the Knowledge Hub.

.DESCRIPTION
    Scans all knowledge content across the hub and associated sites to identify governance
    violations. Generates a compliance report and optionally sends notification emails to
    content owners with remediation instructions.

    Checks performed:
    - Articles missing required metadata (Category, Department, Review Date)
    - Articles with expired review dates
    - Duplicate or near-duplicate content (title similarity using Levenshtein distance)
    - Articles with zero views in the past 90 days (orphaned content)
    - Articles missing content owner assignment

.PARAMETER SiteUrl
    URL of the Knowledge Hub hub site.

.PARAMETER Action
    Action to perform: Report (generate report only), Notify (send emails only), Both (report + notify).

.PARAMETER OutputPath
    Directory path for the governance report output. Defaults to current directory.

.PARAMETER DuplicateThreshold
    Title similarity threshold (0.0-1.0) for near-duplicate detection. Default: 0.85.

.PARAMETER StaleContentDays
    Number of days without views before content is flagged as orphaned. Default: 90.

.PARAMETER SmtpServer
    SMTP server for sending notification emails. Required when Action includes Notify.

.PARAMETER NotificationFrom
    Sender email address for notification emails.

.PARAMETER Credential
    PnP Online credentials for non-interactive authentication.

.PARAMETER WhatIf
    Preview mode -- shows what would happen without making changes or sending emails.

.EXAMPLE
    .\Invoke-ContentGovernance.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -Action Report

.EXAMPLE
    .\Invoke-ContentGovernance.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -Action Both -SmtpServer "smtp.contoso.com"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [Parameter(Mandatory = $true)]
    [ValidateSet("Report", "Notify", "Both")]
    [string]$Action,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath = ".",

    [Parameter(Mandatory = $false)]
    [double]$DuplicateThreshold = 0.85,

    [Parameter(Mandatory = $false)]
    [int]$StaleContentDays = 90,

    [Parameter(Mandatory = $false)]
    [string]$SmtpServer,

    [Parameter(Mandatory = $false)]
    [string]$NotificationFrom = "knowledgehub@contoso.com",

    [Parameter(Mandatory = $false)]
    [PSCredential]$Credential
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helper Functions ─────────────────────────────────────────────────────

function Get-LevenshteinSimilarity {
    param([string]$String1, [string]$String2)

    $s1 = $String1.ToLower().Trim()
    $s2 = $String2.ToLower().Trim()

    if ($s1 -eq $s2) { return 1.0 }

    $len1 = $s1.Length
    $len2 = $s2.Length

    if ($len1 -eq 0 -or $len2 -eq 0) { return 0.0 }

    $matrix = New-Object 'int[,]' ($len1 + 1), ($len2 + 1)

    for ($i = 0; $i -le $len1; $i++) { $matrix[$i, 0] = $i }
    for ($j = 0; $j -le $len2; $j++) { $matrix[0, $j] = $j }

    for ($i = 1; $i -le $len1; $i++) {
        for ($j = 1; $j -le $len2; $j++) {
            $cost = if ($s1[$i - 1] -eq $s2[$j - 1]) { 0 } else { 1 }
            $matrix[$i, $j] = [Math]::Min(
                [Math]::Min($matrix[($i - 1), $j] + 1, $matrix[$i, ($j - 1)] + 1),
                $matrix[($i - 1), ($j - 1)] + $cost
            )
        }
    }

    $maxLen = [Math]::Max($len1, $len2)
    return [Math]::Round(1 - ($matrix[$len1, $len2] / $maxLen), 4)
}

function Get-GovernanceViolations {
    param(
        [string]$SiteUrl,
        [string]$ListName,
        [double]$DuplicateThreshold,
        [int]$StaleContentDays
    )

    $violations = @{
        MissingMetadata    = @()
        ExpiredReview      = @()
        Duplicates         = @()
        OrphanedContent    = @()
        MissingOwner       = @()
    }

    Write-Host "  Scanning list: $ListName" -ForegroundColor Cyan
    $items = Get-PnPListItem -List $ListName -PageSize 500 -Fields "Title", "KHCategory", "KHDepartment", "KHReviewDate", "KHStatus", "KHOwner", "KHViewCount", "Modified", "Author"

    $publishedItems = $items | Where-Object { $_["KHStatus"] -eq "Published" }
    $totalItems = $items.Count
    $publishedCount = $publishedItems.Count

    Write-Host "    Total items: $totalItems | Published: $publishedCount" -ForegroundColor Gray

    # Check 1: Missing required metadata
    foreach ($item in $publishedItems) {
        $missing = @()
        if (-not $item["KHCategory"]) { $missing += "Category" }
        if (-not $item["KHDepartment"]) { $missing += "Department" }
        if (-not $item["KHReviewDate"]) { $missing += "Review Date" }

        if ($missing.Count -gt 0) {
            $violations.MissingMetadata += [PSCustomObject]@{
                ItemId       = $item.Id
                Title        = $item["Title"]
                MissingFields = $missing -join ", "
                Author       = $item["Author"].LookupValue
                Modified     = $item["Modified"]
                ListName     = $ListName
            }
        }
    }

    # Check 2: Expired review dates
    $now = Get-Date
    foreach ($item in $publishedItems) {
        $reviewDate = $item["KHReviewDate"]
        if ($reviewDate -and $reviewDate -lt $now) {
            $daysOverdue = [Math]::Round(($now - $reviewDate).TotalDays)
            $violations.ExpiredReview += [PSCustomObject]@{
                ItemId      = $item.Id
                Title       = $item["Title"]
                ReviewDate  = $reviewDate.ToString("yyyy-MM-dd")
                DaysOverdue = $daysOverdue
                Author      = $item["Author"].LookupValue
                ListName    = $ListName
            }
        }
    }

    # Check 3: Near-duplicate titles
    $titles = $publishedItems | ForEach-Object {
        [PSCustomObject]@{
            ItemId = $_.Id
            Title  = $_["Title"]
        }
    }

    for ($i = 0; $i -lt $titles.Count; $i++) {
        for ($j = $i + 1; $j -lt $titles.Count; $j++) {
            $similarity = Get-LevenshteinSimilarity -String1 $titles[$i].Title -String2 $titles[$j].Title
            if ($similarity -ge $DuplicateThreshold) {
                $violations.Duplicates += [PSCustomObject]@{
                    ItemId1    = $titles[$i].ItemId
                    Title1     = $titles[$i].Title
                    ItemId2    = $titles[$j].ItemId
                    Title2     = $titles[$j].Title
                    Similarity = [Math]::Round($similarity * 100, 1)
                    ListName   = $ListName
                }
            }
        }
    }

    # Check 4: Orphaned content (zero views in StaleContentDays)
    foreach ($item in $publishedItems) {
        $viewCount = $item["KHViewCount"]
        $modified = $item["Modified"]
        $daysSinceModified = [Math]::Round(($now - $modified).TotalDays)

        if (($null -eq $viewCount -or $viewCount -eq 0) -and $daysSinceModified -gt $StaleContentDays) {
            $violations.OrphanedContent += [PSCustomObject]@{
                ItemId           = $item.Id
                Title            = $item["Title"]
                ViewCount        = if ($viewCount) { $viewCount } else { 0 }
                DaysSinceModified = $daysSinceModified
                Author           = $item["Author"].LookupValue
                ListName         = $ListName
            }
        }
    }

    # Check 5: Missing content owner
    foreach ($item in $publishedItems) {
        if (-not $item["KHOwner"]) {
            $violations.MissingOwner += [PSCustomObject]@{
                ItemId   = $item.Id
                Title    = $item["Title"]
                Author   = $item["Author"].LookupValue
                Modified = $item["Modified"].ToString("yyyy-MM-dd")
                ListName = $ListName
            }
        }
    }

    return $violations
}

function Export-GovernanceReport {
    param(
        [hashtable]$AllViolations,
        [string]$OutputPath,
        [string]$SiteUrl
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
    $reportFile = Join-Path $OutputPath "governance-report_$timestamp.html"

    $totalIssues = $AllViolations.MissingMetadata.Count +
                   $AllViolations.ExpiredReview.Count +
                   $AllViolations.Duplicates.Count +
                   $AllViolations.OrphanedContent.Count +
                   $AllViolations.MissingOwner.Count

    $html = @"
<!DOCTYPE html>
<html>
<head>
    <title>Knowledge Hub Governance Report</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; max-width: 1100px; margin: 0 auto; padding: 20px; background: #faf9f8; color: #323130; }
        h1 { color: #0078d4; border-bottom: 2px solid #0078d4; padding-bottom: 8px; }
        h2 { color: #005a9e; margin-top: 32px; }
        .summary { display: flex; gap: 16px; margin: 20px 0; }
        .summary-card { flex: 1; padding: 16px; border-radius: 8px; text-align: center; }
        .summary-card.critical { background: #fde7e9; border: 1px solid #d13438; }
        .summary-card.warning { background: #fff4ce; border: 1px solid #ca5010; }
        .summary-card.info { background: #deecf9; border: 1px solid #0078d4; }
        .summary-card .number { font-size: 32px; font-weight: 700; }
        .summary-card .label { font-size: 12px; color: #605e5c; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th { background: #0078d4; color: white; padding: 10px 12px; text-align: left; font-size: 13px; }
        td { padding: 8px 12px; border-bottom: 1px solid #edebe9; font-size: 13px; }
        tr:hover { background: #f3f2f1; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .badge.critical { background: #d13438; color: white; }
        .badge.warning { background: #ca5010; color: white; }
        .badge.info { background: #0078d4; color: white; }
        .meta { color: #605e5c; font-size: 12px; margin-top: 8px; }
    </style>
</head>
<body>
    <h1>Knowledge Hub Governance Report</h1>
    <p class="meta">Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss") | Site: $SiteUrl | Total Issues: $totalIssues</p>

    <div class="summary">
        <div class="summary-card critical">
            <div class="number">$($AllViolations.ExpiredReview.Count)</div>
            <div class="label">Expired Reviews</div>
        </div>
        <div class="summary-card warning">
            <div class="number">$($AllViolations.MissingMetadata.Count)</div>
            <div class="label">Missing Metadata</div>
        </div>
        <div class="summary-card warning">
            <div class="number">$($AllViolations.Duplicates.Count)</div>
            <div class="label">Potential Duplicates</div>
        </div>
        <div class="summary-card info">
            <div class="number">$($AllViolations.OrphanedContent.Count)</div>
            <div class="label">Orphaned Content</div>
        </div>
        <div class="summary-card info">
            <div class="number">$($AllViolations.MissingOwner.Count)</div>
            <div class="label">Missing Owner</div>
        </div>
    </div>
"@

    # Add each violation section
    if ($AllViolations.ExpiredReview.Count -gt 0) {
        $html += "<h2>Expired Review Dates <span class='badge critical'>$($AllViolations.ExpiredReview.Count)</span></h2>"
        $html += "<table><tr><th>ID</th><th>Title</th><th>Review Date</th><th>Days Overdue</th><th>Author</th><th>List</th></tr>"
        foreach ($v in $AllViolations.ExpiredReview | Sort-Object -Property DaysOverdue -Descending) {
            $html += "<tr><td>$($v.ItemId)</td><td>$($v.Title)</td><td>$($v.ReviewDate)</td><td>$($v.DaysOverdue)</td><td>$($v.Author)</td><td>$($v.ListName)</td></tr>"
        }
        $html += "</table>"
    }

    if ($AllViolations.MissingMetadata.Count -gt 0) {
        $html += "<h2>Missing Required Metadata <span class='badge warning'>$($AllViolations.MissingMetadata.Count)</span></h2>"
        $html += "<table><tr><th>ID</th><th>Title</th><th>Missing Fields</th><th>Author</th><th>List</th></tr>"
        foreach ($v in $AllViolations.MissingMetadata) {
            $html += "<tr><td>$($v.ItemId)</td><td>$($v.Title)</td><td>$($v.MissingFields)</td><td>$($v.Author)</td><td>$($v.ListName)</td></tr>"
        }
        $html += "</table>"
    }

    if ($AllViolations.Duplicates.Count -gt 0) {
        $html += "<h2>Potential Duplicates <span class='badge warning'>$($AllViolations.Duplicates.Count)</span></h2>"
        $html += "<table><tr><th>Title 1</th><th>ID</th><th>Title 2</th><th>ID</th><th>Similarity</th><th>List</th></tr>"
        foreach ($v in $AllViolations.Duplicates | Sort-Object -Property Similarity -Descending) {
            $html += "<tr><td>$($v.Title1)</td><td>$($v.ItemId1)</td><td>$($v.Title2)</td><td>$($v.ItemId2)</td><td>$($v.Similarity)%</td><td>$($v.ListName)</td></tr>"
        }
        $html += "</table>"
    }

    if ($AllViolations.OrphanedContent.Count -gt 0) {
        $html += "<h2>Orphaned Content <span class='badge info'>$($AllViolations.OrphanedContent.Count)</span></h2>"
        $html += "<table><tr><th>ID</th><th>Title</th><th>Views</th><th>Days Since Modified</th><th>Author</th><th>List</th></tr>"
        foreach ($v in $AllViolations.OrphanedContent | Sort-Object -Property DaysSinceModified -Descending) {
            $html += "<tr><td>$($v.ItemId)</td><td>$($v.Title)</td><td>$($v.ViewCount)</td><td>$($v.DaysSinceModified)</td><td>$($v.Author)</td><td>$($v.ListName)</td></tr>"
        }
        $html += "</table>"
    }

    if ($AllViolations.MissingOwner.Count -gt 0) {
        $html += "<h2>Missing Content Owner <span class='badge info'>$($AllViolations.MissingOwner.Count)</span></h2>"
        $html += "<table><tr><th>ID</th><th>Title</th><th>Author</th><th>Modified</th><th>List</th></tr>"
        foreach ($v in $AllViolations.MissingOwner) {
            $html += "<tr><td>$($v.ItemId)</td><td>$($v.Title)</td><td>$($v.Author)</td><td>$($v.Modified)</td><td>$($v.ListName)</td></tr>"
        }
        $html += "</table>"
    }

    $html += "</body></html>"

    $html | Out-File -FilePath $reportFile -Encoding UTF8 -Force
    Write-Host "`nGovernance report saved to: $reportFile" -ForegroundColor Green

    return $reportFile
}

# ── Main Execution ───────────────────────────────────────────────────────

Write-Host "`n=== Knowledge Hub Content Governance ===" -ForegroundColor Yellow
Write-Host "Site: $SiteUrl" -ForegroundColor Gray
Write-Host "Action: $Action" -ForegroundColor Gray
Write-Host ""

# Connect
$connectParams = @{ Url = $SiteUrl; Interactive = $true }
if ($Credential) { $connectParams.Remove("Interactive"); $connectParams.Credentials = $Credential }
Connect-PnPOnline @connectParams

# Lists to scan
$listsToScan = @("Knowledge Articles", "FAQs")

# Aggregate violations across all lists
$allViolations = @{
    MissingMetadata = @()
    ExpiredReview   = @()
    Duplicates      = @()
    OrphanedContent = @()
    MissingOwner    = @()
}

foreach ($listName in $listsToScan) {
    try {
        $violations = Get-GovernanceViolations -SiteUrl $SiteUrl -ListName $listName -DuplicateThreshold $DuplicateThreshold -StaleContentDays $StaleContentDays
        $allViolations.MissingMetadata += $violations.MissingMetadata
        $allViolations.ExpiredReview += $violations.ExpiredReview
        $allViolations.Duplicates += $violations.Duplicates
        $allViolations.OrphanedContent += $violations.OrphanedContent
        $allViolations.MissingOwner += $violations.MissingOwner
    }
    catch {
        Write-Warning "Failed to scan list '$listName': $_"
    }
}

# Report
if ($Action -eq "Report" -or $Action -eq "Both") {
    $reportFile = Export-GovernanceReport -AllViolations $allViolations -OutputPath $OutputPath -SiteUrl $SiteUrl
}

# Notify
if (($Action -eq "Notify" -or $Action -eq "Both") -and $SmtpServer) {
    Write-Host "`nSending notifications..." -ForegroundColor Yellow

    # Group expired reviews by author for consolidated emails
    $grouped = $allViolations.ExpiredReview | Group-Object -Property Author

    foreach ($group in $grouped) {
        $authorEmail = $group.Name
        $articles = $group.Group

        $body = "You have $($articles.Count) article(s) with overdue review dates in the Knowledge Hub:`n`n"
        foreach ($a in $articles) {
            $body += "- $($a.Title) (due $($a.ReviewDate), $($a.DaysOverdue) days overdue)`n"
        }
        $body += "`nPlease review and update these articles at: $SiteUrl"

        if ($PSCmdlet.ShouldProcess($authorEmail, "Send governance notification")) {
            try {
                Send-MailMessage -From $NotificationFrom -To $authorEmail -Subject "Knowledge Hub: Content Review Required" -Body $body -SmtpServer $SmtpServer
                Write-Host "  Notified: $authorEmail ($($articles.Count) articles)" -ForegroundColor Green
            }
            catch {
                Write-Warning "  Failed to notify $authorEmail : $_"
            }
        }
    }
}

# Summary
$totalIssues = $allViolations.MissingMetadata.Count + $allViolations.ExpiredReview.Count + $allViolations.Duplicates.Count + $allViolations.OrphanedContent.Count + $allViolations.MissingOwner.Count
Write-Host "`n=== Governance Summary ===" -ForegroundColor Yellow
Write-Host "  Expired Reviews:   $($allViolations.ExpiredReview.Count)" -ForegroundColor $(if ($allViolations.ExpiredReview.Count -gt 0) { "Red" } else { "Green" })
Write-Host "  Missing Metadata:  $($allViolations.MissingMetadata.Count)" -ForegroundColor $(if ($allViolations.MissingMetadata.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host "  Duplicates:        $($allViolations.Duplicates.Count)" -ForegroundColor $(if ($allViolations.Duplicates.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host "  Orphaned Content:  $($allViolations.OrphanedContent.Count)" -ForegroundColor $(if ($allViolations.OrphanedContent.Count -gt 0) { "Cyan" } else { "Green" })
Write-Host "  Missing Owner:     $($allViolations.MissingOwner.Count)" -ForegroundColor $(if ($allViolations.MissingOwner.Count -gt 0) { "Cyan" } else { "Green" })
Write-Host "  Total Issues:      $totalIssues" -ForegroundColor White
Write-Host ""

Disconnect-PnPOnline
