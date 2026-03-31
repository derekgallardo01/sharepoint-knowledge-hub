<#
.SYNOPSIS
    Restores a Knowledge Hub SharePoint site from a backup created by
    Backup-KnowledgeHub.ps1.

.DESCRIPTION
    Reads the manifest.json from a backup folder and restores:

    1. **List items** -- Recreates items in target lists from JSON exports.
       Preserves metadata fields (category, department, tags, status, etc.).

    2. **Document library files** -- Uploads files back to the specified
       document libraries.

    3. **Taxonomy term sets** -- Recreates taxonomy terms in the Knowledge Hub
       term group.

    Supports -WhatIf for a dry-run that shows what would be restored without
    making changes.

    Requires PnP.PowerShell v2.x or later.

.PARAMETER SiteUrl
    The full URL of the target Knowledge Hub site to restore into.

.PARAMETER BackupPath
    Path to the backup folder (must contain manifest.json).

.PARAMETER SkipLists
    Switch to skip list item restoration.

.PARAMETER SkipDocuments
    Switch to skip document restoration.

.PARAMETER SkipTaxonomy
    Switch to skip taxonomy restoration.

.PARAMETER Credential
    PSCredential for non-interactive authentication.

.PARAMETER WhatIf
    Preview what would be restored without making any changes.

.EXAMPLE
    .\Restore-KnowledgeHub.ps1 `
        -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" `
        -BackupPath "C:\Backups\KnowledgeHub-Backup-20260330-120000"

