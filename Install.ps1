param(
    [Parameter(Mandatory = $true)]
    [string]$LumiverseDataDirectory
)
$ErrorActionPreference = 'Stop'
$dataPath = (Resolve-Path -LiteralPath $LumiverseDataDirectory).Path
if (-not (Test-Path -LiteralPath $dataPath -PathType Container)) {
    throw 'LumiverseDataDirectory must be an existing data directory.'
}
$extensionsPath = Join-Path $dataPath 'extensions'
$destinationPath = Join-Path $extensionsPath 'choir'
$sourcePath = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
if ($destinationPath.StartsWith($sourcePath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choose your Lumiverse data directory outside the extracted extension folder.'
}
if (Test-Path -LiteralPath $destinationPath) {
    throw "Destination already exists: $destinationPath. This helper does not overwrite an installed extension."
}
foreach ($required in @('spindle.json', 'dist\backend.js', 'dist\frontend.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourcePath $required) -PathType Leaf)) {
        throw "Missing $required. Run 'npm run build' in the Choir folder first."
    }
}
New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
# Copy only what Lumiverse loads at runtime; sources, tests, .git and
# node_modules stay in the development folder.
foreach ($item in @('spindle.json', 'package.json', 'dist', 'assets', 'icon.svg', 'LICENSE', 'README.md', 'ONBOARDING.md')) {
    $itemPath = Join-Path $sourcePath $item
    if (Test-Path -LiteralPath $itemPath) {
        Copy-Item -LiteralPath $itemPath -Destination $destinationPath -Recurse
    }
}
Write-Host "Copied Choir to $destinationPath"
Write-Host 'Next: Lumiverse > Extensions > Add > Import local, then enable Choir.'
