# =============================================================
#  SEO: genera el bloque de datos estructurados (JSON-LD) de cada
#  pagina.
#
#  QUE SON ESTOS DATOS
#  -------------------
#  Google (y los buscadores de IA como ChatGPT o Perplexity) leen
#  este bloque para entender QUE es cada pagina y de whom es. Con
#  esto puede mostrar el nombre del sitio, el logo, los enlaces
#  de navegacion y la seccion "Como llegar" sin tener que adivinarlo.
#
#  QUE HACE ESTE SCRIPT
#  -------------------
#  Antes las 10 paginas que lo tenian tenían un bloque IDENTICO:
#  un VideoGame con la IP del servidor. Eso es malo por dos motivos:
#    1. Copiar el mismo bloque en 10 URLs distintas es una señal de
#       contenido duplicado: Google lo interpreta como que las 10
#       paginas son la misma.
#    2. El bloque no decia nada de la pagina en la que estaba. No
#       ayudaba a posicionar /tienda ni /noticias, solo repetia.
#
#  Este script reemplaza ese bloque por uno propio de cada pagina
#  (WebSite + BreadcrumbList + el tipo que corresponda) y lo
#  anade en las paginas que no lo tenian.
#
#  COMO USARLO
#  -----------
#  powershell -ExecutionPolicy Bypass -File seo-schema.ps1
#
#  Es idempotente: se puede volver a ejecutar sin duplicar nada.
# =============================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = New-Object System.Text.UTF8Encoding($false)

# Que datos tiene cada pagina. La clave es el fichero; el valor es
# el @type que describe lo que hay en esa pagina y su posicion en
# la miga de pan.
$paginas = @{
  'index.html'            = @{ tipo = 'VideoGame';  titulo = 'Odissey - Servidor de Minecraft Java'; url = 'https://odisseymc.site/';        miga = @() }
  'tienda.html'           = @{ tipo = 'OnlineStore'; titulo = 'Tienda de Odissey'; url = 'https://odisseymc.site/tienda';    miga = @('Tienda') }
  'noticias.html'         = @{ tipo = 'CollectionPage'; titulo = 'Noticias de Odissey'; url = 'https://odisseymc.site/noticias'; miga = @('Noticias') }
  'eventos.html'          = @{ tipo = 'CollectionPage'; titulo = 'Eventos de Odissey'; url = 'https://odisseymc.site/eventos';  miga = @('Eventos') }
  'galeria.html'          = @{ tipo = 'ImageGallery'; titulo = 'Galeria de construcciones de Odissey'; url = 'https://odisseymc.site/galeria'; miga = @('Galeria') }
  'wiki.html'             = @{ tipo = 'FAQPage';      titulo = 'Wiki de Odissey'; url = 'https://odisseymc.site/wiki';       miga = @('Wiki') }
  'reglas.html'           = @{ tipo = 'WebPage';      titulo = 'Reglas de Odissey'; url = 'https://odisseymc.site/reglas';   miga = @('Reglas') }
  'soporte.html'          = @{ tipo = 'ContactPage';  titulo = 'Soporte de Odissey'; url = 'https://odisseymc.site/soporte';  miga = @('Soporte') }
  'reportes.html'         = @{ tipo = 'WebPage';      titulo = 'Reportes de Odissey'; url = 'https://odisseymc.site/reportes'; miga = @('Reportes') }
  'postulaciones.html'    = @{ tipo = 'WebPage';      titulo = 'Postulaciones al staff de Odissey'; url = 'https://odisseymc.site/postulaciones'; miga = @('Postulaciones') }
  'staff.html'            = @{ tipo = 'AboutPage';    titulo = 'Equipo de Odissey'; url = 'https://odisseymc.site/staff';     miga = @('Staff') }
  # admin.html, perfil.html y staffverificar.html NO entran aqui a
  # proposito: las tres llevan noindex y ningun buscador debe
  # guardarlas. Meter datos estructurados en una pagina que no se
  # indexa es trabajo tirado.
  'privacidad.html'       = @{ tipo = 'WebPage';      titulo = 'Politica de privacidad de Odissey'; url = 'https://odisseymc.site/privacidad'; miga = @('Privacidad') }
  'terminos.html'         = @{ tipo = 'WebPage';      titulo = 'Terminos y condiciones de Odissey'; url = 'https://odisseymc.site/terminos'; miga = @('Terminos') }
  '404.html'              = @{ tipo = 'WebPage';      titulo = 'Pagina no encontrada'; url = 'https://odisseymc.site/404.html'; miga = @('404') }
}

# JSON-LD siempre en espanol y con el subtipo correcto.
function Convertir-Json ([object]$obj) {
  # Depth 10: el bloque tiene varios niveles anidados.
  ($obj | ConvertTo-Json -Depth 10) -replace "`r`n\s*", "`n"
}

