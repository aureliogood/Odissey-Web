// ===================================================================
// verificacion.js - Pagina de verificacion de staff.
//
// El staff escribe /staffweb en el juego, el servidor firma una prueba y le
// da un codigo de 5 digitos. Ese codigo se pone aqui y, con la sesion de su
// cuenta, se canjea por el enlace entre la cuenta web y su identidad de
// Minecraft.
//
// Lo que hace SEGURO aqui no es esta pagina, sino lo que hay detras:
//   - la prueba la firma el servidor con un secreto compartido
//   - el codigo caduca en minutos y se usa una sola vez
//   - hace falta la contraseña de la cuenta
// Esta pagina solo pinta el formulario. Si alguien manipulase el HTML desde
// aqui no conseguiria nada: el backend es quien decide.
// ===================================================================
(function () {
  'use strict';

  const API = window.API_BASE || 'https://odisseymc.site/bot';

  const T = {
    es: {
      sin_enlace: 'No hay ningún enlace en esta dirección.',
      entra: 'Entra primero con tu usuario y contraseña.',
      ok: 'Verificado. Ya puedes entrar al panel.',
      codigo_malo: 'Ese codigo no vale, ya se ha usado o ha caducado.',
      no_eres: 'Entendido. El enlace no se ha usado.',
      no_entra: 'Tu cuenta está enlazada, pero no tiene acceso al panel.',
      cargando: 'Comprobando...'
    },
    en: {
      sin_enlace: 'There is no link in this address.',
      entra: 'Log in with your account first.',
      ok: 'Verified. You can enter the admin panel now.',
      codigo_malo: 'That code is not valid, was already used or has expired.',
      no_eres: 'Understood. The link was not used.',
      no_entra: 'Your account is linked but does not have panel access.',
      cargando: 'Checking...'
    }
  };

  function idioma() {
    try { return localStorage.getItem('odissey_lang') === 'en' ? 'en' : 'es'; } catch (e) { return 'es'; }
  }
  function t(k) { return (T[idioma()] || T.es)[k] || ''; }
  function el(id) { return document.getElementById(id); }
  function token() {
    try { return localStorage.getItem('odissey_discord_session') || ''; } catch (e) { return ''; }
  }

  async function api(ruta, opciones) {
    const opts = Object.assign({ method: 'GET' }, opciones || {});
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    opts.headers.Authorization = 'Bearer ' + token();
    if (opts.body !== undefined && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    try {
      const r = await fetch(API + ruta, opts);
      const json = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, datos: json };
    } catch (e) {
      return { ok: false, status: 0, datos: {} };
    }
  }

  function claim() {
    // Antes el codigo venia en la URL (?c=...). Ahora lo escribe el staff, pero
    // si alguien lo recibe en un enlace se rellena solo.
    return new URLSearchParams(location.search).get('c') || '';
  }

  function textoFinal(texto) {
    el('verifTexto').textContent = texto;
    el('verifConfirmar').hidden = true;
    el('verifDatos').hidden = true;
  }

  async function iniciar() {
    el('verifTexto').textContent = t('cargando');
    el('verifCodigo').value = claim();

    const estado = await api('/api/staff/status');
    if (!estado.datos.autenticado) {
      textoFinal(t('entra'));
      el('verifIcono').textContent = '\uD83D\uDD12';
      if (typeof window.openLoginModal === 'function') {
        try { window.openLoginModal(); } catch (e) {}
      }
      return;
    }

    el('verifDatos').hidden = false;
    el('verifCuenta').textContent = estado.datos.usuario || '-';
    el('verifTexto').textContent = idioma() === 'en'
      ? 'Enter the code you got in game with /staffweb.'
      : 'Escribe el código que te ha dado /staffweb en el juego.';
    el('verifConfirmar').hidden = false;
    try { el('verifCodigo').focus(); } catch (e) {}
  }

  async function confirmar() {
    const codigo = String(el('verifCodigo').value || '').trim();
    if (!codigo) {
      el('verifTexto').textContent = idioma() === 'en' ? 'Type the code first.' : 'Escribe primero el código.';
      return;
    }
    const btnSi = el('verifSi');
    btnSi.disabled = true;
    btnSi.textContent = t('cargando');

    const r = await api('/api/staff/link', { method: 'POST', body: { codigo } });
    if (r.ok && r.datos.ok) {
      el('verifIcono').textContent = '\u2705';
      el('verifDatos').hidden = false;
      el('verifJugador').textContent = (r.datos.enlace && r.datos.enlace.mc_name) || '';
      textoFinal(r.datos.esAdmin ? t('ok') : t('no_entra'));
      el('verifPie').hidden = false;
      if (r.datos.esAdmin) el('verifPanel').hidden = false;
      return;
    }
    if (r.status === 401) {
      textoFinal(t('entra'));
      el('verifIcono').textContent = '\uD83D\uDD12';
      return;
    }
    el('verifIcono').textContent = '\u26D4';
    textoFinal((r.datos && (r.datos.message || r.datos.error)) || t('codigo_malo'));
  }


  function conectar() {
    if (el('verifSi')) el('verifSi').addEventListener('click', confirmar);
    if (el('verifNo')) el('verifNo').addEventListener('click', rechazar);
  }

  function arrancar() {
    conectar();
    iniciar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();