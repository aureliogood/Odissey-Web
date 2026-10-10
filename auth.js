// ===================================================================
// auth.js - acceso y registro de Odissey
//
// La cuenta de la web es propia: nombre de usuario, correo y contraseña.
// Discord pasa a ser opcional y se conecta desde el panel de la cuenta.
//
// Idea clave: este archivo guarda la sesión en las MISMAS claves de
// localStorage que usaba el login por Discord (odissey_discord_session y
// odissey_discord_user). Por eso los tickets, el carrito, los reportes y
// las calificaciones siguen funcionando sin tocar ni una de las páginas
// viejas, que ya leen de ahí.
// ===================================================================
(function () {
  'use strict';

  const API = window.API_BASE || 'https://odisseymc.site/bot';
  const CLAVE_TOKEN = 'odissey_discord_session';
  const CLAVE_USUARIO = 'odissey_discord_user';

  // ---------- sesión en el navegador ----------

  function guardarSesion(tkn, usuario) {
    try {
      localStorage.setItem(CLAVE_TOKEN, tkn);
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
    } catch (e) { /* modo privado */ }
  }

  function borrarSesion() {
    try {
      localStorage.removeItem(CLAVE_TOKEN);
      localStorage.removeItem(CLAVE_USUARIO);
    } catch (e) { /* nada */ }
  }

  function token() {
    try { return localStorage.getItem(CLAVE_TOKEN); } catch (e) { return null; }
  }

  function usuarioGuardado() {
    try {
      const u = JSON.parse(localStorage.getItem(CLAVE_USUARIO) || 'null');
      return u && u.id ? u : null;
    } catch (e) { return null; }
  }

  function guardarSoloToken(tkn) {
    try { localStorage.setItem(CLAVE_TOKEN, tkn); } catch (e) { /* nada */ }
  }

  // ---------- llamadas al servidor ----------

  async function api(ruta, opciones) {
    const o = opciones || {};
    const metodo = o.method || 'POST';
    const cuerpo = Object.assign({}, o.body || {});
    const conCuerpo = cuerpo && Object.keys(cuerpo).length > 0;

    let url = API + ruta;
    if (o.auth !== false && token()) {
      // En un GET no hay cuerpo: el token tiene que ir en la URL, que es
      // donde lo leen los endpoints. Si fuera en el cuerpo, el servidor lo
      // vería como una petición sin sesión y respondería 401.
      if (metodo === 'GET') url += (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token());
      else cuerpo.token = token();
    }

    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: conCuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    let datos = null;
    try { datos = await res.json(); } catch (e) { datos = null; }
    return { ok: res.ok, status: res.status, datos: datos };
  }

  // ---------- textos en español e inglés ----------
  // El sitio ya cambia de idioma con la bandera de arriba. Estos textos son
  // nuevos, así que no están en los diccionarios de cada página.

const T = {
    es: {
      pieSeguro: 'Tus datos se guardan en Odissey y no se comparten con nadie.',
      titulo: 'Entra en tu cuenta',
      sub: 'Usa tu nombre de usuario o tu correo.',
      tituloRegistro: 'Crea tu cuenta',
      subRegistro: 'Tarda menos de un minuto y no hace falta Discord.',
      usuario: 'Nombre de usuario o correo',
      clave: 'Contraseña',
      verClave: 'Mostrar contraseña',
      ocultarClave: 'Ocultar contraseña',
      entrar: 'Entrar',
      registro: 'Crear cuenta',
      crear: 'Crear cuenta y entrar',
      entrando: 'Entrando...',
      nuevoUsuario: 'Nombre de usuario',
      nuevoCorreo: 'Correo electrónico',
      nuevaClave: 'Contraseña',
      phUsuario: 'tu nombre de usuario',
      phClave: '',
      phNuevaClave: '',
      ayudaClave: 'Mínimo 12 caracteres, con mayúsculas, minúsculas, números y un símbolo.',
      conectar: 'Conectar Discord',
      desconectar: 'Desconectar Discord',
      conectado: 'conectado',
      opcional: 'Opcional, no hace falta',
      reintentar: 'Reintentar',
      creando: 'Creando cuenta...',
      verifica: 'Comprobación anti-robot',
      captchaPendiente: 'Espera un momento: todavía se está comprobando.',
      captchaCaido: 'No se ha podido comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.',
      sinConexion: 'Sin conexión. Comprueba tu internet e inténtalo otra vez.',
      /* Errores de campo. Cada uno dice qué pasó y cómo arreglarlo:
         un "error" a secas deja al usuario sin camino (regla error-clarity). */
      errUsuarioVacio: 'Escribe tu nombre de usuario o tu correo.',
      errClaveVacia: 'Escribe tu contraseña.',
      errClaveCorta: 'La contraseña necesita 12 caracteres o más.',
      errClaveSimple: 'Añade al menos una mayúscula, una minúscula, un número y un símbolo.',
      errUsuarioLargo: 'El nombre de usuario no puede pasar de 20 caracteres.',
      errCorreoVacio: 'Escribe tu correo electrónico.',
      errCorreoMalo: 'Ese correo no parece válido.',
      correoDuplicado: 'Ya hay una cuenta con ese correo.',
      usuarioDuplicado: 'Ese nombre de usuario ya está en uso.',
    },
    en: {
      pieSeguro: 'Your data stays on Odissey and is never shared.',
      titulo: 'Log in to your account',
      sub: 'Use your username or your email.',
      tituloRegistro: 'Create your account',
      subRegistro: 'It takes less than a minute and Discord is not needed.',
      usuario: 'Username or email',
      clave: 'Password',
      verClave: 'Show password',
      ocultarClave: 'Hide password',
      entrar: 'Log in',
      registro: 'Create account',
      crear: 'Create account and log in',
      entrando: 'Logging in...',
      nuevoUsuario: 'Username',
      nuevoCorreo: 'Email',
      nuevaClave: 'Password',
      phUsuario: 'your username',
      phClave: '',
      phNuevaClave: '',
      ayudaClave: 'At least 12 characters, with capitals, lowercase, numbers and a symbol.',
      conectar: 'Connect Discord',
      desconectar: 'Disconnect Discord',
      conectado: 'connected',
      opcional: 'Optional, not required',
      reintentar: 'Try again',
      creando: 'Creating account...',
      verifica: 'Anti-robot check',
      captchaPendiente: 'One moment: it is still being checked.',
      captchaCaido: 'We could not check that you are not a robot. Reload the page and try again.',
      sinConexion: 'No connection. Check your internet and try again.',
      errUsuarioVacio: 'Enter your username or email.',
      errClaveVacia: 'Enter your password.',
      errClaveCorta: 'The password needs 12 characters or more.',
      errClaveSimple: 'Add at least one capital, one lowercase, one number and one symbol.',
      errUsuarioLargo: 'The username cannot be longer than 20 characters.',
      errCorreoVacio: 'Enter your email address.',
      errCorreoMalo: 'That email does not look valid.',
      correoDuplicado: 'There is already an account with that email.',
      usuarioDuplicado: 'That username is already taken.',
    },
  };

  function idioma() {
    let guardada = null;
    try { guardada = localStorage.getItem('odissey_lang'); } catch (e) { guardada = null; }
    if (guardada === 'en' || guardada === 'es') return guardada;
    if (typeof window.getLang === 'function') {
      try {
        const l = window.getLang();
        if (l === 'en' || l === 'es') return l;
      } catch (e) { /* sigue con español */ }
    }
    return 'es';
  }

  function t(clave) {
    const pack = T[idioma()] || T.es;
    return pack[clave] !== undefined ? pack[clave] : (T.es[clave] || clave);
  }

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- formularios ----------
  // Los id son FIJOS (no dependen del idioma) porque el código los busca por
  // id al leer el valor. Una versión anterior los generaba a partir de la
  // etiqueta y se rompía al cambiar a inglés.

  const ICONO = {
    usuario: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 20a8 8 0 0 1 16 0"/>',
    correo: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 7 9 6 9-6"/>',
    clave: '<rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  };

  const OJOS = '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>';
  const OJOS_TACHADOS = '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/><path d="m3.5 3.5 17 17"/>';

/* Comprueba que una contrasena sea robusta. Devuelve '' si vale, o el
     texto del problema si no.
     Regla de seguridad 4.2: 12 caracteres o mas con mayusculas,
     minusculas, numeros y simbolos. Con menos, se rompe en dos
     semanas con una tabla precalculada. */
  function problemaClave(valor) {
    const c = String(valor || '');
    if (!c) return t('errClaveVacia');
    if (c.length < 12) return t('errClaveCorta');
    if (c.length > 128) return 'La contraseña es demasiado larga.';
    if (!/[a-z]/.test(c)) return 'La contraseña necesita al menos una minúscula.';
    if (!/[A-Z]/.test(c)) return 'La contraseña necesita al menos una mayúscula.';
    if (!/[0-9]/.test(c)) return 'La contraseña necesita al menos un número.';
    if (!/[^A-Za-z0-9]/.test(c)) return 'La contraseña necesita al menos un símbolo.';
    return '';
  }

  /* Un campo del formulario, montado con las reglas de la skill:
       - etiqueta visible (input-labels: nunca solo el placeholder),
       - icono decorativo con aria-hidden (icon-context),
       - error DEBAJO del campo y conectado con aria-describedby
         (error-placement), no solo arriba del formulario,
       - estado de error con aria-invalid para el lector de pantalla,
       - el boton de ver contrasena con nombre accesible que cambia
         (aria-label + aria-pressed, password-toggle).

     Los ids son FIJOS (no dependen del idioma) porque el codigo los
     busca para leer el valor, marcar el error y enfocar. */
  function campo(o) {
    const id = o.id;
    const errId = 'err-' + id;
    const ayudaId = o.ayuda ? 'ayuda-' + id : null;
    const descritos = [errId];
    if (ayudaId) descritos.push(ayudaId);

    let html = '<div class="auth-field">' +
      '<label class="auth-label" for="' + id + '">' + escapar(o.etiqueta) +
      (o.requerido === false ? ' <span class="auth-opcional">' + escapar(t('opcional')) + '</span>'
        : ' <span class="auth-requerido" aria-hidden="true">*</span>') +
      '</label>' +
      '<div class="auth-input-wrap">' +
      /* width/height van en el propio SVG, no solo en el CSS. Un <svg>
         sin medidas y con viewBox se estira hasta llenar el contenedor,
         y dentro de .auth-input-wrap eso es el ancho entero del campo:
         el icono se comia el campo y empujaba el texto fuera. Puestas
         aqui, el icono tiene su tamano aunque falte la hoja de estilos
         o el CSS todavia no haya cargado (icon-size). */
      '<svg class="auth-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' +
      o.icono + '</svg>' +
      '<input id="' + id + '" name="' + escapar(o.name || id) + '" ' +
      'type="' + o.tipo + '" class="auth-input" ' +
      'autocomplete="' + o.autocomplete + '" ' +
      /* type=email y inputmode=email hacen que el movil abra el teclado
         con la @ y el punto, no el teclado normal (input-type-keyboard). */
      (o.inputmode ? 'inputmode="' + o.inputmode + '" ' : '') +
      (o.patron ? 'pattern="' + escapar(o.patron) + '" ' : '') +
      (o.minlength ? 'minlength="' + o.minlength + '" ' : '') +
      (o.maxlength ? 'maxlength="' + o.maxlength + '" ' : '') +
      (o.requerido === false ? '' : 'required ') +
      /* aria-describedby apunta al error y, si hay, al texto de ayuda.
         Un lector de pantalla lee lo que hay debajo del campo al
         aterrizar en el, que es justo lo que se busca. */
      'aria-describedby="' + descritos.join(' ') + '" ' +
      (o.placeholder ? 'placeholder="' + escapar(o.placeholder) + '" ' : '') +
      (o.ayuda ? 'aria-invalid="false" ' : '') +
      (o.extra || '') + '>';

    if (o.tipo === 'password') {
      html +=
        '<button type="button" class="auth-ver" data-ver="' + id + '" ' +
        'aria-label="' + escapar(t('verClave')) + '" aria-pressed="false" ' +
        'title="' + escapar(t('verClave')) + '">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
        'focusable="false">' + OJOS + '</svg>' +
        '<svg class="auth-ver-tachado" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
        'aria-hidden="true" focusable="false">' +
        OJOS_TACHADOS + '</svg></button>';
    }

    html += '</div>';

    /* Texto de ayuda: persistente debajo del campo, no solo un
       placeholder que desaparece al escribir (input-helper-text). */
    if (o.ayuda) {
      html += '<p class="auth-ayuda" id="' + ayudaId + '">' + escapar(o.ayuda) + '</p>';
    }

    /* El error vive aqui, debajo de SU campo. Se pinta desde el
       JavaScript con mostrarErrorCampo(). Empieza oculto pero
       reservado: se le da min-height 0 y solo ocupa espacio cuando
       tiene texto, para que la pagina no salte al aparecer. */
    html +=
      '<p class="auth-error-campo" id="' + errId + '" role="alert" hidden>' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
      'focusable="false">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2v.1"/></svg>' +
      '<span></span></p>';

    html += '</div>';
    return html;
  }

  const ESCUDO = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>';
  const CHAT = '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.4A8.4 8.4 0 0 1 12 3.5a8.4 8.4 0 0 1 9 8Z"/>';

  // Antes aqui iba el logo de la web. Ahora es Steve en 3D, montado con cajas
  // CSS por js/dala-auth-steve.js: gira la cabeza y te sigue con la mirada
  // mientras escribes, y se tapa los ojos en el campo de contrasena.
  function cabeceraAuth() {
    /* En el login cabe el orbe liquido de js/dala-liquid.js, no Steve: los
       dos a la vez saturaban la cabecera. El Steve 3D sigue en su sitio en
       el modal de cuenta, que es donde aporta. */
    return '<div class="auth-cabecera auth-cabecera--liquid">' +
      '<div class="dala-liquid" data-liquid-root>' +
      '<div class="dala-liquid__orb">' +
      '<div class="dala-liquid__body"></div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }

  function pieAuth() {
    return '<p class="auth-pie">' +
'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
      'focusable="false">' + ESCUDO + '</svg>' +
      '<span>' + escapar(t('pieSeguro')) + '</span>' +
      '</p>';
  }

  function pestanas(activa) {
    return '<div class="auth-tabs" role="tablist">' +
      '<button type="button" role="tab" class="auth-tab' + (activa === 'acceso' ? ' is-activa' : '') +
      '" data-auth-view="acceso" aria-selected="' + (activa === 'acceso') + '">' +
      escapar(t('entrar')) + '</button>' +
      '<button type="button" role="tab" class="auth-tab' + (activa === 'registro' ? ' is-activa' : '') +
      '" data-auth-view="registro" aria-selected="' + (activa === 'registro') + '">' +
      escapar(t('registro')) + '</button>' +
      '</div>';
  }

/* ------------------------------------------------------------------
     LOGIN
     ------------------------------------------------------------------
     Una sola accion primaria (primary-action): "Entrar". Crear cuenta
     es secundaria y va en las pestanas de arriba, no competir como un
     boton mas.

     El error general (el que devuelve el servidor) va en su propia
     caja con role="alert", y los errores de campo van debajo de cada
     campo. No se mezclan: si el servidor dice "ese usuario no existe"
     y ademas hay un campo vacio, cada mensaje va a su sitio.
     ------------------------------------------------------------------ */
  function formularioAcceso() {
    return cabeceraAuth() + pestanas('acceso') +
      '<h2 class="auth-title" id="auth-titulo">' + escapar(t('titulo')) + '</h2>' +
      '<p class="auth-sub">' + escapar(t('sub')) + '</p>' +
      '<form id="authFormLogin" novalidate aria-labelledby="auth-titulo">' +
      campo({
        id: 'authLoginIdent', name: 'login', etiqueta: t('usuario'),
        tipo: 'text', autocomplete: 'username', icono: ICONO.usuario,
        placeholder: t('phUsuario'), maxlength: 254,
        extra: 'autocapitalize="none" spellcheck="false"',
      }) +
      campo({
        id: 'authLoginPass', name: 'password', etiqueta: t('clave'),
        tipo: 'password', autocomplete: 'current-password', icono: ICONO.clave,
        maxlength: 128,
      }) +
      '<div id="authErrorLogin" class="auth-error" role="alert" aria-live="assertive" hidden></div>' +
      huecoTurnstile('login') +
      botonEnviar('authFormLogin', t('entrar'), t('entrando')) +
      '</form>' + pieAuth();
  }

  /* ------------------------------------------------------------------
     CAPTCHA (Cloudflare Turnstile)
     ------------------------------------------------------------------
     Va justo antes del boton: si estuviera despues, el visitante
     pulsaria Enviar mientras el reto aun esta cargando.

     El <div> va vacio a proposito. Turnstile necesita un contenedor
     que este en el DOM y lo pinta el; si se rellena con texto o se
     deja en hidden, el script no encuentra sitio y falla sin avisar.

     hidden hasta que el script confirme que hay siteKey: si el captcha
     esta apagado (siteKey vacio), el hueco no debe verse. */
  function huecoTurnstile(accion) {
    return '<div class="auth-turnstile">' +
      '<div id="ts-' + accion + '" class="ts-widget" hidden ' +
      'data-accion="' + accion + '" ' +
      'aria-label="' + escapar(t('verifica')) + '"></div>' +
      '</div>';
  }

  /* Pinta el reto y avisa de que se esta cargando. Si esta apagado no
     hace nada y el formulario sigue funcionando sin captcha. */
  function montarTurnstile(accion) {
    if (!window.OdisseyTurnstile || !window.OdisseyTurnstile.disponible()) return;
    var caja = document.getElementById('ts-' + accion);
    if (!caja) return;
    caja.hidden = false;
    window.OdisseyTurnstile.montar(caja, accion).catch(function () {
      // El error ya se ha escrito debajo del widget.
      caja.dataset.fallido = '1';
    });
  }

  /* ------------------------------------------------------------------
     REGISTRO
     ------------------------------------------------------------------
     La ayuda de la contrasena va DEBAJO del campo y dice las reglas
     exactas, no "minimo 8 caracteres": si el requisito no se ve, el
     usuario lo descubre cuando le rechazan el registro.
     ------------------------------------------------------------------ */
  function formularioRegistro() {
    return cabeceraAuth() + pestanas('registro') +
      '<h2 class="auth-title" id="auth-titulo">' + escapar(t('tituloRegistro')) + '</h2>' +
      '<p class="auth-sub">' + escapar(t('subRegistro')) + '</p>' +
      '<form id="authFormRegistro" novalidate aria-labelledby="auth-titulo">' +
      campo({
        id: 'authRegUser', name: 'username', etiqueta: t('nuevoUsuario'),
        tipo: 'text', autocomplete: 'username', icono: ICONO.usuario,
        placeholder: t('phUsuario'), maxlength: 20,
        patron: '[A-Za-z0-9_]{3,20}',
        extra: 'autocapitalize="none" spellcheck="false"',
      }) +
      campo({
        id: 'authRegMail', name: 'email', etiqueta: t('nuevoCorreo'),
        tipo: 'email', autocomplete: 'email', inputmode: 'email',
        icono: ICONO.correo, maxlength: 254,
        patron: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+',
        placeholder: 'tu@correo.com',
        extra: 'autocapitalize="none" spellcheck="false"',
      }) +
      campo({
        id: 'authRegPass', name: 'password', etiqueta: t('nuevaClave'),
        tipo: 'password', autocomplete: 'new-password', icono: ICONO.clave,
        minlength: 12, maxlength: 128,
        ayuda: t('ayudaClave'),
      }) +
      '<div id="authErrorRegistro" class="auth-error" role="alert" aria-live="assertive" hidden></div>' +
      huecoTurnstile('registro') +
      botonEnviar('authFormRegistro', t('crear'), t('creando')) +
      '</form>' + pieAuth();
  }

  /* El boton de envio. Unico punto donde se construye, para que los
     dos formularios sean iguales. El icono de carga se pinta desde el
     JavaScript (submit-feedback: estado de carga, no un boton que
     parece muerto). */
  function botonEnviar(idForm, texto, textoCargando) {
    return '<button type="submit" class="auth-boton" data-form="' + idForm + '" ' +
      'data-texto="' + escapar(texto) + '" data-cargando="' + escapar(textoCargando) + '">' +
      '<span class="auth-boton__texto">' + escapar(texto) + '</span>' +
      '<span class="auth-boton__carga" aria-hidden="true"></span>' +
      '</button>';
  }

function mostrarVista(vista) {
    const loginView = document.getElementById('loginView');
    if (!loginView) return;
    loginView.innerHTML = vista === 'registro' ? formularioRegistro() : formularioAcceso();
    /* El captcha se monta cada vez que se dibuja el formulario. El
       innerHTML anterior se ha borrado con su widget, asi que no se
       puede reutilizar: Turnstile deja de reconocerlo y el envio se
       quedaria sin token para siempre.
       resetTodo() antes limpia los widgets vivos para que no se queden
       colgando los de la vista anterior. */
    if (window.OdisseyTurnstile) {
      window.OdisseyTurnstile.resetTodo();
      montarTurnstile(vista === 'registro' ? 'registro' : 'login');
    }
    /* Al reescribir el innerHTML desaparece el orbe liquido que estaba
       dentro. Sin esto, al pasar a "Crear cuenta" se quedaba quieto
       para siempre: el JS de la burbuja creia que ya estaba montado y
       no volvia a construirlo. */
    if (window.DalaLiquid) window.DalaLiquid.montar();
    /* Se engancha la validacion en el blur de los campos nuevos. Se
       hace cada vez que se dibuja un formulario y no una sola vez al
       cargar, porque el innerHTML anterior ha desaparecido con sus
       listeners. Sin esto, la validacion solo funcionaria la primera
       vez que se abre el login. */
    engancharValidacion(loginView);
    const primero = loginView.querySelector('input');
    if (primero) setTimeout(() => primero.focus(), 60);
  }

  /* ------------------------------------------------------------------
     ERRORES POR CAMPO
     ------------------------------------------------------------------
     La regla error-placement dice que cada campo invalido lleva su
     error DEBAJO y conectado con aria-describedby. Esta funcion
     hace las dos cosas: pinta el texto y marca el campo con
     aria-invalid para que el lector de pantalla sepa que algo va mal.

     El mensaje se escribe en el <span> de dentro, nunca en el
     <p> entero: el icono del error es decorativo y si se metiera
     texto en el <p> el lector leeria el icono tambien.
     ------------------------------------------------------------------ */
  function mostrarErrorCampo(idCampo, mensaje) {
    const campo = document.getElementById(idCampo);
    const caja = document.getElementById('err-' + idCampo);
    if (!campo || !caja) return;

    const span = caja.querySelector('span');
    if (mensaje) {
      if (span) span.textContent = mensaje;
      caja.removeAttribute('hidden');
      // aria-invalid es lo que hace que VoiceOver diga "inválido" al
      // llegar al campo.
      campo.setAttribute('aria-invalid', 'true');
    } else {
      if (span) span.textContent = '';
      caja.setAttribute('hidden', '');
      campo.setAttribute('aria-invalid', 'false');
    }
  }

  /* Quita el error de todos los campos de un formulario. Se llama al
     empezar a enviar, para que un reintento no arrastre el error
     viejo. */
  function limpiarErrores(form) {
    if (!form) return;
    form.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
      el.setAttribute('aria-invalid', 'false');
    });
    form.querySelectorAll('.auth-error-campo').forEach((el) => {
      el.setAttribute('hidden', '');
      const s = el.querySelector('span');
      if (s) s.textContent = '';
    });
  }

  /* ------------------------------------------------------------------
     VALIDACION EN BLUR (inline-validation)
     ------------------------------------------------------------------
     Se valida al salir del campo, no con cada tecla. Validar mientras
     se escribe marca error en rojo antes de que el usuario haya
     terminado, que se lee como "lo estas haciendo mal".

     Devuelve '' si el campo vale, o el mensaje del problema.
     ------------------------------------------------------------------ */
  function validarCampo(idCampo) {
    const el = document.getElementById(idCampo);
    if (!el) return '';
    const v = el.value;

    switch (idCampo) {
      case 'authLoginIdent':
        if (!v.trim()) return t('errUsuarioVacio');
        return '';
      case 'authLoginPass':
        if (!v) return t('errClaveVacia');
        return '';
      case 'authRegUser':
        if (!v.trim()) return t('errUsuarioVacio');
        if (v.length > 20) return t('errUsuarioLargo');
        if (!/^[A-Za-z0-9_]{3,20}$/.test(v)) {
          return 'Solo letras, números y guion bajo, de 3 a 20 caracteres.';
        }
        return '';
      case 'authRegMail':
        if (!v.trim()) return t('errCorreoVacio');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return t('errCorreoMalo');
        return '';
      case 'authRegPass':
        return problemaClave(v);
      default:
        return '';
    }
  }

  /* Engancha el blur y la correccion en cuanto se escribe. Se
     listeners de por vida de la pagina, asi que se comprueba que no
     haya otros antes de añadir los nuevos. */
  function engancharValidacion(raiz) {
    if (!raiz) return;
    raiz.querySelectorAll('.auth-input').forEach((input) => {
      const id = input.id;
      if (input.dataset.validado === '1') return;
      input.dataset.validado = '1';

      /* Al salir del campo se comprueba. */
      input.addEventListener('blur', () => {
        // Si esta vacio y nunca se escribio nada, no se molesta: es
        // el estado inicial de un formulario, no un error.
        if (!input.value) { mostrarErrorCampo(id, ''); return; }
        mostrarErrorCampo(id, validarCampo(id));
      });

      /* Al escribir se corrige el error anterior: si ya se aviso de
         algo y el usuario lo arregla, el aviso desaparece al
         instante. Sin esto el error rojo se queda mientras ya esta
         bien, que es peor que no avisar. */
      input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') === 'true') {
          mostrarErrorCampo(id, validarCampo(id));
        }
      });
    });
  }

  /* ------------------------------------------------------------------
     BOTON DE ENVIO (submit-feedback)
     ------------------------------------------------------------------
     Mientras se espera, el boton se desactiva y ensena un estado de
     carga. Un boton que no cambia nada mientras el servidor tarda dos
     segundos hace pensar que no se ha pulsado.

     El spinner es un elemento con aria-hidden: el texto del boton
     cambia a "Entrando..." y es eso que anuncia el lector de
     pantalla, no un icono sin nombre.
     ------------------------------------------------------------------ */
  function estadoBoton(boton, cargando) {
    if (!boton) return;
    const texto = boton.querySelector('.auth-boton__texto');
    if (cargando) {
      boton.disabled = true;
      boton.setAttribute('aria-busy', 'true');
      boton.classList.add('es-cargando');
      if (texto) texto.textContent = boton.getAttribute('data-cargando') || '';
    } else {
      boton.disabled = false;
      boton.removeAttribute('aria-busy');
      boton.classList.remove('es-cargando');
      if (texto) texto.textContent = boton.getAttribute('data-texto') || '';
    }
  }

  function mostrarError(id, mensaje) {
    const caja = document.getElementById(id);
    if (!caja) return;
    caja.textContent = mensaje || '';
    // Se usa el atributo hidden y no la clase .hidden de Tailwind: la clase la
    // gana por orden de carga cualquier regla que ponga display, y el recuadro
    // se veía vacío. Con el atributo no hay manera de que salga sin texto.
    if (mensaje) caja.removeAttribute('hidden');
    else caja.setAttribute('hidden', '');
  }

  // Traduce la respuesta del servidor a algo que se pueda entender. Antes de
  // esto solo se veía "No se pudo crear la cuenta", que no dice nada: si el
  // servidor no tiene la ruta (porque la web se ha subido antes que el bot)
  // la respuesta es un 404 y el mensaje genérico esconde el problema real.
  function mensajeDeError(r, accion) {
    if (r && r.datos && r.datos.message) return r.datos.message;
    if (r && r.status === 404) {
      return 'La web está más actualizada que el servidor. Hay que subir los archivos del bot (web.js y database.js) y reiniciarlo.';
    }
    if (r && r.status === 405) {
      return 'El servidor no entiende esta operación. Puede que el bot esté sin reiniciar.';
    }
    if (r && r.status === 429) {
      return 'Demasiados intentos. Espera unos minutos antes de volver a probar.';
    }
    if (r && r.status === 0) {
      return 'No se pudo contactar con el servidor.';
    }
    if (r && r.datos && r.datos.error === 'not_found') {
      return 'La web está más actualizada que el servidor. Hay que subir los archivos del bot (web.js y database.js) y reiniciarlo.';
    }
    return 'No se pudo ' + accion + ' (error ' + (r ? r.status : '?') + ').';
  }

  function valor(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

// ---------- entrar y registrarse ----------

  /* El error general del servidor. Si el mensaje dice que un campo no
     esta bien (correo repetido, contraseña corta), se marca ADEMAS el
     campo correspondiente: el mensaje arriba solo no deja al usuario
     saber cual de los tres campos es (error-placement). */
  const ERRORES_DE_CAMPO = [
    { id: 'authRegUser', claves: ['username_taken', 'usuario_duplicado', 'nombre_usuario'] },
    { id: 'authRegMail', claves: ['email_taken', 'correo_duplicado', 'correo'] },
    { id: 'authRegPass', claves: ['password', 'contrasena', 'clave'] },
    { id: 'authLoginIdent', claves: ['credentials', 'credenciales', 'usuario'] },
  ];

  function marcarCampoDelError(mensaje) {
    if (!mensaje) return;
    const m = String(mensaje).toLowerCase();
    for (const e of ERRORES_DE_CAMPO) {
      if (e.claves.some((k) => m.indexOf(k) !== -1)) {
        mostrarErrorCampo(e.id, mensaje);
        return;
      }
    }
  }

  /* ------------------------------------------------------------------
     ENVIOS CON CAPTCHA
     ------------------------------------------------------------------
     Se comprueba ANTES de llamar a la API. Si faltara el token, el
     servidor lo rechazaria igual, pero habria hecho un viaje de ida y
     vuelta para nada y el visitante veria un error seco de servidor en
     vez de un mensaje que dice que falta.

     Si el captcha esta apagado (sin siteKey), esta funcion devuelve
     true y no manda token: el sitio sigue funcionando.

     Si esta ENCENDIDO pero todavia no hay token, devuelve false. No se
     manda "si no hay token, envio igual": eso seria abrir la puerta por
     un fallo de carga del script. */
  function comprobarTurnstile(accion) {
    var T = window.OdisseyTurnstile;
    if (!T || !T.disponible()) return true;

    var tok = T.token();
    if (tok) return true;

    /* Si el reto ya ha fallado (Cloudflare caido, dominio sin
       permitido, bloqueador), el mensaje NO puede ser "espera un
       momento": el visitante se quedaria esperando algo que no va a
       llegar nunca. Se le dice que recargue. */
    var caja = document.getElementById('ts-' + accion);
    var caido = (caja && caja.dataset.fallido === '1') || T.fallido();
    mostrarError('authError' + (accion === 'login' ? 'Login' : 'Registro'),
      t(caido ? 'captchaCaido' : 'captchaPendiente'));
    return false;
  }

  function tokenTurnstile() {
    var T = window.OdisseyTurnstile;
    if (!T || !T.disponible()) return null;
    return T.token() || null;
  }

  async function entrar(ev) {
    ev.preventDefault();
    const form = ev.target;
    const boton = form.querySelector('button[type=submit]');

    mostrarError('authErrorLogin', '');
    limpiarErrores(form);

    /* Se validan todos los campos antes de pedir nada al servidor. Si
       uno esta mal se avisa debajo de ese campo y se enfoca, para que
       el teclado no se vaya al campo equivocado (focus-management:
       sin resumen de errores, al primer campo invalido). */
    const campos = ['authLoginIdent', 'authLoginPass'];
    let primeroMalo = null;
    for (const id of campos) {
      const problema = validarCampo(id);
      mostrarErrorCampo(id, problema);
      if (problema && !primeroMalo) primeroMalo = id;
    }
    if (primeroMalo) {
      const el = document.getElementById(primeroMalo);
      if (el) el.focus();
      return;
    }

    estadoBoton(boton, true);
    if (!comprobarTurnstile('login')) {
      estadoBoton(boton, false);
      return;
    }
    const cuerpo = { login: valor('authLoginIdent').trim(), password: valor('authLoginPass') };
    const tok = tokenTurnstile();
    if (tok) cuerpo.turnstile_token = tok;
    const r = await api('/api/auth/login', { body: cuerpo });
    estadoBoton(boton, false);

    if (!r.ok) {
      const mensaje = mensajeDeError(r, 'entrar');
      mostrarError('authErrorLogin', mensaje);
      marcarCampoDelError(mensaje);
      /* Si el problema es la contraseña, se enfoca ese campo: es casi
         siempre un error de tecleo y es donde hay que corregir. */
      const idFoco = (r.status === 401) ? 'authLoginPass' : 'authLoginIdent';
      const el = document.getElementById(idFoco);
      if (el) el.focus();
      return;
    }
    guardarSesion(r.datos.token, r.datos.user);
    trasCambiarSesion(true);
  }

  async function registrar(ev) {
    ev.preventDefault();
    const form = ev.target;
    const boton = form.querySelector('button[type=submit]');

    mostrarError('authErrorRegistro', '');
    limpiarErrores(form);

    const campos = ['authRegUser', 'authRegMail', 'authRegPass'];
    let primeroMalo = null;
    for (const id of campos) {
      const problema = validarCampo(id);
      mostrarErrorCampo(id, problema);
      if (problema && !primeroMalo) primeroMalo = id;
    }
    if (primeroMalo) {
      const el = document.getElementById(primeroMalo);
      if (el) el.focus();
      return;
    }

    estadoBoton(boton, true);
    if (!comprobarTurnstile('registro')) {
      estadoBoton(boton, false);
      return;
    }
    const cuerpo = {
      username: valor('authRegUser').trim(),
      email: valor('authRegMail').trim(),
      password: valor('authRegPass'),
    };
    const tok = tokenTurnstile();
    if (tok) cuerpo.turnstile_token = tok;
    const r = await api('/api/auth/register', { body: cuerpo });
    estadoBoton(boton, false);

    if (!r.ok) {
      const mensaje = mensajeDeError(r, 'crear la cuenta');
      mostrarError('authErrorRegistro', mensaje);
      marcarCampoDelError(mensaje);
      return;
    }
    guardarSesion(r.datos.token, r.datos.user);
    trasCambiarSesion(true);
  }

// Tras entrar o salir: actualiza la cabecera y, si acabamos de entrar, lleva
// al perfil. Antes se abria el panel de cuenta aqui, pero eso ya no se usa:
// el perfil es una pagina y ese panel queda solo para el carrito.
function trasCambiarSesion(acabasDeEntrar) {
    try {
      if (typeof window.updateNavButton === 'function') window.updateNavButton();
      if (typeof window.closeLoginModal === 'function') window.closeLoginModal();
    } catch (e) { /* nada */ }

    if (acabasDeEntrar) {
      // Un pequeño retardo para que el usuario vea como cambia la cabecera.
      setTimeout(() => { window.location.href = 'perfil.html'; }, 220);
      return;
    }

    // Al salir, si estabamos en el perfil hay que recargar para que salga el
    // aviso de "necesitas una cuenta".
    if (/(^|\/)perfil\.html$/.test(window.location.pathname)) {
      setTimeout(() => window.location.reload(), 220);
    }
  }

  async function salir() {
    try { await api('/api/auth/logout', { body: {} }); } catch (e) { /* nada */ }
    borrarSesion();
    try {
      if (typeof window.updateNavButton === 'function') window.updateNavButton();
    } catch (e) { /* nada */ }
    // Si estamos en el perfil, se recarga para que aparezca el aviso de que
    // hace falta entrar. En el resto de páginas no se molesta al usuario.
    if (/(^|\/)perfil\.html$/.test(window.location.pathname)) {
      window.location.reload();
      return;
    }
    try {
      if (typeof window.openLoginModal === 'function') window.openLoginModal();
    } catch (e) { /* nada */ }
  }

  // ---------- Discord opcional ----------

  function conectarDiscord() {
    // El login dejó una cookie de sesión, así que el servidor sabe a qué
    // cuenta engancharle el Discord al volver de Discord.
    window.location.href = API + '/discord/login?intention=link';
  }

  async function desconectarDiscord() {
    const r = await api('/api/auth/discord/unlink', { body: {} });
    if (r.ok && r.datos && r.datos.user) {
      guardarSesion(token(), r.datos.user);
      try {
        if (typeof window.updateNavButton === 'function') window.updateNavButton();
        if (typeof window.openLoginModal === 'function') window.openLoginModal();
      } catch (e) { /* nada */ }
      inyectarPanelDiscord();
    }
  }

  function hayDiscord() {
    const u = usuarioGuardado();
    return !!(u && u.discord && u.discord.linked);
  }

  function inyectarPanelDiscord() {
    // El ajuste de Discord vive ahora en la página de perfil, así que aquí no
    // se toca el panel de cuenta. Se deja la función por si hiciera falta.
    return;
}

  // Las fotos del perfil se guardan en el bot como "/uploads/nombre.png". Se
  // piden a través de la API para que funcionen sin depender de cómo el
  // hosting tenga montada la carpeta de archivos.
  function rutaImagen(valor) {
    if (!valor) return null;
    if (/^https?:\/\//i.test(valor)) return valor;
    return API + (valor.charAt(0) === '/' ? valor : '/' + valor);
  }

  // La cabecera: con foto de Discord, la foto; sin ella, el nombre.
  //
  // Sustituye a la updateNavButton() de cada página porque aquella, cuando no
  // hay avatar, se inventa uno por defecto de Discord y lo pone en vez del
  // nombre. Con una cuenta de la web (id "web:...") ese avatar no significa
  // nada, así que aquí se muestra directamente el nombre de usuario.
  function actualizarBotonNav() {
    const u = usuarioGuardado();
    const txt = document.getElementById('enterNavText');
    const img = document.getElementById('enterNavAvatar');
    const btn = document.getElementById('enterNavBtn');
    if (!btn) return;

    if (!u) {
      if (txt) { txt.classList.remove('hidden'); txt.textContent = idioma() === 'en' ? 'Log in' : 'Entrar'; }
      if (img) { img.classList.add('hidden'); img.removeAttribute('src'); }
      btn.classList.remove('nav-button--avatar');
      btn.removeAttribute('title');
      return;
    }

    const nombre = u.username || '';
    const avatarUrl = rutaImagen(u.avatar);
    if (img && avatarUrl) {
      img.onerror = function () {
        img.onerror = null;
        img.classList.add('hidden');
        if (txt) { txt.classList.remove('hidden'); txt.textContent = nombre; }
        btn.classList.remove('nav-button--avatar');
      };
      img.src = avatarUrl;
      img.alt = nombre;
      img.classList.remove('hidden');
      if (txt) txt.classList.add('hidden');
      btn.classList.add('nav-button--avatar');
    } else {
      if (img) { img.classList.add('hidden'); img.removeAttribute('src'); }
      if (txt) { txt.classList.remove('hidden'); txt.textContent = nombre; }
      btn.classList.remove('nav-button--avatar');
    }
    btn.title = nombre;
  }

  // El botón de la cabecera deja de abrir el panel: si hay sesión, lleva a la
// página de perfil, que es donde se cambia todo. Sin sesión, abre el login.
//
// Se anula el onclick que traía la página en línea y se pone el nuestro:
// así el botón del carrito sigue abriendo el panel normal, que es otra cosa.
function conectarBotonPerfil() {
    const btn = document.getElementById('enterNavBtn');
    if (!btn || btn.dataset.perfilListo === '1') return;
    btn.dataset.perfilListo = '1';
    btn.removeAttribute('onclick');
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (usuarioGuardado()) window.location.href = 'perfil.html';
      else if (typeof window.openLoginModal === 'function') window.openLoginModal();
    });
  }

  // ---------- arranque ----------

  function devolverSesionDeDiscord() {
    // Al volver de conectar Discord, el servidor pasa el token en la URL.
    const params = new URLSearchParams(window.location.search);
    const nuevo = params.get('discord_linked');
    if (nuevo) {
      guardarSoloToken(nuevo);
      window.location.replace(window.location.pathname);
      return true;
    }
    if (params.get('discord_error')) {
      window.location.replace(window.location.pathname);
      return true;
    }
    return false;
  }

  function comprobarSesion() {
    if (!token()) return;
    api('/api/auth/me', { method: 'GET' }).then((r) => {
      if (!r.ok || !r.datos || !r.datos.user) {
        // La sesión caducó o se cerró en otro sitio.
        borrarSesion();
        try { if (typeof window.updateNavButton === 'function') window.updateNavButton(); } catch (e) { /* nada */ }
        return;
      }
      guardarSesion(token(), r.datos.user);
      inyectarPanelDiscord();
    }).catch(() => { /* sin red: se mantiene lo que había */ });
  }