function Construir-Bloque ($info) {
  $n = $info

  $webSite = [ordered]@{
    '@type' = 'WebSite'
    '@id'   = 'https://odisseymc.site/#website'
    'url'   = 'https://odisseymc.site/'
    'name'  = 'Odissey Minecraft Server'
    'inLanguage' = 'es'
    'publisher' = [ordered]@{
      '@type' = 'Organization'
      '@id'   = 'https://odisseymc.site/#org'
      'name'  = 'Odissey'
      'url'   = 'https://odisseymc.site/'
      'logo'  = [ordered]@{
        '@type'  = 'ImageObject'
        'url'    = 'https://odisseymc.site/img/logo-web.webp'
        'width'  = 900
        'height' = 382
      }
    }
  }

  $pagina = [ordered]@{
    '@type'      = $n.tipo
    '@id'        = $n.url + '#pagina'
    'url'        = $n.url
    'name'       = $n.titulo
    'inLanguage' = 'es'
    'isPartOf'   = [ordered]@{ '@id' = 'https://odisseymc.site/#website' }
    'publisher'  = [ordered]@{ '@id' = 'https://odisseymc.site/#org' }
  }

  if ($n.tipo -eq 'VideoGame') {
    # Solo la portada describe el juego. El resto de paginas no lo
    # repiten: repetirlo era justamente el problema.
    $pagina['description']  = 'Servidor de Minecraft Java Survival Custom con kits, rangos y comunidad.'
    $pagina['genre']        = @('Survival', 'Multiplayer', 'Custom RPG')
    $pagina['gamePlatform'] = @('PC')
    $pagina['applicationCategory'] = 'Game'
    $pagina['operatingSystem'] = 'Minecraft 1.20 - 1.21'
    $pagina['image'] = 'https://odisseymc.site/img/og-image.jpg'
  }

  if ($n.tipo -eq 'OnlineStore') {
    $pagina['description'] = 'Tienda oficial: kits, rangos y llaves del servidor Odissey.'
    $pagina['image'] = 'https://odisseymc.site/img/og-image.jpg'
  }

  if ($n.tipo -eq 'ContactPage') {
    $pagina['description'] = 'Como pedir ayuda, reportar un jugador o contactar con el equipo de Odissey.'
    $pagina['image'] = 'https://odisseymc.site/img/og-image.jpg'
  }

  # Miga de pan: le dice al buscador donde esta esta pagina dentro
  # del sitio (Portada > Tienda, por ejemplo). Aparece como el
  # "breadcrumb" en los resultados.
  $migaItems = @(
    [ordered]@{
      '@type'    = 'ListItem'
      'position' = 1
      'name'     = 'Inicio'
      'item'     = 'https://odisseymc.site/'
    }
  )
  $pos = 2
  foreach ($paso in $n.miga) {
    $migaItems += [ordered]@{
      '@type'    = 'ListItem'
      'position' = $pos
      'name'     = $paso
    }
    $pos++
  }

  $miga = [ordered]@{
    '@type'           = 'BreadcrumbList'
    '@id'             = $n.url + '#miga'
    'itemListElement' = $migaItems
  }

  $grafico = [ordered]@{ '@id' = 'https://odisseymc.site/#website' }

  return [ordered]@{ '@context' = 'https://schema.org'; '@graph' = @($webSite, $pagina, $miga, $grafico) }
}

# Borra cualquier bloque JSON-LD anterior de la pagina.
function Quitar-JsonLdViejo ($texto) {
  return [regex]::Replace($texto, '(?s)<script type="application/ld\+json">.*?</script>\s*', '')
}

Write-Host 'Generando datos estructurados (JSON-LD)...'
foreach ($f in $paginas.Keys) {
  $ruta = Join-Path $raiz $f
  if (-not (Test-Path -LiteralPath $ruta)) { Write-Host ("  - " + $f + ": no existe, se salta"); continue }

  $texto = [System.IO.File]::ReadAllText($ruta, [System.Text.Encoding]::UTF8)
  $texto = Quitar-JsonLdViejo $texto

  $json = Convertir-Json (Construir-Bloque $paginas[$f])
  $bloque = '    <script type="application/ld+json">' + "`n" + $json + "`n" + '    </script>' + "`n"

  # Se inserta justo antes de </head>, que es donde ya viven el
  # canonical, el og:image y el resto de datos del buscador.
  $i = $texto.IndexOf('</head>')
  if ($i -lt 0) { Write-Host ("  - " + $f + ": sin </head>, se salta"); continue }
  $texto = $texto.Insert($i, $bloque)

  [System.IO.File]::WriteAllText($ruta, $texto, $enc)
  Write-Host ("  ok " + $f)
}

Write-Host ''
Write-Host 'Listo. Comprueba el resultado con:'
Write-Host '  https://search.google.com/test/rich-results'
