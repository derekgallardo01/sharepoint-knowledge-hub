<#
.SYNOPSIS
    Imports content from CSV files into SharePoint Knowledge Hub lists.

.DESCRIPTION
    Reads a CSV (or Excel) file, maps columns to SharePoint fields using an
    optional mapping file, and creates list items with proper metadata
    including managed metadata term lookups.

    Features:
    - Column mapping via JSON configuration
    - Managed metadata term resolution
    - Progress reporting with progress bar
    - Error logging with retry logic
    - Batch processing for large imports
    - Dry run mode

.PARAMETER SiteUrl
    The SharePoint site URL to import content into.

.PARAMETER ListName
    The target SharePoint list or document library.

.PARAMETER CsvPath
    Path to the CSV file containing content to import.

.PARAMETER MappingFile
    Optional JSON file mapping CSV columns to SharePoint fields.

.PARAMETER BatchSize
    Number of items to process per batch (default: 50).

.PARAMETER MaxRetries
    Maximum retry attempts for failed items (default: 3).

.PARAMETER DryRun
    Preview mode - validates data without creating items.

.PARAMETER Credential
    Optional PSCredential for authentication.

.EXAMPLE
    .\Import-ContentFromCsv.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -ListName "Knowledge Articles" -CsvPath ".\articles.csv"

.EXAMPLE
    .\Import-ContentFromCsv.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub" -ListName "Knowledge Articles" -CsvPath ".\articles.csv" -MappingFile ".\mapping.json" -DryRun
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [Parameter(Mandatory = $true)]
    [string]$ListName,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ })]
    [string]$CsvPath,

    [Parameter(Mandatory = $false)]
    [string]$MappingFile,

    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 500)]
    [int]$BatchSize = 50,

    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 10)]
    [int]$MaxRetries = 3,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun,

    [Parameter(Mandatory = $false)]
    [PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

# ─── Logging ─────────────────────────────────────────────────────────────────

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path (Split-Path $CsvPath) "import-log_$timestamp.log"
$errorLog = Join-Path (Split-Path $CsvPath) "import-errors_$timestamp.csv"

$script:successCount = 0
$script:errorCount = 0
$script:skipCount = 0

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$ts] [$Level] $Message"
    $color = switch ($Level) { "ERROR" { "Red" } "WARNING" { "Yellow" } "SUCCESS" { "Green" } "SKIP" { "Cyan" } "DRYRUN" { "Magenta" } default { "White" } }
    Write-Host $entry -ForegroundColor $color
    Add-Content -Path $logFile -Value $entry
}

