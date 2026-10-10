# Empaqueta la carpeta web\ en public_html.zip (el archivo que subes a Namecheap).
# El zip se genera sin carpeta raiz: se extrae directo dentro de public_html.
# Se invoca desde package.bat.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$base = $PSScriptRoot
$out  = Join-Path ([Environment]::GetFolderPath('Desktop')) 'public_html.zip'
$stage = Join-Path $env:TEMP 'webzip_stage'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item (Join-Path $base '*') $stage -Recurse -Force

# Archivos de desarrollo que no deben subirse al hosting.
# .git y .gitignore tambien se excluyen: el repositorio esta dentro de web\, y
# sin esto el zip se lleva el historial completo al hosting publico.
foreach ($skip in @('package.bat', 'package.ps1', 'dev-server.js', 'node_modules', '.git', '.gitignore')) {
    $file = Join-Path $stage $skip
    if (Test-Path $file) { Remove-Item $file -Recurse -Force }
}

if (Test-Path $out) { Remove-Item $out -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $out)

$zip = [System.IO.Compression.ZipFile]::OpenRead($out)
$count = $zip.Entries.Count
$stray = @($zip.Entries | Where-Object { $_.FullName -match '\.(bat|ps1|tmp)$' -or $_.FullName -match 'dev-server|node_modules' -or $_.FullName -match '(^|\\|/)\.git(/|\\|$)|gitignore' })
$zip.Dispose()

Remove-Item $stage -Recurse -Force

Write-Host ("      {0} archivos dentro del zip" -f $count)
if ($stray.Count -gt 0) {
    Write-Warning ("Se colaron archivos que no deberían subirse: {0}" -f ($stray.FullName -join ', '))
    exit 1
}
Write-Host ("[OK] Zip listo: {0}" -f $out)