function alCargar() {
    // Los formularios sustituyen al botón de Discord que había antes.
    const loginView = document.getElementById('loginView');
    if (loginView) {
      loginView.innerHTML = formularioAcceso();
      // La validación en el blur se engancha también en el primer
      // render, no solo al cambiar de pestaña.
      engancharValidacion(loginView);
      montarTurnstile('login');
    }

    // Delegación: los formularios y los botones de alternar se atienden con un
    // solo listener, para no tener que reenganchar nada al re-renderizar.
    document.addEventListener('submit', (ev) => {
      const id = ev.target && ev.target.id;
      if (id === 'authFormLogin') entrar(ev);
      else if (id === 'authFormRegistro') registrar(ev);
    });
    document.addEventListener('click', (ev) => {
      const b = ev.target && ev.target.closest ? ev.target.closest('[data-auth-view]') : null;
      if (b) {
        ev.preventDefault();
        mostrarVista(b.getAttribute('data-auth-view'));
        return;
      }
      // Mostrar u ocultar la contraseña
      const ver = ev.target && ev.target.closest ? ev.target.closest('[data-ver]') : null;
      if (ver) {
        ev.preventDefault();
        const input = document.getElementById(ver.getAttribute('data-ver'));
        if (!input) return;
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        ver.classList.toggle('ver-activo', !visible);
        /* aria-pressed dice si el boton esta pulsado, y el nombre
           accesible cambia entre "mostrar" y "ocultar". Sin esto, un
           lector de pantalla anuncia siempre "Mostrar contrasena" y
           no dice en que estado esta el campo. */
        ver.setAttribute('aria-pressed', visible ? 'false' : 'true');
        const nuevoNombre = visible ? t('verClave') : t('ocultarClave');
        ver.setAttribute('aria-label', nuevoNombre);
        ver.setAttribute('title', nuevoNombre);
      }
    });

    // Estas páginas definen las suyas en un script en línea. Como este
    // script va después, la última definición que se ejecuta gana.
    window.handleLogout = salir;
    window.startDiscordLogin = conectarDiscord;
    window.updateNavButton = actualizarBotonNav;
    actualizarBotonNav();
    conectarBotonPerfil();

    // El cambio de idioma lo hace el botón de la bandera, que está fuera de
    // este archivo. Se escucha ese clic para repintar nuestros textos, que
    // no viven en el diccionario de cada página.
    document.addEventListener('click', (ev) => {
      const b = ev.target && ev.target.closest ? ev.target.closest('#langBtn') : null;
      if (!b) return;
      setTimeout(() => {
        const lv = document.getElementById('loginView');
        if (lv && !lv.classList.contains('hidden')) {
          const vista = lv.querySelector('#authFormRegistro') ? 'registro' : 'acceso';
          mostrarVista(vista);
        }
        inyectarPanelDiscord();
      }, 60);
    }, true);

    if (!devolverSesionDeDiscord()) {
      comprobarSesion();
      inyectarPanelDiscord();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', alCargar);
  } else {
    alCargar();
  }

  window.OdisseyAuth = {
    entrar: entrar,
    registrar: registrar,
    salir: salir,
    conectarDiscord: conectarDiscord,
    desconectarDiscord: desconectarDiscord,
    usuario: usuarioGuardado,
    token: token,
    mostrarVista: mostrarVista,
  };
})();