function Write-ErrorRecord {
    param([int]$Row, [string]$Title, [string]$Error)
    $record = [PSCustomObject]@{
        Row       = $Row
        Title     = $Title
        Error     = $Error
        Timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    $record | Export-Csv -Path $errorLog -Append -NoTypeInformation
}

# ─── Connect ─────────────────────────────────────────────────────────────────

Write-Log "============================================="
Write-Log "Knowledge Hub Content Import"
Write-Log "============================================="
Write-Log "Site     : $SiteUrl"
Write-Log "List     : $ListName"
Write-Log "CSV      : $CsvPath"
Write-Log "Batch    : $BatchSize"
Write-Log "Dry Run  : $DryRun"
Write-Log ""

if (-not $DryRun) {
    Write-Log "Connecting to SharePoint..."
    $connectParams = @{ Url = $SiteUrl }
    if ($Credential) { $connectParams.Credential = $Credential } else { $connectParams.Interactive = $true }
    Connect-PnPOnline @connectParams
    Write-Log "Connected" -Level "SUCCESS"
}

# ─── Load CSV ────────────────────────────────────────────────────────────────

Write-Log "Loading CSV data..."
$csvData = Import-Csv -Path $CsvPath -Encoding UTF8
$totalItems = $csvData.Count
Write-Log "Loaded $totalItems rows from CSV"

if ($totalItems -eq 0) {
    Write-Log "CSV file is empty. Nothing to import." -Level "WARNING"
    exit 0
}

# ─── Load Column Mapping ─────────────────────────────────────────────────────

$columnMap = @{}

if ($MappingFile -and (Test-Path $MappingFile)) {
    Write-Log "Loading column mapping from $MappingFile..."
    $mappingDef = Get-Content $MappingFile -Raw | ConvertFrom-Json

    foreach ($mapping in $mappingDef.mappings) {
        $columnMap[$mapping.sourceColumn] = @{
            TargetField = $mapping.targetField
            Type        = $mapping.type
            TermSetName = $mapping.termSetName
            Required    = $mapping.required
            DefaultValue = $mapping.defaultValue
            Transform   = $mapping.transform
        }
    }
    Write-Log "Loaded $($columnMap.Count) column mappings"
} else {
    # Auto-map: CSV headers match SharePoint internal field names
    Write-Log "No mapping file provided - using direct column name matching"
    foreach ($header in $csvData[0].PSObject.Properties.Name) {
        $columnMap[$header] = @{
            TargetField = $header
            Type        = "Text"
            Required    = $false
        }
    }
}

# ─── Taxonomy Term Cache ─────────────────────────────────────────────────────

$termCache = @{}

function Resolve-TaxonomyTerm {
    param([string]$TermSetName, [string]$TermLabel)

    $cacheKey = "$TermSetName|$TermLabel"
    if ($termCache.ContainsKey($cacheKey)) {
        return $termCache[$cacheKey]
    }

    try {
        $term = Get-PnPTerm -Identity $TermLabel -TermSet $TermSetName -TermGroup "Knowledge Hub" -ErrorAction SilentlyContinue
        if ($null -ne $term) {
            $termValue = "$($term.Id)|$TermLabel"
            $termCache[$cacheKey] = $termValue
            return $termValue
        }
    } catch {
        Write-Log "  Could not resolve term '$TermLabel' in set '$TermSetName'" -Level "WARNING"
    }

    return $null
}

# ─── Process Items ───────────────────────────────────────────────────────────

Write-Log ""
Write-Log "Starting import..."

$batchNumber = 0

for ($i = 0; $i -lt $totalItems; $i++) {
    $row = $csvData[$i]
    $rowNumber = $i + 2  # CSV row number (header = 1)
    $percentComplete = [math]::Round(($i / $totalItems) * 100, 1)

    # Progress bar
    Write-Progress -Activity "Importing content to $ListName" `
        -Status "Processing row $rowNumber of $($totalItems + 1) ($percentComplete%)" `
        -PercentComplete $percentComplete

    # Build field values
    $fieldValues = @{}
    $hasError = $false
    $rowTitle = ""

    foreach ($csvColumn in $columnMap.Keys) {
        $mapping = $columnMap[$csvColumn]
        $targetField = $mapping.TargetField
        $rawValue = $row.$csvColumn

        # Apply default value if empty
        if ([string]::IsNullOrWhiteSpace($rawValue) -and $mapping.DefaultValue) {
            $rawValue = $mapping.DefaultValue
        }

        # Check required fields
        if ($mapping.Required -and [string]::IsNullOrWhiteSpace($rawValue)) {
            Write-Log "  Row $rowNumber: Required field '$csvColumn' is empty" -Level "ERROR"
            Write-ErrorRecord -Row $rowNumber -Title ($row.Title ?? "Unknown") -Error "Required field '$csvColumn' is empty"
            $hasError = $true
            break
        }

        if ([string]::IsNullOrWhiteSpace($rawValue)) { continue }

        # Type-specific processing
        switch ($mapping.Type) {
            "TaxonomyFieldType" {
                if (-not $DryRun) {
                    $termValue = Resolve-TaxonomyTerm -TermSetName $mapping.TermSetName -TermLabel $rawValue
                    if ($null -ne $termValue) {
                        $fieldValues[$targetField] = $termValue
                    } else {
                        Write-Log "  Row $rowNumber: Term '$rawValue' not found in '$($mapping.TermSetName)'" -Level "WARNING"
                    }
                }
            }
            "DateTime" {
                try {
                    $dateValue = [DateTime]::Parse($rawValue)
                    $fieldValues[$targetField] = $dateValue.ToString("yyyy-MM-ddTHH:mm:ssZ")
                } catch {
                    Write-Log "  Row $rowNumber: Invalid date '$rawValue' for field '$csvColumn'" -Level "WARNING"
                }
            }
            "Number" {
                if ($rawValue -match '^\d+(\.\d+)?$') {
                    $fieldValues[$targetField] = [double]$rawValue
                } else {
                    Write-Log "  Row $rowNumber: Invalid number '$rawValue' for field '$csvColumn'" -Level "WARNING"
                }
            }
            "User" {
                $fieldValues[$targetField] = $rawValue  # Email or login name
            }
            default {
                # Apply transform if specified
                if ($mapping.Transform -eq "HtmlEncode") {
                    $rawValue = [System.Web.HttpUtility]::HtmlEncode($rawValue)
                }
                $fieldValues[$targetField] = $rawValue
            }
        }

        # Track title for logging
        if ($targetField -eq "Title") {
            $rowTitle = $rawValue
        }
    }

    if ($hasError) {
        $script:errorCount++
        continue
    }

    # Create the item
    if ($DryRun) {
        Write-Log "  [DRY RUN] Row $rowNumber: Would create '$rowTitle' with $($fieldValues.Count) fields" -Level "DRYRUN"
        $script:successCount++
    } else {
        $retryCount = 0
        $success = $false

        while (-not $success -and $retryCount -lt $MaxRetries) {
            try {
                Add-PnPListItem -List $ListName -Values $fieldValues | Out-Null
                Write-Log "  Row $rowNumber: Created '$rowTitle'" -Level "SUCCESS"
                $script:successCount++
                $success = $true
            } catch {
                $retryCount++
                if ($retryCount -lt $MaxRetries) {
                    Write-Log "  Row $rowNumber: Retry $retryCount/$MaxRetries - $_" -Level "WARNING"
                    Start-Sleep -Seconds (2 * $retryCount)  # Exponential backoff
                } else {
                    Write-Log "  Row $rowNumber: FAILED after $MaxRetries retries - $_" -Level "ERROR"
                    Write-ErrorRecord -Row $rowNumber -Title $rowTitle -Error $_.Exception.Message
                    $script:errorCount++
                }
            }
        }
    }

    # Batch pause to avoid throttling
    if (($i + 1) % $BatchSize -eq 0 -and -not $DryRun) {
        $batchNumber++
        Write-Log "  Batch $batchNumber complete ($BatchSize items). Pausing briefly..." -Level "INFO"
        Start-Sleep -Seconds 2
    }
}

Write-Progress -Activity "Importing content" -Completed

# ─── Summary ─────────────────────────────────────────────────────────────────

Write-Log ""
Write-Log "============================================="
Write-Log "Import Complete!" -Level "SUCCESS"
Write-Log "============================================="
Write-Log "Total Rows  : $totalItems"
Write-Log "Succeeded   : $($script:successCount)"
Write-Log "Failed      : $($script:errorCount)"
Write-Log "Skipped     : $($script:skipCount)"
Write-Log "Log File    : $logFile"
if ($script:errorCount -gt 0) {
    Write-Log "Error Report: $errorLog" -Level "WARNING"
}
Write-Log "============================================="

if (-not $DryRun) {
    Disconnect-PnPOnline
}
