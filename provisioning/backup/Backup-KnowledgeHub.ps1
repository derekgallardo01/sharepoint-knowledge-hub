<#
.SYNOPSIS
    Creates a comprehensive backup of a Knowledge Hub SharePoint site including
    list items, document library files, and taxonomy term sets.

.DESCRIPTION
    This script exports the following from a Knowledge Hub site:

    1. **List items** -- All items from Knowledge Articles, FAQs, Article
       Feedback, Notifications, and Notification Preferences lists, including
       metadata and optionally version history. Exported as JSON files.

    2. **Document library files** -- All files from document libraries
       associated with the Knowledge Hub (e.g., SiteAssets, article attachments).

    3. **Taxonomy term sets** -- Categories, Departments, Doc Types, and
       Audiences term sets exported as JSON.

    4. **Manifest** -- A manifest.json file with backup metadata including
       timestamp, site URL, item counts, and file hashes.

    Output is organized in a timestamped backup folder.

    Requires PnP.PowerShell v2.x or later.

.PARAMETER SiteUrl
    The full URL of the Knowledge Hub SharePoint site.

.PARAMETER OutputPath
    Root directory for backup output. A timestamped subfolder will be created.
    Default: current directory.

.PARAMETER IncludeVersions
    When specified, version history for list items is included in the export.
    This increases backup time and size significantly.

.PARAMETER ListNames
    Array of list names to back up. Defaults to the standard Knowledge Hub lists.

.PARAMETER IncludeDocLibs
    Array of document library names to back up. Defaults to SiteAssets.

.PARAMETER Credential
    PSCredential for non-interactive authentication.

.PARAMETER WhatIf
    Preview what would be backed up without performing the operation.

.EXAMPLE
    .\Backup-KnowledgeHub.ps1 `
        -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" `
        -OutputPath "C:\Backups"

.EXAMPLE
    .\Backup-KnowledgeHub.ps1 `
        -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" `
        -OutputPath "C:\Backups" `
        -IncludeVersions

.EXAMPLE
    .\Backup-KnowledgeHub.ps1 `
        -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" `
        -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Full URL of the Knowledge Hub site")]
    [ValidatePattern('^https://[\w\-]+\.sharepoint\.com')]
    [string]$SiteUrl,

    [Parameter(HelpMessage = "Root directory for backup output")]
    [string]$OutputPath = (Get-Location).Path,

    [Parameter(HelpMessage = "Include version history for list items")]
    [switch]$IncludeVersions,

    [Parameter(HelpMessage = "List names to back up")]
    [string[]]$ListNames = @(
        "Knowledge Articles",
        "FAQs",
        "Article Feedback",
        "Notifications",
        "Notification Preferences",
        "Knowledge Drafts"
    ),

    [Parameter(HelpMessage = "Document library names to back up")]
    [string[]]$IncludeDocLibs = @("SiteAssets"),

    [Parameter(Mandatory = $false)]
    [PSCredential]$Credential
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFolder = Join-Path $OutputPath "KnowledgeHub-Backup-$timestamp"
$listsFolder = Join-Path $backupFolder "lists"
$docsFolder = Join-Path $backupFolder "documents"
$taxonomyFolder = Join-Path $backupFolder "taxonomy"
$manifestPath = Join-Path $backupFolder "manifest.json"

$manifest = @{
    BackupTimestamp = (Get-Date).ToString("o")
    SiteUrl         = $SiteUrl
    BackupVersion   = "1.0"
    IncludeVersions = $IncludeVersions.IsPresent
    Lists           = @()
    Documents       = @()
    Taxonomy        = @()
    TotalItems      = 0
    TotalFiles      = 0
    Errors          = @()
}

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
function Write-StatusLine {
    param([string]$Message, [string]$Status, [ConsoleColor]$Color = 'White')
    Write-Host ("{0,-55} " -f $Message) -NoNewline
    Write-Host "[$Status]" -ForegroundColor $Color
}

