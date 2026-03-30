<#
.SYNOPSIS
    Deploys the Knowledge Hub managed metadata taxonomy to SharePoint Online.

.DESCRIPTION
    Creates the "Knowledge Hub" term group and its term sets (Categories,
    Departments, Document Types, Audiences) with pre-populated terms.
    Idempotent - checks for existing terms before creating.

.PARAMETER SiteUrl
    The SharePoint site URL where taxonomy will be configured.

.PARAMETER TermStoreFile
    Path to the term-sets.json definition file.

.PARAMETER Credential
    Optional PSCredential for authentication.

.EXAMPLE
    .\Deploy-Taxonomy.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/KnowledgeHub"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [Parameter(Mandatory = $false)]
    [string]$TermStoreFile = "$PSScriptRoot\term-sets.json",

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

# ─── Load term definition ────────────────────────────────────────────────────

if (-not (Test-Path $TermStoreFile)) {
    throw "Term sets definition file not found: $TermStoreFile"
}

$termDef = Get-Content $TermStoreFile -Raw | ConvertFrom-Json
Write-Log "Loaded term definitions from $TermStoreFile"

$groupName = $termDef.termGroup.name
Write-Log "Term Group: $groupName"

# ─── Create/verify term group ────────────────────────────────────────────────

$termGroup = $null
try {
    $termGroup = Get-PnPTermGroup -Identity $groupName -ErrorAction SilentlyContinue
} catch {}

if ($null -eq $termGroup) {
    if ($PSCmdlet.ShouldProcess($groupName, "Create term group")) {
        Write-Log "Creating term group: $groupName"
        $termGroup = New-PnPTermGroup -Name $groupName -Description $termDef.termGroup.description
        Write-Log "Term group created" -Level "SUCCESS"
    }
} else {
    Write-Log "Term group already exists: $groupName" -Level "SKIP"
}

# ─── Process each term set ───────────────────────────────────────────────────

function Deploy-Terms {
    param(
        [string]$TermSetName,
        [string]$TermSetId,
        [array]$Terms,
        [string]$ParentTermId = $null
    )

    foreach ($term in $Terms) {
        $existingTerm = $null
        try {
            if ($ParentTermId) {
                $existingTerm = Get-PnPTerm -Identity $term.name -TermSet $TermSetName -TermGroup $groupName -ErrorAction SilentlyContinue
            } else {
                $existingTerm = Get-PnPTerm -Identity $term.name -TermSet $TermSetName -TermGroup $groupName -ErrorAction SilentlyContinue
            }
        } catch {}

        if ($null -eq $existingTerm) {
            if ($PSCmdlet.ShouldProcess("$TermSetName/$($term.name)", "Create term")) {
                $newTermParams = @{
                    Name     = $term.name
                    TermSet  = $TermSetName
                    TermGroup = $groupName
                }

                if ($term.id) {
                    $newTermParams.Id = $term.id
                }

                $newTerm = New-PnPTerm @newTermParams
                Write-Log "  Created term: $($term.name)" -Level "SUCCESS"

                # Set custom properties if defined
                if ($term.customProperties) {
                    foreach ($prop in $term.customProperties.PSObject.Properties) {
                        Set-PnPTerm -Identity $newTerm.Id -TermSet $TermSetName -TermGroup $groupName -CustomProperties @{ $prop.Name = $prop.Value }
                    }
                }

                # Recursively create child terms
                if ($term.children -and $term.children.Count -gt 0) {
                    Write-Log "  Processing child terms for: $($term.name)"
                    foreach ($child in $term.children) {
                        $childParams = @{
                            Name      = $child.name
                            TermSet   = $TermSetName
                            TermGroup = $groupName
                            ParentTerm = $newTerm.Id
                        }
                        if ($child.id) { $childParams.Id = $child.id }

                        try {
                            New-PnPTerm @childParams
                            Write-Log "    Created child term: $($child.name)" -Level "SUCCESS"
                        } catch {
                            Write-Log "    Failed to create child term '$($child.name)': $_" -Level "ERROR"
                        }
                    }
                }
            }
        } else {
            Write-Log "  Term already exists: $($term.name)" -Level "SKIP"
        }
    }
}

foreach ($termSetDef in $termDef.termGroup.termSets) {
    Write-Log ""
    Write-Log "Processing term set: $($termSetDef.name)..."

    $termSet = $null
    try {
        $termSet = Get-PnPTermSet -Identity $termSetDef.name -TermGroup $groupName -ErrorAction SilentlyContinue
    } catch {}

    if ($null -eq $termSet) {
        if ($PSCmdlet.ShouldProcess($termSetDef.name, "Create term set")) {
            $tsParams = @{
                Name        = $termSetDef.name
                TermGroup   = $groupName
                Description = $termSetDef.description
            }
            if ($termSetDef.id) { $tsParams.Id = $termSetDef.id }

            $termSet = New-PnPTermSet @tsParams
            Write-Log "Term set created: $($termSetDef.name)" -Level "SUCCESS"
        }
    } else {
        Write-Log "Term set already exists: $($termSetDef.name)" -Level "SKIP"
    }

    # Create terms
    if ($termSetDef.terms -and $termSetDef.terms.Count -gt 0) {
        Deploy-Terms -TermSetName $termSetDef.name -TermSetId $termSetDef.id -Terms $termSetDef.terms
    }
}

# ─── Summary ─────────────────────────────────────────────────────────────────

Write-Log ""
Write-Log "============================================="
Write-Log "Taxonomy deployment complete!" -Level "SUCCESS"
Write-Log "Term Group : $groupName"
Write-Log "Term Sets  : $($termDef.termGroup.termSets.Count)"
Write-Log "============================================="

Disconnect-PnPOnline
