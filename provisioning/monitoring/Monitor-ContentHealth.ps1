<#
.SYNOPSIS
    Monitors knowledge hub content health and generates an HTML dashboard report.

.DESCRIPTION
    Connects to a SharePoint Online Knowledge Hub site and performs content health
    checks including:
    - Stale content detection (articles past their review date)
    - Orphaned pages (pages with no navigation link)
    - Broken links within article content
    - Overall content health scoring

    Produces an HTML dashboard report with colour-coded indicators.

    Requires the PnP.PowerShell module v2.x or later.

.PARAMETER SiteUrl
    The full URL of the Knowledge Hub SharePoint site.

.PARAMETER DaysStale
    Number of days past the review date before content is considered stale.
    Default is 90.

.PARAMETER ListName
    The display name of the knowledge articles list. Default is "Knowledge Articles".

.PARAMETER OutputPath
    Directory path where the HTML report will be saved. Default is the current directory.

.PARAMETER Credential
    PSCredential object for authentication. If not provided, interactive login is used.

.PARAMETER WhatIf
    Shows what the script would do without connecting to SharePoint.

.EXAMPLE
    .\Monitor-ContentHealth.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub"

.EXAMPLE
    .\Monitor-ContentHealth.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" `
        -DaysStale 60 -OutputPath "C:\Reports"

.EXAMPLE
    .\Monitor-ContentHealth.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -WhatIf
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true, HelpMessage = "SharePoint site URL")]
    [ValidatePattern('^https://[\w\-]+\.sharepoint\.com')]
    [string]$SiteUrl,

    [Parameter(HelpMessage = "Days past review date to flag as stale (default 90)")]
    [ValidateRange(1, 365)]
    [int]$DaysStale = 90,

    [Parameter(HelpMessage = "Knowledge articles list name")]
    [string]$ListName = "Knowledge Articles",

    [Parameter(HelpMessage = "Output directory for the HTML report")]
    [string]$OutputPath = ".",

    [Parameter()]
    [System.Management.Automation.PSCredential]$Credential
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-StatusLine {
    param([string]$Message, [string]$Status, [ConsoleColor]$Color = 'White')
    Write-Host ("{0,-60} " -f $Message) -NoNewline
    Write-Host "[$Status]" -ForegroundColor $Color
}

function Test-UrlAccessible {
    param([string]$Url)
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Method = "HEAD"
        $request.Timeout = 10000
        $request.AllowAutoRedirect = $true
        $response = $request.GetResponse()
        $statusCode = [int]$response.StatusCode
        $response.Close()
        return $statusCode -lt 400
    }
    catch {
        return $false
    }
}

function Get-HealthScore {
    param(
        [int]$TotalItems,
        [int]$StaleCount,
        [int]$OrphanedCount,
        [int]$BrokenLinkCount
    )
    if ($TotalItems -eq 0) { return 100 }

    $staleRatio    = $StaleCount / $TotalItems
    $orphanedRatio = $OrphanedCount / $TotalItems
    $brokenRatio   = if ($TotalItems -gt 0) { [math]::Min($BrokenLinkCount / $TotalItems, 1) } else { 0 }

    $score = 100 - ($staleRatio * 40) - ($orphanedRatio * 30) - ($brokenRatio * 30)
    return [math]::Max([math]::Round($score, 0), 0)
}

function Get-ScoreColor {
    param([int]$Score)
    if ($Score -ge 80) { return "#107c10" }
    elseif ($Score -ge 60) { return "#d83b01" }
    else { return "#a80000" }
}