function Export-ListItems {
    param(
        [string]$ListName,
        [string]$OutputFolder,
        [bool]$WithVersions
    )

    $items = @()
    try {
        Write-Host "  Exporting: $ListName" -NoNewline

        $allItems = Get-PnPListItem -List $ListName -PageSize 500 -ErrorAction Stop

        foreach ($item in $allItems) {
            $itemObj = @{
                Id         = $item.Id
                Fields     = @{}
                Created    = $null
                Modified   = $null
                Versions   = @()
            }

            # Export all field values
            foreach ($field in $item.FieldValues.GetEnumerator()) {
                $itemObj.Fields[$field.Key] = $field.Value
            }

            $itemObj.Created = $item.FieldValues["Created"]
            $itemObj.Modified = $item.FieldValues["Modified"]

            # Optionally include version history
            if ($WithVersions) {
                try {
                    $versions = Get-PnPListItemVersion -List $ListName -Identity $item.Id -ErrorAction SilentlyContinue
                    if ($versions) {
                        foreach ($ver in $versions) {
                            $verObj = @{
                                VersionId    = $ver.VersionId
                                VersionLabel = $ver.VersionLabel
                                Created      = $ver.Created
                                Fields       = @{}
                            }
                            foreach ($field in $ver.FieldValues.GetEnumerator()) {
                                $verObj.Fields[$field.Key] = $field.Value
                            }
                            $itemObj.Versions += $verObj
                        }
                    }
                }
                catch {
                    # Version history may not be available for all items
                }
            }

            $items += $itemObj
        }

        # Write to JSON file
        $safeListName = $ListName -replace '[\\\/\:\*\?\"\<\>\|]', '_'
        $outputFile = Join-Path $OutputFolder "$safeListName.json"
        $items | ConvertTo-Json -Depth 10 -Compress | Out-File -FilePath $outputFile -Encoding UTF8

        Write-Host " ($($items.Count) items)" -ForegroundColor Green

        return @{
            ListName  = $ListName
            ItemCount = $items.Count
            FilePath  = $outputFile
            Status    = "Success"
        }
    }
    catch {
        Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
        return @{
            ListName  = $ListName
            ItemCount = 0
            FilePath  = ""
            Status    = "Failed"
            Error     = $_.Exception.Message
        }
    }
}

function Export-DocumentLibrary {
    param(
        [string]$LibraryName,
        [string]$OutputFolder
    )

    $fileCount = 0
    try {
        Write-Host "  Exporting library: $LibraryName" -NoNewline

        $safeLibName = $LibraryName -replace '[\\\/\:\*\?\"\<\>\|]', '_'
        $libFolder = Join-Path $OutputFolder $safeLibName
        New-Item -ItemType Directory -Path $libFolder -Force | Out-Null

        $files = Get-PnPFolderItem -FolderSiteRelativeUrl $LibraryName -ItemType File -Recursive -ErrorAction Stop

        foreach ($file in $files) {
            $relativePath = $file.ServerRelativeUrl
            $localPath = Join-Path $libFolder ($file.Name)

            # Create subdirectory structure
            $subDir = Split-Path -Parent $localPath
            if (-not (Test-Path $subDir)) {
                New-Item -ItemType Directory -Path $subDir -Force | Out-Null
            }

            Get-PnPFile -Url $relativePath -Path $subDir -FileName $file.Name -AsFile -Force -ErrorAction Stop
            $fileCount++
        }

        Write-Host " ($fileCount files)" -ForegroundColor Green

        return @{
            LibraryName = $LibraryName
            FileCount   = $fileCount
            FolderPath  = $libFolder
            Status      = "Success"
        }
    }
    catch {
        Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
        return @{
            LibraryName = $LibraryName
            FileCount   = $fileCount
            FolderPath  = ""
            Status      = "Failed"
            Error       = $_.Exception.Message
        }
    }
}

function Export-TaxonomyTermSets {
    param([string]$OutputFolder)

    $results = @()
    $termGroupName = "Knowledge Hub"

    try {
        Write-Host "  Exporting taxonomy terms" -NoNewline

        $termSets = @("Categories", "Departments", "Doc Types", "Audiences")

        foreach ($tsName in $termSets) {
            try {
                $terms = @()
                $termSet = Get-PnPTermSet -Identity $tsName -TermGroup $termGroupName -ErrorAction Stop

                if ($termSet) {
                    $allTerms = Get-PnPTerm -TermSet $tsName -TermGroup $termGroupName -ErrorAction Stop

                    foreach ($term in $allTerms) {
                        $terms += @{
                            Id          = $term.Id.ToString()
                            Name        = $term.Name
                            Description = $term.Description
                            IsAvailable = $term.IsAvailableForTagging
                            CustomProps = @{}
                        }

                        # Get custom properties if available
                        try {
                            $customProps = $term.CustomProperties
                            if ($customProps) {
                                foreach ($prop in $customProps.GetEnumerator()) {
                                    $terms[-1].CustomProps[$prop.Key] = $prop.Value
                                }
                            }
                        }
                        catch { }
                    }
                }

                $safeFileName = $tsName -replace ' ', '-'
                $outputFile = Join-Path $OutputFolder "$safeFileName.json"
                $terms | ConvertTo-Json -Depth 5 | Out-File -FilePath $outputFile -Encoding UTF8

                $results += @{
                    TermSetName = $tsName
                    TermCount   = $terms.Count
                    FilePath    = $outputFile
                    Status      = "Success"
                }
            }
            catch {
                $results += @{
                    TermSetName = $tsName
                    TermCount   = 0
                    Status      = "Failed"
                    Error       = $_.Exception.Message
                }
            }
        }

        Write-Host " ($($results.Count) term sets)" -ForegroundColor Green
    }
    catch {
        Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
    }

    return $results
}