.EXAMPLE
    .\Restore-KnowledgeHub.ps1 `
        -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" `
        -BackupPath "C:\Backups\KnowledgeHub-Backup-20260330-120000" `
        -WhatIf

.EXAMPLE
    .\Restore-KnowledgeHub.ps1 `
        -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" `
        -BackupPath "C:\Backups\KnowledgeHub-Backup-20260330-120000" `
        -SkipDocuments -SkipTaxonomy
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Full URL of the target Knowledge Hub site")]
    [ValidatePattern('^https://[\w\-]+\.sharepoint\.com')]
    [string]$SiteUrl,

    [Parameter(Mandatory = $true, HelpMessage = "Path to the backup folder")]
    [ValidateScript({ Test-Path $_ -PathType Container })]
    [string]$BackupPath,

    [Parameter(HelpMessage = "Skip list item restoration")]
    [switch]$SkipLists,

    [Parameter(HelpMessage = "Skip document restoration")]
    [switch]$SkipDocuments,

    [Parameter(HelpMessage = "Skip taxonomy restoration")]
    [switch]$SkipTaxonomy,

    [Parameter(Mandatory = $false)]
    [PSCredential]$Credential
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
$manifestPath = Join-Path $BackupPath "manifest.json"
$listsFolder = Join-Path $BackupPath "lists"
$docsFolder = Join-Path $BackupPath "documents"
$taxonomyFolder = Join-Path $BackupPath "taxonomy"

$restoreReport = @{
    StartTime     = Get-Date
    SiteUrl       = $SiteUrl
    BackupPath    = $BackupPath
    ListsRestored = @()
    DocsRestored  = @()
    TaxRestored   = @()
    Errors        = @()
}

# Fields to exclude when creating new items (system/read-only fields)
$excludedFields = @(
    "Id", "ID", "Created", "Modified", "Author", "Editor",
    "GUID", "FileRef", "FileDirRef", "FileLeafRef",
    "FSObjType", "ContentTypeId", "_ModerationStatus",
    "_HasCopyDestinations", "_CopySource", "FileSystemObjectType",
    "ServerRedirectedEmbedUrl", "ServerRedirectedEmbedUri",
    "ContentType", "ComplianceAssetId", "OData__UIVersionString",
    "Attachments", "_ComplianceFlags", "_ComplianceTag",
    "_ComplianceTagWrittenTime", "_ComplianceTagUserId",
    "AppAuthor", "AppEditor", "SMTotalSize", "SMLastModifiedDate",
    "SMTotalFileStreamSize", "SMTotalFileCount"
)

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
function Write-StatusLine {
    param([string]$Message, [string]$Status, [ConsoleColor]$Color = 'White')
    Write-Host ("{0,-55} " -f $Message) -NoNewline
    Write-Host "[$Status]" -ForegroundColor $Color
}

function Import-ListItems {
    param(
        [string]$ListName,
        [string]$JsonFilePath
    )

    $importedCount = 0
    $failedCount = 0

    try {
        if (-not (Test-Path $JsonFilePath)) {
            Write-Host "  Skipping $ListName (file not found)" -ForegroundColor Yellow
            return @{ ListName = $ListName; Imported = 0; Failed = 0; Status = "Skipped" }
        }

        Write-Host "  Restoring: $ListName" -NoNewline

        $jsonContent = Get-Content -Path $JsonFilePath -Raw -Encoding UTF8
        $items = $jsonContent | ConvertFrom-Json

        if (-not $items -or $items.Count -eq 0) {
            Write-Host " (0 items)" -ForegroundColor Yellow
            return @{ ListName = $ListName; Imported = 0; Failed = 0; Status = "Empty" }
        }

        foreach ($item in $items) {
            try {
                $fieldValues = @{}

                # Build field values hash, excluding system fields
                $fields = $item.Fields
                if ($fields -is [PSCustomObject]) {
                    foreach ($prop in $fields.PSObject.Properties) {
                        if ($prop.Name -notin $excludedFields -and $null -ne $prop.Value -and $prop.Value -ne "") {
                            $fieldValues[$prop.Name] = $prop.Value
                        }
                    }
                }

                if ($fieldValues.Count -gt 0) {
                    Add-PnPListItem -List $ListName -Values $fieldValues -ErrorAction Stop | Out-Null
                    $importedCount++
                }
            }
            catch {
                $failedCount++
                if ($failedCount -le 5) {
                    # Log first 5 errors, then suppress to avoid flooding
                    Write-Warning "    Item import failed: $($_.Exception.Message)"
                }
            }
        }

        $color = if ($failedCount -eq 0) { 'Green' } else { 'Yellow' }
        Write-Host " ($importedCount imported, $failedCount failed)" -ForegroundColor $color

        return @{
            ListName = $ListName
            Imported = $importedCount
            Failed   = $failedCount
            Status   = if ($failedCount -eq 0) { "Success" } else { "Partial" }
        }
    }
    catch {
        Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
        return @{
            ListName = $ListName
            Imported = $importedCount
            Failed   = $failedCount
            Status   = "Failed"
            Error    = $_.Exception.Message
        }
    }
}

function Import-DocumentLibrary {
    param(
        [string]$LibraryName,
        [string]$SourceFolder
    )

    $uploadedCount = 0

    try {
        if (-not (Test-Path $SourceFolder)) {
            Write-Host "  Skipping $LibraryName (folder not found)" -ForegroundColor Yellow
            return @{ LibraryName = $LibraryName; Uploaded = 0; Status = "Skipped" }
        }

        Write-Host "  Restoring library: $LibraryName" -NoNewline

        $files = Get-ChildItem -Path $SourceFolder -File -Recurse

        foreach ($file in $files) {
            try {
                $relativePath = $file.FullName.Substring($SourceFolder.Length).TrimStart('\', '/')
                $targetFolder = $LibraryName

                # Preserve subfolder structure
                $subDir = Split-Path -Parent $relativePath
                if ($subDir) {
                    $targetFolder = "$LibraryName/$subDir"
                }

                Add-PnPFile -Path $file.FullName -Folder $targetFolder -ErrorAction Stop | Out-Null
                $uploadedCount++
            }
            catch {
                Write-Warning "    File upload failed ($($file.Name)): $($_.Exception.Message)"
            }
        }

        Write-Host " ($uploadedCount files)" -ForegroundColor Green

        return @{
            LibraryName = $LibraryName
            Uploaded    = $uploadedCount
            Status      = "Success"
        }
    }
    catch {
        Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
        return @{
            LibraryName = $LibraryName
            Uploaded    = $uploadedCount
            Status      = "Failed"
            Error       = $_.Exception.Message
        }
    }
}

function Import-TaxonomyTerms {
    param(
        [string]$TermSetName,
        [string]$JsonFilePath,
        [string]$TermGroupName = "Knowledge Hub"
    )

    try {
        if (-not (Test-Path $JsonFilePath)) {
            Write-Host "  Skipping term set: $TermSetName (file not found)" -ForegroundColor Yellow
            return @{ TermSetName = $TermSetName; TermCount = 0; Status = "Skipped" }
        }

        Write-Host "  Restoring term set: $TermSetName" -NoNewline

        $jsonContent = Get-Content -Path $JsonFilePath -Raw -Encoding UTF8
        $terms = $jsonContent | ConvertFrom-Json

        if (-not $terms -or $terms.Count -eq 0) {
            Write-Host " (0 terms)" -ForegroundColor Yellow
            return @{ TermSetName = $TermSetName; TermCount = 0; Status = "Empty" }
        }

        $importedCount = 0

        # Ensure term group and term set exist
        try {
            $termGroup = Get-PnPTermGroup -Identity $TermGroupName -ErrorAction Stop
        }
        catch {
            $termGroup = New-PnPTermGroup -Name $TermGroupName -ErrorAction Stop
        }

        try {
            $termSet = Get-PnPTermSet -Identity $TermSetName -TermGroup $TermGroupName -ErrorAction Stop
        }
        catch {
            $termSet = New-PnPTermSet -Name $TermSetName -TermGroup $TermGroupName -ErrorAction Stop
        }

        foreach ($term in $terms) {
            try {
                $existingTerm = $null
                try {
                    $existingTerm = Get-PnPTerm -Identity $term.Name -TermSet $TermSetName -TermGroup $TermGroupName -ErrorAction SilentlyContinue
                }
                catch { }

                if (-not $existingTerm) {
                    $newTermParams = @{
                        Name      = $term.Name
                        TermSet   = $TermSetName
                        TermGroup = $TermGroupName
                    }

                    if ($term.Id) {
                        $newTermParams.Id = $term.Id
                    }

                    New-PnPTerm @newTermParams -ErrorAction Stop | Out-Null
                    $importedCount++
                }
            }
            catch {
                Write-Warning "    Term import failed ($($term.Name)): $($_.Exception.Message)"
            }
        }

        Write-Host " ($importedCount terms)" -ForegroundColor Green

        return @{
            TermSetName = $TermSetName
            TermCount   = $importedCount
            Status      = "Success"
        }
    }
    catch {
        Write-Host " [FAILED: $($_.Exception.Message)]" -ForegroundColor Red
        return @{
            TermSetName = $TermSetName
            TermCount   = 0
            Status      = "Failed"
            Error       = $_.Exception.Message
        }
    }
}

# ===========================================================================
# Main Execution
# ===========================================================================
try {
    # --- Read manifest ---
    if (-not (Test-Path $manifestPath)) {
        throw "Manifest file not found at $manifestPath. Is this a valid backup folder?"
    }

    $manifestContent = Get-Content -Path $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

    Write-Host "`n=== Knowledge Hub Restore ===" -ForegroundColor Cyan
    Write-Host "Target site  : $SiteUrl"
    Write-Host "Backup path  : $BackupPath"
    Write-Host "Backup date  : $($manifestContent.BackupTimestamp)"
    Write-Host "Source site   : $($manifestContent.SiteUrl)"
    Write-Host "Items in backup : $($manifestContent.TotalItems)"
    Write-Host "Files in backup : $($manifestContent.TotalFiles)"
    Write-Host ("=" * 60)

    # --- WhatIf ---
    if (-not $PSCmdlet.ShouldProcess($SiteUrl, "Restore Knowledge Hub from backup at $BackupPath")) {
        Write-Host "`n[WhatIf] The following actions would be performed:" -ForegroundColor Yellow

        if (-not $SkipLists -and $manifestContent.Lists) {
            Write-Host "  Lists to restore:" -ForegroundColor Cyan
            foreach ($list in $manifestContent.Lists) {
                Write-Host "    - $($list.ListName) ($($list.ItemCount) items)"
            }
        }

        if (-not $SkipDocuments -and $manifestContent.Documents) {
            Write-Host "  Document libraries to restore:" -ForegroundColor Cyan
            foreach ($doc in $manifestContent.Documents) {
                Write-Host "    - $($doc.LibraryName) ($($doc.FileCount) files)"
            }
        }

        if (-not $SkipTaxonomy -and $manifestContent.Taxonomy) {
            Write-Host "  Taxonomy term sets to restore:" -ForegroundColor Cyan
            foreach ($tax in $manifestContent.Taxonomy) {
                Write-Host "    - $($tax.TermSetName) ($($tax.TermCount) terms)"
            }
        }

        return
    }

    # --- Connect ---
    $connectParams = @{ Url = $SiteUrl }
    if ($Credential) { $connectParams.Credentials = $Credential }

    Write-StatusLine "Connecting to $SiteUrl..." "RUNNING" Cyan
    Connect-PnPOnline @connectParams -ErrorAction Stop
    Write-StatusLine "Connected" "PASS" Green

    # ------------------------------------------------------------------
    # 1. Restore taxonomy (do first so term IDs are available for list items)
    # ------------------------------------------------------------------
    if (-not $SkipTaxonomy) {
        Write-Host "`n--- Restoring Taxonomy ---" -ForegroundColor Cyan

        if ($manifestContent.Taxonomy) {
            foreach ($tax in $manifestContent.Taxonomy) {
                $safeFileName = $tax.TermSetName -replace ' ', '-'
                $jsonFile = Join-Path $taxonomyFolder "$safeFileName.json"
                $result = Import-TaxonomyTerms -TermSetName $tax.TermSetName -JsonFilePath $jsonFile
                $restoreReport.TaxRestored += $result

                if ($result.Status -eq "Failed" -and $result.Error) {
                    $restoreReport.Errors += "Taxonomy '$($tax.TermSetName)': $($result.Error)"
                }
            }
        }
        else {
            Write-Host "  No taxonomy data in backup." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "`n--- Taxonomy Restore Skipped ---" -ForegroundColor Yellow
    }

    # ------------------------------------------------------------------
    # 2. Restore list items
    # ------------------------------------------------------------------
    if (-not $SkipLists) {
        Write-Host "`n--- Restoring List Items ---" -ForegroundColor Cyan

        if ($manifestContent.Lists) {
            foreach ($list in $manifestContent.Lists) {
                if ($list.Status -eq "Success") {
                    $safeListName = $list.ListName -replace '[\\\/\:\*\?\"\<\>\|]', '_'
                    $jsonFile = Join-Path $listsFolder "$safeListName.json"
                    $result = Import-ListItems -ListName $list.ListName -JsonFilePath $jsonFile
                    $restoreReport.ListsRestored += $result

                    if ($result.Status -eq "Failed" -and $result.Error) {
                        $restoreReport.Errors += "List '$($list.ListName)': $($result.Error)"
                    }
                }
            }
        }
        else {
            Write-Host "  No list data in backup." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "`n--- List Restore Skipped ---" -ForegroundColor Yellow
    }

    # ------------------------------------------------------------------
    # 3. Restore documents
    # ------------------------------------------------------------------
    if (-not $SkipDocuments) {
        Write-Host "`n--- Restoring Documents ---" -ForegroundColor Cyan

        if ($manifestContent.Documents) {
            foreach ($doc in $manifestContent.Documents) {
                if ($doc.Status -eq "Success") {
                    $safeLibName = $doc.LibraryName -replace '[\\\/\:\*\?\"\<\>\|]', '_'
                    $libFolder = Join-Path $docsFolder $safeLibName
                    $result = Import-DocumentLibrary -LibraryName $doc.LibraryName -SourceFolder $libFolder
                    $restoreReport.DocsRestored += $result

                    if ($result.Status -eq "Failed" -and $result.Error) {
                        $restoreReport.Errors += "Library '$($doc.LibraryName)': $($result.Error)"
                    }
                }
            }
        }
        else {
            Write-Host "  No document data in backup." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "`n--- Document Restore Skipped ---" -ForegroundColor Yellow
    }

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    $restoreReport.EndTime = Get-Date
    $restoreReport.Duration = ($restoreReport.EndTime - $restoreReport.StartTime).ToString("hh\:mm\:ss")

    Write-Host ("`n" + "=" * 60) -ForegroundColor Cyan
    Write-Host "RESTORE SUMMARY" -ForegroundColor Green
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  Duration       : $($restoreReport.Duration)"

    $totalImported = ($restoreReport.ListsRestored | ForEach-Object { $_.Imported } | Measure-Object -Sum).Sum
    $totalFailed = ($restoreReport.ListsRestored | ForEach-Object { $_.Failed } | Measure-Object -Sum).Sum
    $totalUploaded = ($restoreReport.DocsRestored | ForEach-Object { $_.Uploaded } | Measure-Object -Sum).Sum

    Write-Host "  Items imported : $totalImported"
    Write-Host "  Items failed   : $totalFailed"
    Write-Host "  Files uploaded : $totalUploaded"
    Write-Host "  Errors         : $($restoreReport.Errors.Count)"

    if ($restoreReport.Errors.Count -gt 0) {
        Write-Host "`n  Errors:" -ForegroundColor Yellow
        foreach ($err in $restoreReport.Errors) {
            Write-Host "    - $err" -ForegroundColor Yellow
        }
    }

    Write-Host "`nRestore complete." -ForegroundColor Green
}
catch {
    Write-Host "Restore failed: $($_.Exception.Message)" -ForegroundColor Red
    $restoreReport.Errors += "FATAL: $($_.Exception.Message)"
    throw
}
finally {
    try { Disconnect-PnPOnline -ErrorAction SilentlyContinue } catch { }
}
