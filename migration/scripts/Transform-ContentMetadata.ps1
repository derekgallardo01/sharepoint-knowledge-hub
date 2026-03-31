<#
.SYNOPSIS
    Transforms and normalizes content metadata in a CSV file for Knowledge Hub import.

.DESCRIPTION
    Reads a source CSV file and applies a series of data quality transformations:
    - Title case conversion for titles
    - Whitespace trimming on all fields
    - URL validation and normalization
    - Date format normalization (to ISO 8601)
    - Taxonomy value mapping from old values to new term set values
    - Empty/null field detection and reporting

    Outputs a clean CSV file ready for import into SharePoint via Import-ContentFromCsv.ps1.

.PARAMETER InputCsv
    Path to the source CSV file to transform.

.PARAMETER OutputCsv
    Path for the output (cleaned) CSV file.

.PARAMETER MappingFile
    Path to a JSON file containing taxonomy value mappings.

    JSON format:
    {
      "Category": {
        "old-value-1": "New Value 1",
        "old-value-2": "New Value 2"
      },
      "Department": {
        "Engineering": "Product Engineering",
        "Mktg": "Marketing"
      }
    }

.PARAMETER DateColumns
    Comma-separated list of column names that contain dates. These will be
    normalized to ISO 8601 format (yyyy-MM-dd). Default: "PublishDate,ReviewDate,ExpiryDate".

.PARAMETER UrlColumns
    Comma-separated list of column names that contain URLs. These will be
    validated and normalized. Default: "SourceUrl,RelatedLink".

.PARAMETER TitleColumn
    Column name to apply title case conversion. Default: "Title".

.PARAMETER SkipUrlValidation
    Switch to skip URL validation (useful for offline/air-gapped environments).

.PARAMETER WhatIf
    Shows transformation plan without writing the output file.

.EXAMPLE
    .\Transform-ContentMetadata.ps1 -InputCsv ".\raw-articles.csv" -OutputCsv ".\clean-articles.csv"

.EXAMPLE
    .\Transform-ContentMetadata.ps1 -InputCsv ".\raw-articles.csv" -OutputCsv ".\clean-articles.csv" `
        -MappingFile ".\taxonomy-mapping.json"

.EXAMPLE
    .\Transform-ContentMetadata.ps1 -InputCsv ".\raw-articles.csv" -OutputCsv ".\clean-articles.csv" `
        -DateColumns "Created,Modified" -UrlColumns "Link" -WhatIf
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Path to the source CSV file")]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$InputCsv,

    [Parameter(Mandatory = $true, HelpMessage = "Path for the cleaned output CSV")]
    [string]$OutputCsv,

    [Parameter(HelpMessage = "Path to taxonomy mapping JSON file")]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$MappingFile,

    [Parameter(HelpMessage = "Comma-separated date column names")]
    [string]$DateColumns = "PublishDate,ReviewDate,ExpiryDate",

    [Parameter(HelpMessage = "Comma-separated URL column names")]
    [string]$UrlColumns = "SourceUrl,RelatedLink",

    [Parameter(HelpMessage = "Column name for title case conversion")]
    [string]$TitleColumn = "Title",

    [Parameter()]
    [switch]$SkipUrlValidation
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

function ConvertTo-TitleCase {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $Text }
    $textInfo = (Get-Culture).TextInfo
    # Lowercase first, then apply title case to handle ALL-CAPS input
    return $textInfo.ToTitleCase($Text.ToLower())
}

function Normalize-DateValue {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }

    $trimmed = $Value.Trim()

    # Try common date formats
    $formats = @(
        "yyyy-MM-dd",
        "MM/dd/yyyy",
        "dd/MM/yyyy",
        "M/d/yyyy",
        "d/M/yyyy",
        "yyyy/MM/dd",
        "MM-dd-yyyy",
        "dd-MM-yyyy",
        "MMMM d, yyyy",
        "MMM d, yyyy",
        "d MMMM yyyy",
        "d MMM yyyy",
        "yyyyMMdd",
        "yyyy-MM-ddTHH:mm:ss",
        "yyyy-MM-ddTHH:mm:ssZ"
    )

    foreach ($fmt in $formats) {
        $parsed = [datetime]::MinValue
        if ([datetime]::TryParseExact($trimmed, $fmt, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
            return $parsed.ToString("yyyy-MM-dd")
        }
    }

    # Fallback: try .NET general parser
    $parsed = [datetime]::MinValue
    if ([datetime]::TryParse($trimmed, [ref]$parsed)) {
        return $parsed.ToString("yyyy-MM-dd")
    }

    # Could not parse
    return $null
}

