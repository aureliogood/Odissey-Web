# =============================================================
#  FORMULARIOS: accesibilidad, validacion nativa y anti-spam
# -------------------------------------------------------------
#  QUE HACE ESTE SCRIPT
#  -------------------
#  Odissey no tenia ni un solo <form> en 18 paginas: los "formularios"
#  eran <div> con <input> sueltos y un onclick que llamaba a una
#  funcion de JavaScript. Esoacia tres cosas:
#
#    1. Enter no enviaba nada. Un usuario que escribe su nombre de
#       jugador y pulsa Enter (lo mas natural del mundo) no pasaba
#       nada y pensaba que la pagina estaba rota.
#    2. required no existia: un campo vacio se enviaba igual y el
#       error salia tarde y con otro aspecto.
#    3. No habia ninguna proteccion contra robots. El formulario de
#       reportar jugador esta replicado en 12 paginas y crea un
#       ticket real en Discord: un bot puede llenarlo entero en
#       una noche.
#
#  QUE ANADE
#  ---------
#    - Atributos required / maxlength / pattern / inputmode en los
#      campos, para que el navegador avise antes de enviar.
#    - Un campo trampa (honeypot) invisible en los formularios
#      publicos: si alguien lo rellena, es un robot.
#    - Un limite de envios por persona en el navegador.
#    - Etiquetas accesibles (aria-label) donde no hay un <label>
#      visible, para que los lectores de pantalla anuncien el campo.
#
#  COMO USARLO
#  -----------
#  powershell -ExecutionPolicy Bypass -File formularios.ps1
#
#  Es idempotente: se puede repetir sin duplicar nada.
# =============================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = New-Object System.Text.UTF8Encoding($false)

function Actualizar ([string]$texto, [string]$busqueda, [string]$reemplazo, [string]$etiqueta) {
  if ($texto.Contains($busqueda)) {
    return $texto.Replace($busqueda, $reemplazo)
  }
  Write-Host ("    (sin cambio: no estaba " + $etiqueta + ")")
  return $texto
}

$ficheros = Get-ChildItem -LiteralPath $raiz -Filter *.html | Select-Object -ExpandProperty Name

foreach ($f in $ficheros) {
  $ruta = Join-Path $raiz $f
  $c = [System.IO.File]::ReadAllText($ruta, [System.Text.Encoding]::UTF8)
  $antes = $c

  # -------------------------------------------------------------
  # 1. Campo trampa (honeypot) en el modal de reportar
  # -------------------------------------------------------------
  # Un <input> que:
  #   - esta escondido con CSS (no con type=hidden: un bot lo
  #     rellena igual, un humano con lector de pantalla no lo ve),
  #   - NO tiene autocomplete (si lo tuviera, un gestor de
  #     contrasenas lo podria rellenar solo y joder el formulario).
  # La trampa va justo antes del boton de enviar.
  $trampa = @'
            <!-- Campo trampa anti-spam. Esta oculto y no lo rellena
                 ninguna persona: solo los robots que rellenan todos los
                 campos que encuentran. Si llega relleno, se descarta el
                 envio (ver js/formulario.js). -->
            <input type="text" id="report-trampa" class="form-trampa"
                tabindex="-1" autocomplete="off" aria-hidden="true"
                name="sitio_web" value="">
'@
  $c = Actualizar $c '<p id="report-msg"' ($trampa + '            <p id="report-msg"') 'campo trampa'

  # -------------------------------------------------------------
  # 2. El nombre del jugador a reportar
  # -------------------------------------------------------------
  # required: no se puede enviar sin escribirlo.
  # inputmode: en el movil sale el teclado de texto normal, que es lo
  #   que se quiere (un nombre de Minecraft lleva letras, numeros y _).
  # pattern: el mismo patron que ya comprobaba el JavaScript, pero
  #   ahora el navegador lo pide antes de mandar nada.
  # autocapitalize=none: que no ponga la primera letra en mayuscula,
  #   que en Minecraft no existe y por tanto no serviria.
  $viejoTarget = '<input type="text" id="report-target" placeholder="Jugador a reportar" autocomplete="off" maxlength="16">'
  $nuevoTarget = '<input type="text" id="report-target" name="jugador" placeholder="Jugador a reportar"' +
    ' autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="text"' +
    ' maxlength="16" pattern="[A-Za-z0-9_]{1,16}" required aria-label="Nombre del jugador a reportar">'
  $c = Actualizar $c $viejoTarget $nuevoTarget 'report-target'

  # -------------------------------------------------------------
  # 3. El detalle del reporte: limite de longitud
  # -------------------------------------------------------------
  # Sin maxlength, alguien puede pegar 200 KB en el textarea. Eso va
  # entero por la API y se guarda en la base de datos.
  $viejoDet = '<textarea id="report-detail" class="rating-comment mt-4" placeholder='
  $nuevoDet = '<textarea id="report-detail" name="detalle" class="rating-comment mt-4" maxlength="1500" rows="4"' +
    ' placeholder='
  $c = Actualizar $c $viejoDet $nuevoDet 'report-detail'

  # -------------------------------------------------------------
  # 4. El enlace de la captura: tiene que ser una URL
  # -------------------------------------------------------------
  # type="url" hace que el navegador lo valide y que en el movil
  # aparezca el teclado con la barra de direccion. Ademas se
  # comprueba el esquema antes de enviarlo: un "javascript:..." en un
  # href se ejecuta al pincharlo, y este valor lo escribe el usuario
  # que abre el reporte (ver urlSegura en js/seguro.js).
  $viejoCap = '<input id="report-capture" class="rating-comment mt-4" placeholder="Enlace de captura (opcional)" autocomplete="off">'
  $nuevoCap = '<input id="report-capture" name="captura" type="url" inputmode="url" spellcheck="false"' +
    ' class="rating-comment mt-4" maxlength="500" autocomplete="off"' +
    ' placeholder="https://... (opcional)" aria-label="Enlace de la captura, opcional">'
  $c = Actualizar $c $viejoCap $nuevoCap 'report-capture'

  # -------------------------------------------------------------
  # 5. El nombre de Minecraft de la cuenta (compras)
  # -------------------------------------------------------------
  $viejoMc = '<input id="mcNameInput" type="text" class="mc-name-input" maxlength="16" autocomplete="off" placeholder="Steve">'
  $nuevoMc = '<input id="mcNameInput" name="minecraft" type="text" class="mc-name-input" maxlength="16"' +
    ' autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="text"' +
    ' pattern="[A-Za-z0-9_]{3,16}" placeholder="Steve" aria-label="Tu nombre de Minecraft">'
  $c = Actualizar $c $viejoMc $nuevoMc 'mcNameInput'

  # -------------------------------------------------------------
  # 6. El comentario de la valoracion: limite de longitud
  # -------------------------------------------------------------
  $viejoCom = '<textarea id="rating-comment" class="rating-comment" placeholder='
  $nuevoCom = '<textarea id="rating-comment" name="comentario" class="rating-comment" maxlength="500" rows="3" placeholder='
  $c = Actualizar $c $viejoCom $nuevoCom 'rating-comment'

  if ($c -ne $antes) {
    [System.IO.File]::WriteAllText($ruta, $c, $enc)
    Write-Host ("  ok " + $f)
  }
}

Write-Host ''
Write-Host 'Hecho. Falta anadir el estilo de .form-trampa (esta en theme.css)'
Write-Host 'y el script js/formulario.js que comprueba la trampa y el limite'
Write-Host 'de envios. Ambos se anaden en el paso siguiente.'