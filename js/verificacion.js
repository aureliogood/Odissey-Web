// ===================================================================
// verificacion.js - Pagina de verificacion de staff.
//
// El codigo de /staffweb lo firmaba el bot del servidor de Minecraft.
// El bot ya no forma parte del despliegue (la web es estatica y los datos
// viven en Supabase), así que no hay forma de comprobar ese código sin
// backend: aceptarlo sin verificar sería una puerta de atrás.
//
// La pagina se conserva solo para explicar el estado y no dejar un
// formulario que siempre falla. Si vuelve a haber backend, aqui esta el
// punto donde reconectar /api/staff/status y /api/staff/link.
// ===================================================================
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esEn() {
    try { return localStorage.getItem('odissey_lang') === 'en'; } catch (e) { return false; }
  }

  function retirado() {
    var mensaje = esEn()
      ? 'Staff verification is temporarily unavailable. Contact an administrator.'
      : 'La verificación de staff no está disponible temporalmente. Contacta con un administrador.';

    var texto = el('verifTexto');
    if (texto) texto.textContent = mensaje;
    var icono = el('verifIcono');
    if (icono) icono.textContent = '\u26D4';
    ['verifDatos', 'verifConfirmar', 'verifPie', 'verifPanel'].forEach(function (id) {
      var n = el(id);
      if (n) n.hidden = true;
    });
    var codigo = el('verifCodigo');
    if (codigo) codigo.disabled = true;
    var si = el('verifSi');
    if (si) si.disabled = true;
    var no = el('verifNo');
    if (no) no.hidden = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', retirado);
  } else {
    retirado();
  }
})();
