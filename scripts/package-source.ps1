$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputDir = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
if (-not $outputDir.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Package output must stay in the project workspace.'
}
[System.IO.Directory]::CreateDirectory($outputDir) | Out-Null
$archivePath = Join-Path $outputDir 'FarmShiftRemake-fixed.zip'
$sourceFiles = @('server.js', 'package.json', 'package-lock.json', 'README.md', '.gitignore') | ForEach-Object { Get-Item -LiteralPath (Join-Path $projectRoot $_) }
foreach ($folder in @('src', 'public', 'tests', 'scripts', 'docs')) {
    $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -File -Recurse
}
# Explicit whitelist: repository internals, installed dependencies and local environment files never enter the archive.
$sourceFiles = $sourceFiles | Where-Object {
    -not ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -and
    $_.Extension -notin @('.zip', '.7z', '.tar', '.gz') -and
    $_.Name -notlike '.env*' -and $_.FullName -notmatch '[\\/](\.git|node_modules|dist)[\\/]'
} | Sort-Object FullName
$archiveStream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($archiveStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $sourceFiles) {
        $relativePath = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, 'FarmShiftRemake/' + $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $archive.Dispose()
    $archiveStream.Dispose()
}
Write-Output ('Packaged {0} source files: {1}' -f $sourceFiles.Count, $archivePath)
