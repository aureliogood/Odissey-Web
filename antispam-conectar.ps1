# =============================================================
#  ANTI-SPAM: conecta la proteccion del cliente al envio real
# -------------------------------------------------------------
#  Que hace este script
#  -------------------
#  formularios.ps1 ya anadio el campo trampa y los atributos de
#  validacion al HTML. Faltaba lo importante: que el JavaScript que
#  hace el envio LO MIRE. Sin esto, la trampa es un campo
#  decorativo que nadie comprueba y no protege de nada.
#
#  Este script inserta DOS cosas en cada pagina:
#
#    1. Al principio de submitReport(): una llamada a
#       OdisseyFormulario.puedeEnviar(). Si dice que no, se corta el
#       envio y se explica por que.
#
#    2. Justo despues de que el servidor confirme que el reporte se
#       guardo, una llamada a OdisseyFormulario.registrarEnvio().
#       Ahi, y no antes: si el envio falla, el visitante no ha
#       perdido ningun intento de los cinco.
#
#  Tambien valida el enlace de la captura con enlaceSeguro(), para
#  que un "javascript:..." pegado en ese campo no llegue a
#  ejecutarse cuando el staff lo pincha en el panel.
#
#  Uso:  powershell -ExecutionPolicy Bypass -File antispam-conectar.ps1
#  Es idempotente: se puede repetir sin duplicar nada.
# =============================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = New-Object System.Text.UTF8Encoding($false)

# ---- Bloque 1: la guardia, al principio de la funcion ----
$guardia = @'
@IND@    /* ---------- Proteccion anti-spam (js/formulario.js) ----------
@IND@     * Comprueba tres cosas antes de dejar salir nada:
@IND@     *   - que no se hayan enviado ya 5 mensajes en 10 minutos,
@IND@     *   - que el campo trampa siga vacio (los robots lo rellenan),
@IND@     *   - que no sea alguien soltando envios en bucle.
@IND@     *
@IND@     * El aviso NO dice cual de las tres fallo. Si lo dijera, un
@IND@     * bot aprenderia a esquivarlo cambiando solo esa parte. */
@IND@    const controlAntiSpam = (window.OdisseyFormulario && window.OdisseyFormulario.puedeEnviar())
@IND@        ? window.OdisseyFormulario.puedeEnviar()
@IND@        : { ok: true };
@IND@    if (!controlAntiSpam.ok) {
@IND@        if (reportMsg) reportMsg.textContent = controlAntiSpam.motivo;
@IND@        showNotification(controlAntiSpam.motivo);
@IND@        return;
@IND@    }
@IND@
@IND@    /* La captura la escribe quien abre el reporte y acaba en un
@IND@     * href que pincha el staff dentro del panel. Si trae un esquema
@IND@     * raro (javascript:, data:, vbscript:) se ejecuta al pincharlo,
@IND@     * asi que se descarta aqui. */
@IND@    if (reportCapture && reportCapture.value.trim() &&
@IND@        !(window.OdisseyFormulario && window.OdisseyFormulario.enlaceSeguro(reportCapture.value))) {
@IND@        const avisoCaptura = 'Ese enlace no es válido. Pega una dirección que empiece por https://';
@IND@        if (reportMsg) reportMsg.textContent = avisoCaptura;
@IND@        showNotification(avisoCaptura);
@IND@        return;
@IND@    }
@IND@
'@

# ---- Bloque 2: contar el envio, cuando el servidor dice que ok ----
$contar = @'
@IND@            /* Se cuenta el envio aqui y no antes: si el servidor
@IND@             * devuelve un error, el visitante no ha perdido ninguno
@IND@             * de sus cinco intentos. */
@IND@            if (window.OdisseyFormulario) window.OdisseyFormulario.registrarEnvio();
@IND@
@IND@            const reportId = result.json && result.json.report ? result.json.report.id : null;
'@

$ficheros = Get-ChildItem -LiteralPath $raiz -Filter *.html | Select-Object -ExpandProperty Name

foreach ($f in $ficheros) {
  $ruta = Join-Path $raiz $f
  $c = [System.IO.File]::ReadAllText($ruta, [System.Text.Encoding]::UTF8)

  if ($c -notmatch 'function submitReport\(\)') { continue }
  if ($c -match 'controlAntiSpam') {
    Write-Host ("  - " + $f + ": ya conectado")
    continue
  }

  $i = $c.IndexOf('function submitReport()')
  $iniLinea = $c.LastIndexOf("`n", $i) + 1
  $prefijo = $c.Substring($iniLinea, $i - $iniLinea)
  $ind = ($prefijo -replace '[^\s]', '')
  if ([string]::IsNullOrEmpty($ind)) { $ind = '        ' }

  $hecho = 0

  # ---- Bloque 2: el contador, tras la respuesta correcta ----
  $ancla = 'const reportId = result.json && result.json.report ? result.json.report.id : null;'
  $pos = $c.IndexOf($ancla)
  if ($pos -ge 0) {
    # Misma indentacion que la linea del ancla.
    $iniAncla = $c.LastIndexOf("`n", $pos) + 1
    $indAncla = ($c.Substring($iniAncla, $pos - $iniAncla) -replace '[^\s]', '')
    if ([string]::IsNullOrEmpty($indAncla)) { $indAncla = $ind }
    $c = $c.Insert($pos, ($contar.Replace('@IND@', $indAncla) + $ancla + "`n"))
    $hecho++
  }

  # ---- Bloque 1: la guardia, al principio de la funcion ----
  $apertura = $c.IndexOf('{', $i) + 1
  $c = $c.Insert($apertura, ($guardia.Replace('@IND@', $ind) + "`n"))
  $hecho++

  [System.IO.File]::WriteAllText($ruta, $c, $enc)
  Write-Host ("  ok " + $f + " (" + $hecho + " bloques)")
}