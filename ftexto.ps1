# =============================================================
#  ftexto.ps1 — utilidades para revisar el sitio sin abrir 200 KB
#               de HTML a mano.
#
#  QUE ES
#  ------
#  Un revisor de la carpeta web. Comprueba lo que se rompe en
#  silencio (acentos rotos, JavaScript con error, enlaces que no
#  llevan a ningun sitio, paginas sin H1, scripts cargados dos
#  veces) y lo dice en una linea por problema.
#
#  COMO SE USA
#  -----------
#     powershell -ExecutionPolicy Bypass -File ftexto.ps1
#         Revision completa (lo que se ejecuta sin argumentos).
#
#     powershell -ExecutionPolicy Bypass -File ftexto.ps1 buscar "onclick"
#         Donde aparece un texto, con numero de linea.
#
#     powershell -ExecutionPolicy Bypass -File ftexto.ps1 enlaces
#         Solo enlaces rotos, paginas sin H1 y scripts duplicados.
#
#  NOTA SOBRE LOS ACENTOS
#  ----------------------
#  Este archivo no lleva ni un acento a proposito. Windows guarda un
#  .ps1 en la codificacion del sistema cuando no tiene BOM, y al
#  leerlo un acento se convierte en dos caracteres raros. Un script
#  que se ejecuta a si mismo no puede depender de como se guardo.
#  Los textos que se ensean al usuario van sin acentos; el resto
#  del sitio los tiene todos.
# =============================================================

param(
  [Parameter(Position = 0)][string]$Comando = 'todo',
  [Parameter(Position = 1)][string]$Texto = ''
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = [System.Text.Encoding]::UTF8

# Solo ficheros de texto. Si se leen imagenes como texto, cada byte
# alto de un PNG cuenta como un acento roto y la lista se llena de
# falsos positivos que no significan nada.
function SoloTexto {
  $exts = @('.html', '.js', '.css', '.md', '.ps1', '.json', '.xml', '.txt', '.conf', '.example')
  Get-ChildItem -LiteralPath $raiz -Recurse -File |
    Where-Object { $exts -contains $_.Extension.ToLower() }
}

function Paginas {
  Get-ChildItem -LiteralPath $raiz -Filter *.html | Sort-Object Name
}

function Integridad {
  Write-Host '=== INTEGRIDAD ==='
  $strict = New-Object System.Text.UTF8Encoding($false, $true)
  $n = 0
  foreach ($f in Paginas) {
    try { [void]$strict.GetString([System.IO.File]::ReadAllBytes($f.FullName)) }
    catch { Write-Host ('  UTF-8 INVALIDO: ' + $f.Name); $n++ }
  }
  foreach ($f in (Get-ChildItem -LiteralPath $raiz -File -Filter *.js)) {
    if ($f.Name -like '_*') { continue }   # scripts de comprobacion
    $null = & node --check $f.FullName 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Host ('  JS con error de sintaxis: ' + $f.Name); $n++ }
  }
  # Los .ps1 tambien tienen que poder ejecutarse.
  foreach ($f in (Get-ChildItem -LiteralPath $raiz -File -Filter *.ps1)) {
    $errores = $null
    $null = [System.Management.Automation.PSParser]::Tokenize(
      [System.IO.File]::ReadAllText($f.FullName, $enc), [ref]$errores)
    if ($errores -and $errores.Count) {
      Write-Host ('  PS1 con error de sintaxis: ' + $f.Name); $n++
    }
  }
  if ($n -eq 0) { Write-Host '  Sin errores de sintaxis ni de codificacion.' }
}

function Mojibake {
  Write-Host ''
  Write-Host '=== ACENTOS ROTOS (mojibake) ==='
  $malo = [regex]::Escape([string][char]0x00C3) + '|' +
  [regex]::Escape([string][char]0x00C2) + '|' +
  [regex]::Escape([string][char]0xFFFD)
  $n = 0
  foreach ($f in (SoloTexto)) {
    $c = [System.IO.File]::ReadAllText($f.FullName, $enc)
    $m = ([regex]::Matches($c, $malo)).Count
    if ($m -gt 0) {
      Write-Host ('  ' + $f.FullName.Substring($raiz.Length + 1) + ' : ' + $m)
      $n++
    }
  }
  if ($n -eq 0) { Write-Host '  Ninguno.' }
}

function Extranos {
  Write-Host ''
  Write-Host '=== CARACTERES DE OTRO IDIOMA (chino, japones) ==='
  $n = 0
  foreach ($f in (SoloTexto)) {
    $c = [System.IO.File]::ReadAllText($f.FullName, $enc)
    $m = ([regex]::Matches($c, '[\u4e00-\u9fff\u3040-\u30ff]')).Count
    if ($m -gt 0) {
      Write-Host ('  ' + $f.FullName.Substring($raiz.Length + 1) + ' : ' + $m)
      $n++
    }
  }
  if ($n -eq 0) { Write-Host '  Ninguno.' }
}

