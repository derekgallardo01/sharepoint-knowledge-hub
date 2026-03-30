<#
.SYNOPSIS
    Creates and deploys custom content types and site columns for the Knowledge Hub.

.DESCRIPTION
    Creates four content types (Knowledge Article, FAQ Item, Policy Document,
    Training Material) along with their associated site columns. Deploys to
    the specified SharePoint site.

    Idempotent - checks for existing columns and content types before creating.

.PARAMETER SiteUrl
    The Knowledge Hub site URL.

.PARAMETER ContentTypesFile
    Path to the content-types.json definition file.

.PARAMETER Credential
    Optional PSCredential for authentication.

.EXAMPLE
    .\Deploy-ContentTypes.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [Parameter(Mandatory = $false)]
    [string]$ContentTypesFile = "$PSScriptRoot\content-types.json",

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

# ─── Load definitions ────────────────────────────────────────────────────────

if (-not (Test-Path $ContentTypesFile)) {
    throw "Content types definition file not found: $ContentTypesFile"
}

$definitions = Get-Content $ContentTypesFile -Raw | ConvertFrom-Json
Write-Log "Loaded content type definitions from $ContentTypesFile"

# ─── Create Site Columns ─────────────────────────────────────────────────────

Write-Log ""
Write-Log "Creating site columns..."

foreach ($column in $definitions.siteColumns) {
    $existing = $null
    try {
        $existing = Get-PnPField -Identity $column.internalName -ErrorAction SilentlyContinue
    } catch {}

    if ($null -ne $existing) {
        Write-Log "  Column already exists: $($column.internalName)" -Level "SKIP"
        continue
    }

    if ($PSCmdlet.ShouldProcess($column.internalName, "Create site column")) {
        Write-Log "  Creating column: $($column.displayName) ($($column.type))..."

        $fieldParams = @{
            InternalName = $column.internalName
            DisplayName  = $column.displayName
            Type         = $column.type
            Group        = $column.group
        }

        if ($column.required) { $fieldParams.Required = $true }

        switch ($column.type) {
            "Note" {
                $fieldParams.Add("AddToDefaultView", $false)
                $fieldXml = "<Field Type='Note' Name='$($column.internalName)' DisplayName='$($column.displayName)' " +
                            "Group='$($column.group)' RichText='TRUE' RichTextMode='FullHtml' " +
                            "Required='$($column.required.ToString().ToUpper())' />"
                Add-PnPFieldFromXml -FieldXml $fieldXml
            }
            "TaxonomyFieldType" {
                # Taxonomy fields require special handling
                $fieldXml = "<Field Type='TaxonomyFieldType' Name='$($column.internalName)' " +
                            "DisplayName='$($column.displayName)' Group='$($column.group)' " +
                            "Required='$($column.required.ToString().ToUpper())' />"
                Add-PnPTaxonomyField -InternalName $column.internalName `
                    -DisplayName $column.displayName `
                    -TermSetPath "Knowledge Hub|$($column.termSetName)" `
                    -Group $column.group
            }
            "Choice" {
                $fieldParams.Choices = $column.choices
                Add-PnPField @fieldParams
            }
            "DateTime" {
                Add-PnPField @fieldParams
            }
            "Number" {
                Add-PnPField @fieldParams
            }
            "User" {
                Add-PnPField @fieldParams
            }
            default {
                Add-PnPField @fieldParams
            }
        }

        Write-Log "  Column created: $($column.displayName)" -Level "SUCCESS"
    }
}

# ─── Create Content Types ────────────────────────────────────────────────────

Write-Log ""
Write-Log "Creating content types..."

foreach ($ctDef in $definitions.contentTypes) {
    Write-Log ""
    Write-Log "Processing content type: $($ctDef.name)..."

    $existingCT = $null
    try {
        $existingCT = Get-PnPContentType -Identity $ctDef.name -ErrorAction SilentlyContinue
    } catch {}

    if ($null -ne $existingCT) {
        Write-Log "  Content type already exists: $($ctDef.name)" -Level "SKIP"
    } else {
        if ($PSCmdlet.ShouldProcess($ctDef.name, "Create content type")) {
            $ctParams = @{
                Name          = $ctDef.name
                Description   = $ctDef.description
                Group         = $ctDef.group
                ParentContentType = Get-PnPContentType -Identity $ctDef.parentId
            }

            if ($ctDef.id) { $ctParams.ContentTypeId = $ctDef.id }

            $newCT = Add-PnPContentType @ctParams
            Write-Log "  Content type created: $($ctDef.name)" -Level "SUCCESS"
        }
    }

    # Add field links
    $ct = Get-PnPContentType -Identity $ctDef.name -ErrorAction SilentlyContinue
    if ($null -ne $ct) {
        foreach ($fieldRef in $ctDef.fields) {
            try {
                $existingFieldLink = Get-PnPProperty -ClientObject $ct -Property "FieldLinks" |
                    Where-Object { $_.Name -eq $fieldRef }

                if ($null -eq $existingFieldLink) {
                    if ($PSCmdlet.ShouldProcess("$($ctDef.name)/$fieldRef", "Add field link")) {
                        Add-PnPFieldToContentType -Field $fieldRef -ContentType $ctDef.name
                        Write-Log "    Added field: $fieldRef" -Level "SUCCESS"
                    }
                } else {
                    Write-Log "    Field already linked: $fieldRef" -Level "SKIP"
                }
            } catch {
                Write-Log "    Failed to add field '$fieldRef': $_" -Level "WARNING"
            }
        }
    }
}

# ─── Add Content Types to Lists ──────────────────────────────────────────────

Write-Log ""
Write-Log "Adding content types to lists..."

foreach ($listMapping in $definitions.listMappings) {
    Write-Log "Processing list: $($listMapping.listName)..."

    try {
        $list = Get-PnPList -Identity $listMapping.listName -ErrorAction SilentlyContinue

        if ($null -eq $list) {
            if ($PSCmdlet.ShouldProcess($listMapping.listName, "Create list")) {
                $list = New-PnPList -Title $listMapping.listName `
                    -Template $listMapping.template `
                    -EnableContentTypes
                Write-Log "  List created: $($listMapping.listName)" -Level "SUCCESS"
            }
        }

        # Enable content types on the list
        Set-PnPList -Identity $listMapping.listName -EnableContentTypes $true

        foreach ($ctName in $listMapping.contentTypes) {
            try {
                Add-PnPContentTypeToList -List $listMapping.listName -ContentType $ctName
                Write-Log "  Added content type '$ctName' to list" -Level "SUCCESS"
            } catch {
                Write-Log "  Content type '$ctName' may already be on list (non-blocking)" -Level "SKIP"
            }
        }
    } catch {
        Write-Log "  Failed to process list '$($listMapping.listName)': $_" -Level "ERROR"
    }
}

# ─── Summary ─────────────────────────────────────────────────────────────────

Write-Log ""
Write-Log "============================================="
Write-Log "Content type deployment complete!" -Level "SUCCESS"
Write-Log "Site Columns : $($definitions.siteColumns.Count)"
Write-Log "Content Types: $($definitions.contentTypes.Count)"
Write-Log "Lists        : $($definitions.listMappings.Count)"
Write-Log "============================================="

Disconnect-PnPOnline