function Get-ScoreLabel {
    param([int]$Score)
    if ($Score -ge 80) { return "Healthy" }
    elseif ($Score -ge 60) { return "Needs Attention" }
    else { return "Critical" }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
try {
    Write-Host "`n=== Knowledge Hub Content Health Monitor ===" -ForegroundColor Cyan
    Write-Host "Site       : $SiteUrl"
    Write-Host "List       : $ListName"
    Write-Host "Stale after: $DaysStale days past review date"
    Write-Host "Output     : $OutputPath"
    Write-Host ("=" * 60)

    # --- WhatIf guard ---
    if (-not $PSCmdlet.ShouldProcess($SiteUrl, "Connect to SharePoint and analyse content health")) {
        Write-Host "`n[WhatIf] Would connect to '$SiteUrl' and analyse content in '$ListName'." -ForegroundColor Yellow
        return
    }

    # --- Connect ---
    Write-StatusLine "Connecting to SharePoint Online..." "RUNNING" Cyan
    $connectParams = @{ Url = $SiteUrl }
    if ($Credential) {
        $connectParams['Credentials'] = $Credential
    }
    else {
        $connectParams['Interactive'] = $true
    }
    Connect-PnPOnline @connectParams
    Write-StatusLine "Connected to SharePoint" "PASS" Green

    # --- Retrieve articles ---
    Write-StatusLine "Retrieving articles from '$ListName'..." "RUNNING" Cyan
    $articles = Get-PnPListItem -List $ListName -PageSize 500 -Fields "Title", "ReviewDate", "Modified", "Author", "Category", "ArticleContent", "FileRef"
    $totalArticles = $articles.Count
    Write-StatusLine "Retrieved $totalArticles article(s)" "PASS" Green

    # --- Check stale content ---
    Write-StatusLine "Checking for stale content..." "RUNNING" Cyan
    $now = Get-Date
    $staleItems = @()

    foreach ($article in $articles) {
        $reviewDate = $article.FieldValues["ReviewDate"]
        $modified   = $article.FieldValues["Modified"]
        $title      = $article.FieldValues["Title"]

        $isStale = $false
        $reason  = ""

        if ($null -ne $reviewDate) {
            $daysPastReview = ($now - [datetime]$reviewDate).Days
            if ($daysPastReview -gt 0) {
                $isStale = $true
                $reason  = "Review date was $daysPastReview day(s) ago"
            }
        }
        elseif ($null -ne $modified) {
            $daysSinceModified = ($now - [datetime]$modified).Days
            if ($daysSinceModified -gt $DaysStale) {
                $isStale = $true
                $reason  = "Not modified for $daysSinceModified days (no review date set)"
            }
        }

        if ($isStale) {
            $staleItems += [PSCustomObject]@{
                Title      = $title
                ReviewDate = $reviewDate
                Modified   = $modified
                Reason     = $reason
                Author     = $article.FieldValues["Author"].LookupValue
            }
        }
    }
    Write-StatusLine "Stale articles: $($staleItems.Count)" $(if ($staleItems.Count -eq 0) { "PASS" } else { "WARN" }) $(if ($staleItems.Count -eq 0) { "Green" } else { "Yellow" })

    # --- Check orphaned pages ---
    Write-StatusLine "Checking for orphaned pages..." "RUNNING" Cyan
    $orphanedPages = @()

    try {
        $navigation = Get-PnPNavigationNode -Location QuickLaunch
        $navUrls = @()
        foreach ($node in $navigation) {
            if ($node.Url) { $navUrls += $node.Url.ToLower() }
            if ($node.Children) {
                foreach ($child in $node.Children) {
                    if ($child.Url) { $navUrls += $child.Url.ToLower() }
                }
            }
        }

        $topNav = Get-PnPNavigationNode -Location TopNavigationBar
        foreach ($node in $topNav) {
            if ($node.Url) { $navUrls += $node.Url.ToLower() }
            if ($node.Children) {
                foreach ($child in $node.Children) {
                    if ($child.Url) { $navUrls += $child.Url.ToLower() }
                }
            }
        }

        $pages = Get-PnPListItem -List "Site Pages" -PageSize 500 -Fields "FileRef", "Title"
        foreach ($page in $pages) {
            $pageUrl = ($page.FieldValues["FileRef"]).ToLower()
            $isLinked = $false
            foreach ($navUrl in $navUrls) {
                if ($navUrl -like "*$pageUrl*" -or $pageUrl -like "*$navUrl*") {
                    $isLinked = $true
                    break
                }
            }
            if (-not $isLinked) {
                $orphanedPages += [PSCustomObject]@{
                    Title = $page.FieldValues["Title"]
                    Url   = $page.FieldValues["FileRef"]
                }
            }
        }
    }
    catch {
        Write-StatusLine "Could not fully check navigation" "WARN" Yellow
    }
    Write-StatusLine "Orphaned pages: $($orphanedPages.Count)" $(if ($orphanedPages.Count -eq 0) { "PASS" } else { "WARN" }) $(if ($orphanedPages.Count -eq 0) { "Green" } else { "Yellow" })

    # --- Check broken links ---
    Write-StatusLine "Checking for broken links (sampling)..." "RUNNING" Cyan
    $brokenLinks = @()
    $linksChecked = 0

    # Sample up to 20 articles to avoid long-running URL checks
    $sampleArticles = $articles | Select-Object -First 20
    foreach ($article in $sampleArticles) {
        $content = $article.FieldValues["ArticleContent"]
        if (-not $content) { continue }

        # Extract URLs from href attributes
        $urlMatches = [regex]::Matches($content, 'href="(https?://[^"]+)"')
        foreach ($match in $urlMatches) {
            $url = $match.Groups[1].Value
            $linksChecked++
            if (-not (Test-UrlAccessible -Url $url)) {
                $brokenLinks += [PSCustomObject]@{
                    ArticleTitle = $article.FieldValues["Title"]
                    BrokenUrl    = $url
                }
            }
        }
    }
    Write-StatusLine "Broken links: $($brokenLinks.Count) (checked $linksChecked)" $(if ($brokenLinks.Count -eq 0) { "PASS" } else { "WARN" }) $(if ($brokenLinks.Count -eq 0) { "Green" } else { "Yellow" })

    # --- Compute health score ---
    $healthScore = Get-HealthScore -TotalItems $totalArticles -StaleCount $staleItems.Count -OrphanedCount $orphanedPages.Count -BrokenLinkCount $brokenLinks.Count
    $scoreColor  = Get-ScoreColor -Score $healthScore
    $scoreLabel  = Get-ScoreLabel -Score $healthScore

    Write-Host ""
    Write-Host "Overall Health Score: " -NoNewline
    Write-Host "$healthScore / 100 ($scoreLabel)" -ForegroundColor $(if ($healthScore -ge 80) { 'Green' } elseif ($healthScore -ge 60) { 'Yellow' } else { 'Red' })

    # --- Generate HTML report ---
    Write-StatusLine "Generating HTML report..." "RUNNING" Cyan

    $reportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $reportFileName = "content-health-$(Get-Date -Format 'yyyyMMdd-HHmmss').html"
    $reportPath = Join-Path $OutputPath $reportFileName

    $staleTableRows = ""
    foreach ($item in $staleItems) {
        $staleTableRows += "<tr><td>$($item.Title)</td><td>$($item.Author)</td><td>$($item.ReviewDate)</td><td>$($item.Modified)</td><td>$($item.Reason)</td></tr>"
    }

    $orphanedTableRows = ""
    foreach ($page in $orphanedPages) {
        $orphanedTableRows += "<tr><td>$($page.Title)</td><td><a href='$($page.Url)'>$($page.Url)</a></td></tr>"
    }

    $brokenLinkRows = ""
    foreach ($link in $brokenLinks) {
        $brokenLinkRows += "<tr><td>$($link.ArticleTitle)</td><td>$($link.BrokenUrl)</td></tr>"
    }

    $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Content Health Report - $reportDate</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; color: #323130; }
        .container { max-width: 1100px; margin: 0 auto; }
        h1 { color: #0078d4; border-bottom: 3px solid #0078d4; padding-bottom: 8px; }
        h2 { color: #323130; margin-top: 32px; }
        .meta { color: #605e5c; font-size: 14px; margin-bottom: 24px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .card { background: #fff; border-radius: 6px; padding: 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .card .value { font-size: 36px; font-weight: 700; display: block; }
        .card .label { font-size: 14px; color: #605e5c; margin-top: 4px; display: block; }
        .score-card { border-top: 4px solid $scoreColor; }
        table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
        th { background: #0078d4; color: #fff; padding: 10px 14px; text-align: left; font-weight: 600; }
        td { padding: 8px 14px; border-bottom: 1px solid #edebe9; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background: #f3f2f1; }
        .pass { color: #107c10; font-weight: 600; }
        .warn { color: #d83b01; font-weight: 600; }
        .fail { color: #a80000; font-weight: 600; }
        .empty { padding: 24px; text-align: center; color: #605e5c; font-style: italic; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Content Health Report</h1>
        <p class="meta">
            <strong>Site:</strong> $SiteUrl |
            <strong>Generated:</strong> $reportDate |
            <strong>Stale threshold:</strong> $DaysStale days
        </p>

        <div class="summary">
            <div class="card score-card">
                <span class="value" style="color: $scoreColor;">$healthScore</span>
                <span class="label">Health Score ($scoreLabel)</span>
            </div>
            <div class="card">
                <span class="value">$totalArticles</span>
                <span class="label">Total Articles</span>
            </div>
            <div class="card">
                <span class="value" style="color: $(if ($staleItems.Count -gt 0) {'#d83b01'} else {'#107c10'});">$($staleItems.Count)</span>
                <span class="label">Stale Articles</span>
            </div>
            <div class="card">
                <span class="value" style="color: $(if ($orphanedPages.Count -gt 0) {'#d83b01'} else {'#107c10'});">$($orphanedPages.Count)</span>
                <span class="label">Orphaned Pages</span>
            </div>
            <div class="card">
                <span class="value" style="color: $(if ($brokenLinks.Count -gt 0) {'#a80000'} else {'#107c10'});">$($brokenLinks.Count)</span>
                <span class="label">Broken Links</span>
            </div>
        </div>

        <h2>Stale Content</h2>
        $(if ($staleItems.Count -eq 0) {
            '<p class="empty">No stale content found.</p>'
        } else {
            "<table><thead><tr><th>Title</th><th>Author</th><th>Review Date</th><th>Modified</th><th>Reason</th></tr></thead><tbody>$staleTableRows</tbody></table>"
        })

        <h2>Orphaned Pages</h2>
        $(if ($orphanedPages.Count -eq 0) {
            '<p class="empty">No orphaned pages found.</p>'
        } else {
            "<table><thead><tr><th>Page Title</th><th>URL</th></tr></thead><tbody>$orphanedTableRows</tbody></table>"
        })

        <h2>Broken Links</h2>
        $(if ($brokenLinks.Count -eq 0) {
            '<p class="empty">No broken links found.</p>'
        } else {
            "<table><thead><tr><th>Article</th><th>Broken URL</th></tr></thead><tbody>$brokenLinkRows</tbody></table>"
        })
    </div>
</body>
</html>
"@

    $html | Out-File -FilePath $reportPath -Encoding UTF8 -Force
    Write-StatusLine "Report saved to: $reportPath" "PASS" Green

    Write-Host "`n$("=" * 60)"
    Write-StatusLine "Content health monitoring complete" "DONE" Green
    Write-Host ""
}
catch {
    Write-StatusLine "Content health monitoring failed" "FAIL" Red
    Write-Error $_.Exception.Message
}
finally {
    try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch { }
}