function Duplicados {
  Write-Host ''
  Write-Host '=== FICHEROS DUPLICADOS (md5) ==='
  $md5 = @{}
  foreach ($f in (Get-ChildItem -LiteralPath $raiz -Recurse -File -Include *.css, *.js)) {
    $h = (Get-FileHash $f.FullName -Algorithm MD5).Hash
    if (-not $md5.ContainsKey($h)) { $md5[$h] = @() }
    $md5[$h] += $f.Name
  }
  $n = 0
  foreach ($k in $md5.Keys) {
    if ($md5[$k].Count -gt 1) { Write-Host ('  ' + ($md5[$k] -join ' = ')); $n++ }
  }
  if ($n -eq 0) { Write-Host '  Ninguno.' }
}

function Enlaces {
  Write-Host '=== ENLACES QUE NO LLEVAN A NINGUN SITIO ==='
  $n = 0
  foreach ($f in Paginas) {
    $c = [System.IO.File]::ReadAllText($f.FullName, $enc)
    foreach ($m in [regex]::Matches($c, '(?:href|src)="([^"#?]+)(?:\?[^"]*)?"')) {
      $url = $m.Groups[1].Value
      if ($url -match '^(https?:|mailto:|tel:|data:|#|//)') { continue }
      # Plantillas de JavaScript: ${PLACEHOLD}, ${escapeHtml(g.image)}...
      # No son rutas reales, se resuelven en tiempo de ejecucion.
      if ($url -match '[$}{()]') { continue }
      $ruta = Join-Path $raiz ($url -replace '^\./', '')
      if (-not (Test-Path -LiteralPath $ruta)) {
        $linea = ($c.Substring(0, $m.Index) -split "`n").Count
        Write-Host ('  ' + $f.Name + ':' + $linea + ' -> ' + $url)
        $n++
      }
    }
  }
  if ($n -eq 0) { Write-Host '  Ninguno. Todos apuntan a algo real.' }

  Write-Host ''
  Write-Host '=== PAGINAS SIN H1 ==='
  $n = 0
  foreach ($f in Paginas) {
    $c = [System.IO.File]::ReadAllText($f.FullName, $enc)
    $cuerpo = $c.Substring($c.IndexOf('<body'))
    if ($cuerpo -notmatch '<h1') { Write-Host ('  ' + $f.Name); $n++ }
  }
  if ($n -eq 0) { Write-Host '  Ninguna. Todas tienen un H1.' }

  Write-Host ''
  Write-Host '=== SCRIPT CARGADO MAS DE UNA VEZ ==='
  $n = 0
  foreach ($f in Paginas) {
    $c = [System.IO.File]::ReadAllText($f.FullName, $enc)
    foreach ($m in [regex]::Matches($c, '<script src="([^"]+)"')) {
      $n2 = ([regex]::Matches($c, [regex]::Escape($m.Value))).Count
      if ($n2 -gt 1) {
        Write-Host ('  ' + $f.Name + ': ' + $m.Groups[1].Value + ' x' + $n2)
        $n++
      }
    }
  }
  if ($n -eq 0) { Write-Host '  Ninguno.' }
}

function Buscar {
  if (-not $Texto) { Write-Host 'Falta el texto a buscar.'; exit 1 }
  $n = 0
  foreach ($f in Paginas) {
    $c = [System.IO.File]::ReadAllText($f.FullName, $enc)
    foreach ($m in [regex]::Matches($c, [regex]::Escape($Texto))) {
      $linea = ($c.Substring(0, $m.Index) -split "`n").Count
      $ini = [Math]::Max(0, $m.Index - 40)
      $ctx = $c.Substring($ini, [Math]::Min(110, $c.Length - $ini)) -replace "`r?`n", ' '
      Write-Host ('{0}:{1}  ...{2}...' -f $f.Name, $linea, $ctx.Trim())
      $n++
    }
  }
  if ($n -eq 0) { Write-Host ('No aparece "' + $Texto + '" en ninguna pagina.') }
}

function ContenidoInvisible {
  Write-Host ''
  Write-Host '=== CONTENIDO INVISIBLE (el bug mas grave posible) ==='
  Write-Host '  Comprueba que ningun elemento con la clase "reveal" se queda'
  Write-Host '  sin "visible". El CSS les pone opacity:0, asi que si el'
  Write-Host '  JavaScript que se la pone falla, el contenido no se ve.'
  Write-Host '  Es la comprobacion que mas veces ha encontrado algo, asi que'
  Write-Host '  se ejecuta siempre.'
  Write-Host ''
  try {
    $jsdom = Test-Path -LiteralPath (Join-Path $raiz 'node_modules/jsdom')
    if (-not $jsdom) {
      Write-Host '  (no se puede comprobar: falta jsdom. npm install --no-save jsdom)'
      return
    }
    $salida = & node (Join-Path $raiz '_comprobar-visible.cjs') 2>&1
    $salida | ForEach-Object { Write-Host ('  ' + $_) }
    if ($LASTEXITCODE -ne 0) { $n++ }
  }
  catch { Write-Host ('  no se pudo ejecutar: ' + $_.Exception.Message) }
}

switch ($Comando) {
  'buscar' { Buscar }
  'enlaces' { Enlaces }
  'revisar' { Integridad; Mojibake; Extranos; Duplicados }
  'todo' { Integridad; Mojibake; Extranos; Duplicados; Enlaces; ContenidoInvisible }
  default { Write-Host 'Comandos: (ninguno) | buscar <texto> | enlaces | revisar' }
}