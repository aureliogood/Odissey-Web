# =============================================================
#  i18n-completar.ps1
#  Anade las claves de traduccion que faltaban en los diccionarios
#  de cada pagina.
#
#  POR QUE ESTE ARCHIVO USA SIGNOS RAROS EN VEZ DE ACENTOS
#  -------------------------------------------------------
#  Windows guarda un .ps1 en la codificacion del sistema (cp1252)
#  cuando no lleva BOM, y si lleva BOM lo lee como UTF-8. Un
#  fichero sin acentos funciona siempre; uno con acentos depende de
#  como se haya creado, y el fallo es silencioso: el texto sale con
#  dos caracteres raros en vez de una letra acentuada, y nadie se
#
#  Aqui no hay ni un solo acento. Las letras acentuadas se escriben
#  como {u}, {n}, {i} y {e}, que la funcion Pon las convierte al
#  escribir. Asi el resultado es el mismo se ejecute como se
#  ejecute.
#
#  Uso:  powershell -ExecutionPolicy Bypass -File i18n-completar.ps1
# =============================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = New-Object System.Text.UTF8Encoding($false)

# Sustituye los marcadores por la letra acentuada de verdad.
function Pon([string]$texto) {
  $texto = $texto.Replace('{u}', [string][char]0x00FA)   # u acentuada
  $texto = $texto.Replace('{U}', [string][char]0x00DA)   # U acentuada
  $texto = $texto.Replace('{n}', [string][char]0x00F1)   # n con virgulilla
  $texto = $texto.Replace('{N}', [string][char]0x00D1)   # N con virgulilla
  $texto = $texto.Replace('{i}', [string][char]0x00ED)   # i acentuada
  $texto = $texto.Replace('{e}', [string][char]0x00E9)   # e acentuada
  $texto = $texto.Replace('{E}', [string][char]0x00C9)   # E acentuada
  $texto = $texto.Replace('{a}', [string][char]0x00E1)   # a acentuada
  $texto = $texto.Replace('{A}', [string][char]0x00C1)   # A acentuada
  $texto = $texto.Replace('{o}', [string][char]0x00F3)   # o acentuada
  $texto = $texto.Replace('{O}', [string][char]0x00D3)   # O acentuada
  $texto = $texto.Replace('{!}', [string][char]0x00A1)   # apertura de exclamacion
  $texto = $texto.Replace('{?}', [string][char]0x00BF)   # apertura de interrogacion
  return $texto
}

$es = @'
                cta_jugar: 'Entrar al servid{o}r', cta_discord: '{U}nete al Discord',
                cta_tienda: 'Ver la tienda', cta_entrar: 'Entrar', cta_salir: 'Cerrar sesi{o}n',
                cta_registro: 'Crear cuenta', cta_entrar_cuenta: 'Entrar en mi cuenta',
                btn_entrar: 'Entrar', btn_crear: 'Crear cuenta', btn_guardar: 'Guardar',
                btn_cancelar: 'Cancelar', btn_cerrar: 'Cerrar', btn_enviar: 'Enviar',
                btn_copiar: 'Copiar', btn_volver: 'Volver', btn_salir: 'Salir',
                btn_soporte: 'Pedir ayuda', btn_reportar: 'Reportar jugador',
                btn_valorar: 'Valorar', btn_comprar: 'Comprar', btn_carrito: 'Carrito',
                btn_menu: 'Abrir men{u}', btn_whatsapp: 'Escr{!}benos por WhatsApp',
                menu_abrir: 'Abrir men{u}', menu_cerrar: 'Cerrar men{u}',
                faq_title: 'Preguntas frecuentes',
                err_carga: 'No se ha podido cargar. Recarga la p{a}gina.',
                err_red: 'Sin conexi{o}n. Comprueba tu internet.',
                err_generico: 'Algo ha ido mal. Int{e}ntalo de nuevo.',
                estado_cargando: 'Cargando{?}', estado_vacio: 'Nada por aqu{i} todav{i}a.',
'@

$en = @'
                cta_jugar: 'Join the server', cta_discord: 'Join our Discord',
                cta_tienda: 'See the store', cta_entrar: 'Log in', cta_salir: 'Log out',
                cta_registro: 'Create account', cta_entrar_cuenta: 'Log in to my account',
                btn_entrar: 'Log in', btn_crear: 'Create account', btn_guardar: 'Save',
                btn_cancelar: 'Cancel', btn_cerrar: 'Close', btn_enviar: 'Send',
                btn_copiar: 'Copy', btn_volver: 'Back', btn_salir: 'Log out',
                btn_soporte: 'Get support', btn_reportar: 'Report a player',
                btn_valorar: 'Rate', btn_comprar: 'Buy', btn_carrito: 'Cart',
                btn_menu: 'Open menu', btn_whatsapp: 'Message us on WhatsApp',
                menu_abrir: 'Open menu', menu_cerrar: 'Close menu',
                faq_title: 'Frequently asked questions',
                err_carga: 'Could not load. Reload the page.',
                err_red: 'No connection. Check your internet.',
                err_generico: 'Something went wrong. Try again.',
                estado_cargando: 'Loading{?}', estado_vacio: 'Nothing here yet.',
'@

$es = Pon $es
$en = Pon $en

foreach ($f in (Get-ChildItem -LiteralPath $raiz -Filter *.html | Select-Object -ExpandProperty Name)) {
  $ruta = Join-Path $raiz $f
  $c = [System.IO.File]::ReadAllText($ruta, [System.Text.Encoding]::UTF8)

  if ($c -notmatch 'const I18N') { continue }
  if ($c -match 'cta_jugar:') { Write-Host ("  - " + $f + ": ya tiene las claves"); continue }

  $i = $c.IndexOf('es: {')
  if ($i -lt 0) { continue }
  $c = $c.Insert($i + 5, "`n" + $es)

  $j = $c.IndexOf('en: {')
  if ($j -ge 0) { $c = $c.Insert($j + 5, "`n" + $en) }

  [System.IO.File]::WriteAllText($ruta, $c, $enc)
  Write-Host ("  ok " + $f)
}