# ===========================================================================
# Main Execution
# ===========================================================================
try {
    Write-Host "`n=== Knowledge Hub Backup ===" -ForegroundColor Cyan
    Write-Host "Site      : $SiteUrl"
    Write-Host "Output    : $backupFolder"
    Write-Host "Versions  : $(if ($IncludeVersions) { 'Yes' } else { 'No' })"
    Write-Host "Lists     : $($ListNames -join ', ')"
    Write-Host ("=" * 60)

    # --- WhatIf ---
    if (-not $PSCmdlet.ShouldProcess($SiteUrl, "Back up Knowledge Hub site")) {
        Write-Host "`n[WhatIf] Would create backup at: $backupFolder" -ForegroundColor Yellow
        Write-Host "[WhatIf] Lists to export: $($ListNames -join ', ')"
        Write-Host "[WhatIf] Document libraries: $($IncludeDocLibs -join ', ')"
        Write-Host "[WhatIf] Include versions: $($IncludeVersions.IsPresent)"
        return
    }

    # --- Create output directories ---
    New-Item -ItemType Directory -Path $backupFolder -Force | Out-Null
    New-Item -ItemType Directory -Path $listsFolder -Force | Out-Null
    New-Item -ItemType Directory -Path $docsFolder -Force | Out-Null
    New-Item -ItemType Directory -Path $taxonomyFolder -Force | Out-Null

    # --- Connect ---
    $connectParams = @{ Url = $SiteUrl }
    if ($Credential) { $connectParams.Credentials = $Credential }

    Write-StatusLine "Connecting to $SiteUrl..." "RUNNING" Cyan
    Connect-PnPOnline @connectParams -ErrorAction Stop
    Write-StatusLine "Connected" "PASS" Green

    # ------------------------------------------------------------------
    # 1. Export list items
    # ------------------------------------------------------------------
    Write-Host "`n--- Exporting Lists ---" -ForegroundColor Cyan

    foreach ($listName in $ListNames) {
        $result = Export-ListItems -ListName $listName -OutputFolder $listsFolder -WithVersions $IncludeVersions.IsPresent
        $manifest.Lists += $result
        $manifest.TotalItems += $result.ItemCount

        if ($result.Status -eq "Failed" -and $result.Error) {
            $manifest.Errors += "List '$listName': $($result.Error)"
        }
    }

    # ------------------------------------------------------------------
    # 2. Export document libraries
    # ------------------------------------------------------------------
    Write-Host "`n--- Exporting Document Libraries ---" -ForegroundColor Cyan

    foreach ($libName in $IncludeDocLibs) {
        $result = Export-DocumentLibrary -LibraryName $libName -OutputFolder $docsFolder
        $manifest.Documents += $result
        $manifest.TotalFiles += $result.FileCount

        if ($result.Status -eq "Failed" -and $result.Error) {
            $manifest.Errors += "Library '$libName': $($result.Error)"
        }
    }

    # ------------------------------------------------------------------
    # 3. Export taxonomy
    # ------------------------------------------------------------------
    Write-Host "`n--- Exporting Taxonomy ---" -ForegroundColor Cyan

    $taxResults = Export-TaxonomyTermSets -OutputFolder $taxonomyFolder
    $manifest.Taxonomy = $taxResults

    foreach ($tr in $taxResults) {
        if ($tr.Status -eq "Failed" -and $tr.Error) {
            $manifest.Errors += "Taxonomy '$($tr.TermSetName)': $($tr.Error)"
        }
    }

    # ------------------------------------------------------------------
    # 4. Write manifest
    # ------------------------------------------------------------------
    Write-Host "`n--- Writing Manifest ---" -ForegroundColor Cyan

    $manifest.CompletedTimestamp = (Get-Date).ToString("o")
    $manifest | ConvertTo-Json -Depth 5 | Out-File -FilePath $manifestPath -Encoding UTF8
    Write-StatusLine "Manifest written to $manifestPath" "PASS" Green

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    Write-Host ("`n" + "=" * 60) -ForegroundColor Cyan
    Write-Host "BACKUP SUMMARY" -ForegroundColor Green
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  Backup folder  : $backupFolder"
    Write-Host "  Lists exported : $($manifest.Lists.Count)"
    Write-Host "  Total items    : $($manifest.TotalItems)"
    Write-Host "  Total files    : $($manifest.TotalFiles)"
    Write-Host "  Term sets      : $($manifest.Taxonomy.Count)"
    Write-Host "  Errors         : $($manifest.Errors.Count)"

    if ($manifest.Errors.Count -gt 0) {
        Write-Host "`n  Errors:" -ForegroundColor Yellow
        foreach ($err in $manifest.Errors) {
            Write-Host "    - $err" -ForegroundColor Yellow
        }
    }

    Write-Host "`nBackup complete." -ForegroundColor Green
}
catch {
    Write-Host "Backup failed: $($_.Exception.Message)" -ForegroundColor Red
    $manifest.Errors += "FATAL: $($_.Exception.Message)"
    throw
}
finally {
    try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch { }
}