function Test-UrlFormat {
    param([string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return $true }  # Empty is acceptable
    $trimmed = $Url.Trim()
    return $trimmed -match '^https?://.+'
}

function Normalize-Url {
    param([string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return "" }
    $trimmed = $Url.Trim()

    # Remove trailing slash for consistency (unless it's just the domain)
    if ($trimmed -match '^https?://[^/]+/.+/$') {
        $trimmed = $trimmed.TrimEnd('/')
    }

    # Ensure scheme is lowercase
    $trimmed = $trimmed -replace '^HTTP://', 'http://' -replace '^HTTPS://', 'https://'

    return $trimmed
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
try {
    Write-Host "`n=== Content Metadata Transformer ===" -ForegroundColor Cyan
    Write-Host "Input  : $InputCsv"
    Write-Host "Output : $OutputCsv"
    Write-Host "Mapping: $(if ($MappingFile) { $MappingFile } else { '(none)' })"
    Write-Host ("=" * 60)

    # --- Load source CSV ---
    Write-StatusLine "Loading source CSV..." "RUNNING" Cyan
    $sourceData = Import-Csv -Path $InputCsv -Encoding UTF8
    $rowCount = $sourceData.Count
    $columnNames = $sourceData[0].PSObject.Properties.Name

    Write-StatusLine "Loaded $rowCount row(s) with $($columnNames.Count) column(s)" "PASS" Green

    # --- Parse column lists ---
    $dateColumnList = $DateColumns -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    $urlColumnList  = $UrlColumns -split ','  | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }

    Write-Host "  Date columns : $($dateColumnList -join ', ')"
    Write-Host "  URL columns  : $($urlColumnList -join ', ')"
    Write-Host "  Title column : $TitleColumn"

    # --- Load taxonomy mapping ---
    $taxonomyMap = @{}
    if ($MappingFile) {
        Write-StatusLine "Loading taxonomy mapping file..." "RUNNING" Cyan
        $mappingJson = Get-Content -Path $MappingFile -Raw | ConvertFrom-Json
        foreach ($prop in $mappingJson.PSObject.Properties) {
            $fieldMap = @{}
            foreach ($entry in $prop.Value.PSObject.Properties) {
                $fieldMap[$entry.Name.ToLower()] = $entry.Value
            }
            $taxonomyMap[$prop.Name] = $fieldMap
        }
        Write-StatusLine "Loaded mappings for $($taxonomyMap.Keys.Count) field(s)" "PASS" Green
    }

    # --- WhatIf preview ---
    if (-not $PSCmdlet.ShouldProcess("$rowCount rows from '$InputCsv'", "Transform and write to '$OutputCsv'")) {
        Write-Host "`n[WhatIf] Would transform $rowCount row(s) and save to '$OutputCsv'." -ForegroundColor Yellow
        Write-Host "  Transformations:"
        Write-Host "    - Trim whitespace on all fields"
        if ($columnNames -contains $TitleColumn) {
            Write-Host "    - Title case on column '$TitleColumn'"
        }
        foreach ($dc in $dateColumnList) {
            if ($columnNames -contains $dc) {
                Write-Host "    - Normalize dates in column '$dc'"
            }
        }
        foreach ($uc in $urlColumnList) {
            if ($columnNames -contains $uc) {
                Write-Host "    - Validate/normalize URLs in column '$uc'"
            }
        }
        foreach ($field in $taxonomyMap.Keys) {
            if ($columnNames -contains $field) {
                Write-Host "    - Map taxonomy values in column '$field' ($($taxonomyMap[$field].Count) mappings)"
            }
        }
        return
    }

    # --- Transform rows ---
    Write-StatusLine "Transforming data..." "RUNNING" Cyan
    $transformedData = @()
    $issues = @()
    $rowIndex = 0

    foreach ($row in $sourceData) {
        $rowIndex++
        $newRow = $row.PSObject.Copy()

        # 1. Trim whitespace on all fields
        foreach ($colName in $columnNames) {
            $val = $newRow.$colName
            if ($null -ne $val -and $val -is [string]) {
                $newRow.$colName = $val.Trim()
            }
        }

        # 2. Title case conversion
        if ($columnNames -contains $TitleColumn) {
            $originalTitle = $newRow.$TitleColumn
            if (-not [string]::IsNullOrWhiteSpace($originalTitle)) {
                $newRow.$TitleColumn = ConvertTo-TitleCase -Text $originalTitle
            }
            else {
                $issues += [PSCustomObject]@{
                    Row    = $rowIndex
                    Column = $TitleColumn
                    Issue  = "Empty title"
                    Value  = ""
                }
            }
        }

        # 3. Normalize dates
        foreach ($dateCol in $dateColumnList) {
            if ($columnNames -contains $dateCol) {
                $dateVal = $newRow.$dateCol
                if (-not [string]::IsNullOrWhiteSpace($dateVal)) {
                    $normalized = Normalize-DateValue -Value $dateVal
                    if ($null -eq $normalized) {
                        $issues += [PSCustomObject]@{
                            Row    = $rowIndex
                            Column = $dateCol
                            Issue  = "Unparseable date"
                            Value  = $dateVal
                        }
                    }
                    else {
                        $newRow.$dateCol = $normalized
                    }
                }
            }
        }

        # 4. Validate and normalize URLs
        foreach ($urlCol in $urlColumnList) {
            if ($columnNames -contains $urlCol) {
                $urlVal = $newRow.$urlCol
                if (-not [string]::IsNullOrWhiteSpace($urlVal)) {
                    if (-not (Test-UrlFormat -Url $urlVal)) {
                        $issues += [PSCustomObject]@{
                            Row    = $rowIndex
                            Column = $urlCol
                            Issue  = "Invalid URL format"
                            Value  = $urlVal
                        }
                    }
                    else {
                        $newRow.$urlCol = Normalize-Url -Url $urlVal
                    }
                }
            }
        }

        # 5. Apply taxonomy mappings
        foreach ($field in $taxonomyMap.Keys) {
            if ($columnNames -contains $field) {
                $currentVal = $newRow.$field
                if (-not [string]::IsNullOrWhiteSpace($currentVal)) {
                    $lookupKey = $currentVal.ToLower().Trim()
                    if ($taxonomyMap[$field].ContainsKey($lookupKey)) {
                        $newRow.$field = $taxonomyMap[$field][$lookupKey]
                    }
                }
            }
        }

        $transformedData += $newRow
    }

    # --- Progress report ---
    $issueCount = $issues.Count
    Write-StatusLine "Transformed $rowCount row(s)" "PASS" Green

    if ($issueCount -gt 0) {
        Write-Host ""
        Write-StatusLine "Data quality issues found: $issueCount" "WARN" Yellow
        Write-Host ""
        Write-Host "  Issues:" -ForegroundColor Yellow
        $issues | Group-Object -Property Issue | ForEach-Object {
            Write-Host "    $($_.Name): $($_.Count) occurrence(s)" -ForegroundColor Yellow
        }
        Write-Host ""

        # Display first 10 issues in detail
        $issues | Select-Object -First 10 | ForEach-Object {
            Write-Host "    Row $($_.Row), Column '$($_.Column)': $($_.Issue) [value='$($_.Value)']" -ForegroundColor Yellow
        }
        if ($issueCount -gt 10) {
            Write-Host "    ... and $($issueCount - 10) more" -ForegroundColor Yellow
        }
        Write-Host ""
    }
    else {
        Write-StatusLine "No data quality issues found" "PASS" Green
    }

    # --- Write output CSV ---
    Write-StatusLine "Writing output CSV..." "RUNNING" Cyan
    $transformedData | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8 -Force
    Write-StatusLine "Output written to: $OutputCsv" "PASS" Green

    # --- Summary ---
    Write-Host "`n$("=" * 60)"
    Write-Host "Transformation Summary:" -ForegroundColor Cyan
    Write-Host "  Input rows     : $rowCount"
    Write-Host "  Output rows    : $($transformedData.Count)"
    Write-Host "  Columns        : $($columnNames.Count)"
    Write-Host "  Issues found   : $issueCount"
    Write-Host "  Taxonomy mapped: $($taxonomyMap.Keys.Count) field(s)"
    Write-StatusLine "Transformation complete" "DONE" Green
    Write-Host ""
}
catch {
    Write-StatusLine "Transformation failed" "FAIL" Red
    Write-Error $_.Exception.Message
}
