# Empaqueta la carpeta raiz en public_html.zip (el archivo que subes al hosting).
# El zip se genera sin carpeta raiz: se extrae directo dentro de public_html.
# Se invoca desde package.bat. La lista de exclusiones es la misma de package.js.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$base = $PSScriptRoot
$out  = Join-Path ([Environment]::GetFolderPath('Desktop')) 'public_html.zip'
$stage = Join-Path $env:TEMP 'webzip_stage'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item (Join-Path $base '*') $stage -Recurse -Force

# Archivos y carpetas de desarrollo que no deben subirse al hosting.
# Equivale a EXCLUIDOS + NUNCA_PUBLICO + EXTENSIONES_FUERA de package.js.
# .git y .gitignore se excluyen: el repositorio esta dentro de la carpeta,
# y sin esto el zip se lleva el historial completo al hosting publico.
$excluidos = @(
    '.publish-tmp',
    'web-publish.zip',
    'dev-server.js',
    'probar-login.html',
    'limpiar.html',
    'BOT-PANEL.md',
    'OdisseyPesca',
    'package.js',
    'package.bat',
    'package.ps1',
    'ftexto.ps1',
    'formularios.ps1',
    'antispam-conectar.ps1',
    'i18n-completar.ps1',
    'seo-schema.ps1',
    'ver-supabase.ps1',
    '_comprobar-visible.cjs',
    'nginx.conf.example',
    'odissey-security-headers.conf',
    'SEGURIDAD.md',
    'WAF.md',
    'SEO.md',
    'MIGRACION-SUPABASE.md',
    'bot-turnstile.js',
    '.gitignore',
    '.git',
    'node_modules',
    'supabase',
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini'
)

# Patrones de package.js: todo .ps1/.bat/.md/.zip/.example, los temporales,
# los artefactos que empiezan por guion bajo y cualquier nombre que parezca
# un secreto o una credencial. .htaccess y .well-known NO encajan: si deben
# subir.
$patrones = @(
    '*.ps1',
    '*.bat',
    '*.md',
    '*.example',
    '*.zip',
    '*.log',
    '*.tmp',
    '*.bak',
    '*.old',
    '*.map',
    '*.ps1d',
    '_*',
    '.env*',
    '.ssh*',
    '.aws*',
    '*secret*',
    '*credencial*',
    '*apikey*'
)

$aBorrar = @(Get-ChildItem -LiteralPath $stage -Recurse -Force | Where-Object {
    $nombre = $_.Name
    ($excluidos -contains $nombre) -or
    @($patrones | Where-Object { $nombre -like $_ }).Count -gt 0
})

# Borrar primero los hijos para que no queden rutas colgando de carpetas
# excluidas (por ejemplo supabase/ o node_modules/).
foreach ($entrada in ($aBorrar | Sort-Object { $_.FullName.Length } -Descending)) {
    if (Test-Path -LiteralPath $entrada.FullName) {
        Remove-Item -LiteralPath $entrada.FullName -Recurse -Force
    }
}

if (Test-Path $out) { Remove-Item $out -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $out)

$zip = [System.IO.Compression.ZipFile]::OpenRead($out)
$count = $zip.Entries.Count
$stray = @($zip.Entries | Where-Object {
    $nombre = Split-Path -Path $_.FullName -Leaf
    $ruta = $_.FullName -replace '\\', '/'
    ($nombre -match '\.(bat|ps1|md|zip|log|tmp|bak|old|map|example|ps1d)$') -or
    ($nombre -like '_*') -or
    ($nombre -like '.env*') -or
    ($ruta -match '(^|/)(node_modules|supabase|\.git|\.publish-tmp)(/|$)') -or
    ($ruta -match '(^|/)((dev-server|package)\.js|bot-turnstile\.js)$')
})
$zip.Dispose()

Remove-Item $stage -Recurse -Force

Write-Host ("      {0} archivos dentro del zip" -f $count)
if ($stray.Count -gt 0) {
    Write-Warning ("Se colaron archivos que no deberian subirse: {0}" -f (($stray | ForEach-Object { $_.FullName }) -join ', '))
    exit 1
}
Write-Host ("[OK] Zip listo: {0}" -f $out)
