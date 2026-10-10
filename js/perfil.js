// ===================================================================
// perfil.js - la pagina de perfil del jugador
//
// Carga la cuenta, la pinta y deja editarla: nombre, bio, nombre de
// Minecraft, color, foto y banner. Correo, contraseña y Discord también,
// que están en la misma pagina para no tener que buscarlos.
//
// La sesion la pone auth.js (que va antes en la pagina); aqui se usa lo que
// dejo guardado en localStorage.
// ===================================================================
(function () {
  'use strict';

  const API = window.API_BASE || 'https://odisseymc.site/bot';
  const MAX_IMG = 10 * 1024 * 1024;
  const TIPOS_OK = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/avif'];
  const EXT_OK = ['png', 'jpg', 'gif', 'webp', 'avif'];

  const T = {
    es: {
      desde: 'En Odissey desde',
      cambiosGuardados: 'Cambios guardados.',
      colorGuardado: 'Color guardado.',
      cambiosSinGuardar: 'Tienes cambios sin guardar.',
      guardando: 'Guardando…',
      sinGuardar: 'No hay nada que guardar.',
      errorGuardar: 'No se pudo guardar.',
      errorSubir: 'No se pudo subir la imagen.',
      pesoImagen: 'La imagen es demasiado pesada (máximo 10 MB).',
      tipoImagen: 'Solo PNG, JPG, GIF, WEBP o AVIF. Si es una foto de iPhone (HEIC), abre la foto y vuelve a guardarla como JPG.',
      passActual: 'Tu contraseña actual',
      passNueva: 'La contraseña nueva (mínimo 8)',
      passMal: 'La contraseña actual no es correcta.',
      passCambiada: 'Contraseña cambiada. Se cerraron tus otras sesiones.',
      passCorta: 'La nueva necesita al menos 8 caracteres.',
      correoCambiado: 'Correo actualizado.',
      correoMal: 'Ese correo no es válido.',
      correoUsado: 'Ese correo ya está en uso.',
      idPerfil: 'perfil',
    },
    en: {
      desde: 'On Odissey since',
      cambiosGuardados: 'Changes saved.',
      colorGuardado: 'Colour saved.',
      cambiosSinGuardar: 'You have unsaved changes.',
      guardando: 'Saving…',
      sinGuardar: 'Nothing to save.',
      errorGuardar: 'Could not save.',
      errorSubir: 'Could not upload the image.',
      passActual: 'Your current password',
      passNueva: 'New password (at least 8)',
      passMal: 'Your current password is not correct.',
      passCambiada: 'Password changed. Your other sessions were closed.',
      passCorta: 'The new one needs at least 8 characters.',
      correoCambiado: 'Email updated.',
      correoMal: 'That email is not valid.',
      correoUsado: 'That email is already in use.',
      idPerfil: 'profile',
    },
  };

  function idioma() {
    let g = null;
    try { g = localStorage.getItem('odissey_lang'); } catch (e) { g = null; }
    if (g === 'en' || g === 'es') return g;
    if (typeof window.getLang === 'function') {
      try {
        const l = window.getLang();
        if (l === 'en' || l === 'es') return l;
      } catch (e) { /* sigue con español */ }
    }
    return 'es';
  }

  function t(k) {
    const p = T[idioma()] || T.es;
    return p[k] !== undefined ? p[k] : (T.es[k] || k);
  }

  function el(id) { return document.getElementById(id); }

  // Las fotos se guardan en el bot como "/uploads/nombre.png". Para que
  // funcionen siempre, se piden a través de la API en vez de a la carpeta
  // de la web: el bot sirve /uploads y así no depende de cómo el hosting
  // tenga montado el directorio público.
// Las fotos de perfil las sirve el servidor en /uploads/... de la RAIZ del
    // dominio, no debajo de /bot: ahi devolvia 404 y el avatar salia vacio.
    const RAIZ_API = API.replace(/\/bot\/?$/, '');

    // Los avatares que quedaron guardados de cuando las cuentas se vinculaban con
    // Discord son imagenes de cdn.discordapp.com. Como el login con Discord ya
    // no existe, no se muestran en ningun sitio: se usa el avatar con la
    // inicial. No se borra nada de la base de datos, solo se deja de pintar.
    function esAvatarDeDiscord(valor) {
      const v = String(valor || '');
      return /(^|\/\/)(cdn\.)?(discordapp|discord)\.com/i.test(v) || /mc-heads\.net/i.test(v);
    }

    function rutaImagen(valor) {
      if (!valor) return null;
      if (esAvatarDeDiscord(valor)) return null;
      const v = String(valor);
      if (/^https?:\/\//i.test(v)) {
        const ruta = v.replace(/^https?:\/\/[^/]+/i, '');
        // Si apunta a /uploads/ es una foto nuestra y puede venir guardada con
        // el dominio de produccion: se queda solo con la ruta para que siga
        // funcionando en local o si el dominio cambia.
        if (ruta.indexOf('/uploads/') !== -1) return RAIZ_API + ruta.replace(/^\/bot/, '');
        // Avatar de Discord u otra imagen externa: se deja tal cual.
        return v;
      }
      return RAIZ_API + (v.charAt(0) === '/' ? v : '/' + v);
    }

  // La pagina sale de la wiki, que no trae diccionario de idiomas, asi que
  // los textos se traducen aqui. Se aplican al arrancar y cuando se cambia
  // el idioma con la bandera de la cabecera.
  const TRAD = {
    es: {
      nav_perfil: 'Perfil',
      perfil_banner_vacio: 'Sin banner',
      perfil_necesitas_cuenta: 'Necesitas una cuenta',
      perfil_necesitas_cuenta_sub: 'Entra o crea tu cuenta para ver y editar tu perfil.',
      perfil_entrar_o_crear: 'Entrar o crear cuenta',
      perfil_apariencia: 'Apariencia',
      perfil_apariencia_sub: 'La foto y el banner se cambian arriba, en la cabecera de tu perfil.',
      perfil_cambiar: 'Cambiar',
      perfil_color: 'Color de acento',
      perfil_color_sub: 'Se usa en tu nombre y en tu perfil.',
      perfil_azar: 'Al azar',
      perfil_datos: 'Tus datos',
      perfil_datos_sub: 'Esto es lo que ven los demás en tu perfil.',
      perfil_usuario: 'Nombre de usuario',
      perfil_bio: 'Sobre ti',
      perfil_mc: 'Nombre de Minecraft',
      perfil_mc_sub: 'Se usa para entregarte las compras que hagas en la tienda.',
      perfil_cuenta: 'Tu cuenta',
      perfil_cuenta_sub: 'Correo y contraseña.',
      perfil_correo: 'Correo electrónico',
      perfil_cambiar_correo: 'Cambiar correo',
      perfil_clave_titulo: 'Contraseña',
      perfil_clave_sub: 'Cámbiala si crees que alguien la sabe.',
      perfil_cambiar_clave: 'Cambiar contraseña',
      perfil_guardar: 'Guardar cambios',
      perfil_estado_inicial: 'Los cambios se guardan aquí.',
      perfil_guardar_boton: 'Guardar cambios',
      perfil_descartar: 'Descartar',
      perfil_salir: 'Cerrar sesión',
      perfil_salir_boton: 'Salir',
      perfil_salir_sub: 'Sales de este navegador y tendrás que volver a entrar.',
      jugador: 'Jugador',
      cambiar_foto: 'Cambiar foto',
    },
    en: {
      nav_perfil: 'Profile',
      perfil_necesitas_cuenta: 'You need an account',
      perfil_necesitas_cuenta_sub: 'Log in or create an account to see and edit your profile.',
      perfil_entrar_o_crear: 'Log in or create account',
      perfil_apariencia: 'Appearance',
      perfil_apariencia_sub: 'Your photo and banner are changed above, in your profile header.',
      perfil_banner_vacio: 'No banner',
      perfil_cambiar: 'Change',
      perfil_color: 'Accent colour',
      perfil_color_sub: 'Used on your name and your profile.',
      perfil_azar: 'Random',
      perfil_datos: 'Your details',
      perfil_datos_sub: 'This is what others see on your profile.',
      perfil_usuario: 'Username',
      perfil_bio: 'About you',
      perfil_mc: 'Minecraft name',
      perfil_mc_sub: 'Used to deliver the purchases you make in the store.',
      perfil_cuenta: 'Your account',
      perfil_cuenta_sub: 'Email and password.',
      perfil_correo: 'Email',
      perfil_cambiar_correo: 'Change email',
      perfil_clave_titulo: 'Password',
      perfil_clave_sub: 'Change it if you think someone knows it.',
      perfil_cambiar_clave: 'Change password',
      perfil_guardar: 'Save changes',
      perfil_estado_inicial: 'Changes are saved here.',
      perfil_guardar_boton: 'Save changes',
      perfil_descartar: 'Discard',
      perfil_salir: 'Log out',
      perfil_salir_boton: 'Log out',
      perfil_salir_sub: 'You will be signed out of this browser and have to log in again.',
      jugador: 'Player',
      cambiar_foto: 'Change photo',
    },
  };

  function aplicarIdioma() {
    const d = TRAD[idioma()] || TRAD.es;
    document.querySelectorAll('[data-i18n]').forEach((nodo) => {
      const clave = nodo.getAttribute('data-i18n');
      if (d[clave] !== undefined) nodo.textContent = d[clave];
    });
    const aria = document.getElementById('btnAvatar');
    if (aria) aria.setAttribute('aria-label', d.cambiar_foto);
    if (usuario) pintar();
  }

  function token() {
    try { return localStorage.getItem('odissey_discord_session'); } catch (e) { return null; }
  }

  // Avatar por defecto: una inicial sobre el color elegido, para que el perfil
  // no se vea roto mientras el jugador no suba foto.
  function avatarPorDefecto(nombre, color) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
      '<rect width="96" height="96" fill="' + (color || '#eab308') + '"/>' +
      '<text x="48" y="60" font-family="Poppins, sans-serif" font-size="40" font-weight="700" ' +
      'fill="#0f172a" text-anchor="middle">' +
      escapar((nombre || '?').trim().charAt(0).toUpperCase()) + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let usuario = null;
  let guardado = null;   // copia de lo ultimo que hay en el servidor

  // ---------- API ----------

  async function api(ruta, opciones) {
    const o = opciones || {};
    const metodo = o.method || 'POST';
    const cuerpo = Object.assign({}, o.body || {});
    const conCuerpo = cuerpo && Object.keys(cuerpo).length > 0;

    let url = API + ruta;
    const tk = token();
    if (tk && o.auth !== false) {
      if (metodo === 'GET') url += (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(tk);
      else cuerpo.token = tk;
    }

    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: conCuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    // Antes esto se tragaba el fallo en silencio y el usuario veia siempre un
    // "no se pudo guardar" sin pistas. Ahora el error de verdad se devuelve y
    // se enseña, para poder saber si el bot va con una versión antigua.
    let datos = null;
    let falloJson = null;
    try {
      datos = await res.json();
    } catch (e) {
      falloJson = e.message || 'la respuesta no es JSON';
    }
    console.log('[API] ' + url.slice(-30) + ' status=' + res.status + ' resOk=' + res.ok +
      ' datosOk=' + (datos && datos.ok) + ' tipoDatos=' + typeof datos);
    return { ok: res.ok, status: res.status, datos: datos, falloJson: falloJson };
  }

  // Un mensaje que sea util cuando algo falla.
  function errorDe(r, porDefecto) {
    if (!r) return porDefecto;
    if (r.datos && r.datos.message) return r.datos.message;
    if (r.falloJson) return porDefecto + ' (el servidor no devolvió una respuesta válida: ' + r.falloJson + ')';
    if (r.status === 404) return 'La web está más actualizada que el servidor. Sube web.js y database.js al bot y reinícialo.';
    if (r.status === 405) return 'El servidor no entiende esta operación. Puede que el bot esté sin reiniciar.';
    return porDefecto + ' (error ' + r.status + ')';
  }

  async function subirImagen(file, kind) {
    if (!file) return null;

    const nombre = file.name || '';
    const tamano = file.size || 0;
    const tipo = (file.type || '').toLowerCase();

    // La extensión se saca del tipo real del archivo y, si el navegador no
    // lo reconoce (lo marca como "application/octet-stream", que es lo que
    // pasa con algunas extensiones raras), se usa la del nombre. Así una
    // imagen con la extensión correcta sube igualmente.
    const soloLetras = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    let ext = soloLetras(tipo.split('/')[1]);
    if (!ext || ext === 'octetstream') ext = soloLetras(nombre.split('.').pop());
    if (ext === 'jpeg') ext = 'jpg';

    const tipoBueno = TIPOS_OK.indexOf(tipo) >= 0;
    const extBuena = EXT_OK.indexOf(ext) >= 0;

    if (!tipoBueno && !extBuena) {
      // Explica qué se ha recibido, porque "no se pudo subir" sin más no
      // ayuda: casi siempre es un .heic del móvil o un formato raro.
      avisar(t('tipoImagen') + ' (' + (nombre || 'archivo') + ')', 'es-error');
      return null;
    }
    if (tamano > MAX_IMG) {
      avisar(t('pesoImagen') + ' (' + (tamano / 1048576).toFixed(1) + ' MB)', 'es-error');
      return null;
    }

    const tk = token();
    const url = API + '/api/auth/profile/image?kind=' + kind + '&ext=' + encodeURIComponent(ext)
      + (tk ? '&token=' + encodeURIComponent(tk) : '');
    avisar(idioma() === 'en' ? 'Uploading…' : 'Subiendo…', '');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    let datos = null;
    try { datos = await res.json(); } catch (e) { datos = null; }
    if (!res.ok || !datos || !datos.ok) {
      avisar((datos && datos.message) || t('errorSubir'), 'es-error');
      return null;
    }
    return datos.path;
  }

  function avisar(texto, clase) {
    const caja = el('perfilEstado');
    if (!caja) return;
    caja.textContent = texto;
    caja.classList.remove('es-ok', 'es-error');
    if (clase) caja.classList.add(clase);
  }

  // ---------- pintar ----------

  function pintar() {
    if (!usuario) return;

    const color = usuario.accent || '#eab308';
    document.documentElement.style.setProperty('--perfil-accent', color);

    el('perfilNombre').textContent = usuario.username;
    el('perfilNombre').style.color = color;

    const fecha = new Date(usuario.createdAt);
    // Si la fecha no es valida se omite el "desde": antes salia
    // "En Odissey desde NaN (undefined)".
    if (isNaN(fecha.getTime())) {
      el('perfilMeta').textContent = usuario.mcName ? usuario.mcName : '';
    } else {
      const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][fecha.getMonth()];
      el('perfilMeta').textContent = t('desde') + ' ' + fecha.getFullYear() + ' (' + mes + ')'
        + (usuario.mcName ? '  ·  ' + usuario.mcName : '');
    }

    el('perfilBio').textContent = usuario.bio || '';

    // Foto. Si la URL guardada esta rota o no carga, se cae al avatar de
    // iniciales en vez de dejar un circulo vacio.
    const foto = el('perfilAvatar');
    foto.onerror = function () {
      foto.onerror = null;
      foto.src = avatarPorDefecto(usuario.username, color);
    };
    foto.src = rutaImagen(usuario.avatar) || avatarPorDefecto(usuario.username, color);
    el('perfilBannerImg').src = rutaImagen(usuario.banner) || '';
    el('perfilBannerImg').hidden = !usuario.banner;
    el('perfilBannerVacio').hidden = !!usuario.banner;

    // Chips
    const rol = el('chipRol');
    rol.textContent = usuario.role === 'user' ? 'Jugador' : usuario.role;
    rol.hidden = false;

    const mc = el('chipMc');
    mc.hidden = !usuario.mcName;
    if (usuario.mcName) mc.textContent = usuario.mcName;

    // Campos
    el('inputUsuario').value = usuario.username;
    el('inputBio').value = usuario.bio || '';
    el('inputMc').value = usuario.mcName || '';
    el('inputEmail').value = usuario.email || '';
    el('inputColor').value = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#eab308';
    el('colorHexo').textContent = el('inputColor').value.toUpperCase();

    el('bioCount').textContent = String((usuario.bio || '').length);
    guardado = valoresDelFormulario();
  }

  function valoresDelFormulario() {
    // Solo los campos de texto: el color y las fotos se guardan solos, sin
    // pasar por "Guardar cambios".
    return {
      username: el('inputUsuario').value.trim(),
      bio: el('inputBio').value.trim(),
      mcName: el('inputMc').value.trim(),
    };
  }

  // El color se guarda en cuanto se elige. Antes tenía que pulsarse "Guardar
  // cambios y si recargabas antes se perdia, que es justo lo que
  // el color se guarde al instante.
  let temporizadorColor = null;
  function guardarColor() {
    if (temporizadorColor) clearTimeout(temporizadorColor);
    temporizadorColor = setTimeout(() => {
      const accent = el('inputColor').value;
      api('/api/auth/profile', { body: { accent: accent } }).then((r) => {
        if (r.ok && r.datos && r.datos.user) {
          usuario = r.datos.user;
          try { localStorage.setItem('odissey_discord_user', JSON.stringify(usuario)); } catch (e) { }
          avisar(t('colorGuardado'), 'es-ok');
        } else {
          avisar(errorDe(r, t('errorGuardar')), 'es-error');
        }
      });
    }, 450);
  }

  function hayCambios() {
    if (!guardado) return false;
    const a = JSON.stringify(valoresDelFormulario());
    const b = JSON.stringify(guardado);
    return a !== b;
  }

  function marcarCambios() {
    if (hayCambios()) avisar(t('cambiosSinGuardar'), '');
    else avisar(t('cambiosGuardados'), 'es-ok');
  }

  // ---------- acciones ----------

  async function guardar() {
    const v = valoresDelFormulario();
    if (!v.username) { avisar('El nombre de usuario no puede quedar vacío.', 'es-error'); return; }
    avisar(t('guardando'), '');
    // La foto y el banner se mandan siempre (también a null para poder
    // quitarlos): si no, al subir una imagen se guardaba todo lo demás pero
    // la imagen se perdía al recargar.
    const cuerpo = Object.assign({}, v, {
      avatarUrl: usuario.avatar || null,
      bannerUrl: usuario.banner || null,
    });
    const r = await api('/api/auth/profile', { body: cuerpo });

    // Se comprueba paso a paso y no con una sola expresion larga: asi queda
    // claro cuál de las tres cosas falla cuando algo va mal.
    let respuestaOk = false;
    if (r && r.ok === true) {
      if (r.datos && r.datos.ok === true) respuestaOk = true;
    }
    if (!respuestaOk) {
      avisar(errorDe(r, t('errorGuardar')), 'es-error');
      return;
    }
    usuario = r.datos.user;
    try {
      localStorage.setItem('odissey_discord_user', JSON.stringify(usuario));
    } catch (e) { /* nada */ }
    pintar();
    avisar(t('cambiosGuardados'), 'es-ok');
    if (typeof window.updateNavButton === 'function') window.updateNavButton();
  }

  async function cambiarEmail() {
    const nuevo = el('inputEmail').value.trim();
    const r = await api('/api/auth/email', { body: { email: nuevo } });
    if (!r.ok || !r.datos || !r.datos.ok) {
      avisar(errorDe(r, t('correoMal')), 'es-error');
      return;
    }
    usuario = r.datos.user;
    try { localStorage.setItem('odissey_discord_user', JSON.stringify(usuario)); } catch (e) { }
    avisar(t('correoCambiado'), 'es-ok');
  }

  async function cambiarPassword() {
    const actual = window.prompt(idioma() === 'en' ? 'Your current password' : 'Tu contraseña actual');
    if (actual === null) return;
    const nueva = window.prompt(idioma() === 'en'
      ? 'New password (at least 8 characters)'
      : 'La contraseña nueva (mínimo 8 caracteres)');
    if (nueva === null) return;

    const r = await api('/api/auth/password', { body: { currentPassword: actual, newPassword: nueva } });
    if (!r.ok || !r.datos || !r.dados.ok) {
      avisar(errorDe(r, t('passMal')), 'es-error');
      return;
    }
    // El servidor devuelve un token nuevo, porque al cambiar la contraseña se
    // cierran todas las sesiones. Si no se guarda, el usuario se queda fuera.
    if (r.datos.token) {
      try { localStorage.setItem('odissey_discord_session', r.datos.token); } catch (e) { }
    }
    avisar(t('passCambiada'), 'es-ok');
  }

  function colorAleatorio() {
    // Que el color salga dorado para que pegue con el resto del sitio: se
  // limita el tono y se juega con la saturacion y la luz.
  const h = 35 + Math.random() * 25;
  const s = 70 + Math.random() * 25;
  const l = 45 + Math.random() * 12;
    el('inputColor').value = hslAHex(h, s, l);
    el('colorHexo').textContent = el('inputColor').value.toUpperCase();
    document.documentElement.style.setProperty('--perfil-accent', el('inputColor').value);
    el('perfilNombre').style.color = el('inputColor').value;
    guardarColor();
  }

  function hslAHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const c = x => Math.round(255 * x).toString(16).padStart(2, '0');
    return '#' + c(f(0)) + c(f(8)) + c(f(4));
  }

  // ---------- arranque ----------

// ---------- Vincular con Minecraft ----------
  // El enlace NO se hace desde aqui. Con el servidor en online-mode=false el
  // Minecraft no puede probar quien es el jugador (el UUID se deriva del
  // nombre), asi que el enlace lo hace quien administra el servidor con
  // "node vincular-mc.js <cuenta> <nombre-op>". Aqui solo se muestra el estado.
  async function estadoMc() {
    const s = await api('/api/mc/status', { method: 'GET' });
    const info = s.datos || {};
    const caja = el('perfilMcBox');
    if (!caja) return;
    const estado = el('perfilMcEstado');
    const codigo = el('perfilMcCodigo');
    const btnVincular = el('btnMcVincular');
    const btnDes = el('btnMcDesvincular');
    if (codigo) codigo.hidden = true;
    if (btnVincular) btnVincular.hidden = true;

    const en = idioma() === 'en';
    const ayuda = el('perfilMcAyuda');
    const aviso = el('perfilMcAviso');

    if (info.vinculado) {
      caja.dataset.estado = 'ok';
      estado.textContent = info.mcName
        ? (en ? 'Linked to ' + info.mcName + '.' : 'Enlazada con ' + info.mcName + '.')
        : (en ? 'Linked.' : 'Enlazada.');
      if (btnDes) btnDes.hidden = false;
      if (aviso) {
        aviso.textContent = info.esAdmin
          ? (en ? 'You are an OP, so this account can enter the admin panel.'
                : 'Eres OP, asi que esta cuenta puede entrar al panel.')
          : (en ? 'You are not an OP, so this account does not enter the admin panel.'
                : 'No eres OP, asi que esta cuenta no entra al panel.');
        aviso.hidden = false;
      }
      if (ayuda) ayuda.hidden = true;
      return;
    }
    caja.dataset.estado = 'pendiente';
    estado.textContent = en ? 'Not linked.' : 'Sin enlazar.';
    if (btnDes) btnDes.hidden = true;
    if (aviso) aviso.hidden = true;
    if (ayuda) {
      ayuda.textContent = en
        ? 'Ask the server owner to run: node vincular-mc.js ' + (info.usuario || '') + ' <op-name>'
        : 'Pide a quien administre el servidor que ejecute: node vincular-mc.js ' + (info.usuario || '') + ' <nombre-del-op>';
      ayuda.hidden = false;
    }
  }

  async function desvincularMc() {
    if (!window.confirm(idioma() === 'en' ? 'Unlink your Minecraft account?' : 'Desenlazar tu cuenta de Minecraft?')) return;
    await api('/api/mc/unlink', { method: 'POST', body: {} });
    avisar(idioma() === 'en' ? 'Unlinked.' : 'Desenlazada.', 'es-ok');
    await estadoMc();
  }
  // Con perfil.html?u=pepito123 se ve el perfil de OTRO usuario. Solo se
  // pinta lo que ya es publico (foto, banner, nombre, Minecraft, bio, color
  // y fecha) y el panel de ajustes se oculta entero: asi no hay ningun boton
  // para tocar la cuenta de otra persona.
  let vistaPublica = false;

  async function cargarPublico(username) {
    vistaPublica = true;
    const r = await api('/api/users/' + encodeURIComponent(username), { method: 'GET' });
    if (!r.ok || !r.datos || !r.datos.user) {
      el('perfilLogin').hidden = false;
      el('perfilHero').hidden = true;
      const aviso = el('perfilAviso');
      if (aviso) {
        aviso.textContent = idioma() === 'en'
          ? 'That account does not exist.'
          : 'Esa cuenta no existe.';
        aviso.hidden = false;
      }
      return;
    }
    usuario = r.datos.user;
    // La API publica joinedAt y la privada createdAt. Se pasa todo al mismo
    // formato que usa pintar() para que no falte nada (la fecha salia NaN).
    usuario = {
      username: usuario.username,
      mcName: usuario.mcName || '',
      avatar: usuario.avatar || '',
      banner: usuario.banner || '',
      accent: usuario.accent || '',
      bio: usuario.bio || '',
      createdAt: usuario.joinedAt || usuario.createdAt || 0,
      role: 'user',
      email: '',
      discord: { linked: false }
    };
    el('perfilLogin').hidden = true;
    el('perfilHero').hidden = false;
    el('perfilAjustes').hidden = true;   // sin ajustes sobre cuentas ajenas
    // Los botones de cambiar foto y banner viven en la cabecera, fuera del
    // panel de ajustes, asi que tambien se ocultan: en el perfil de otro no
    // hay nada que editar.
    ['btnAvatar', 'btnBanner', 'fileAvatar', 'fileBanner'].forEach(function (id) {
      const n = el(id);
      if (n) n.hidden = true;
    });
    pintar();

    // En vista ajena el rol no se enseña: solo el staff lo tiene.
    const rol = el('chipRol');
    if (rol) rol.hidden = true;

    const aviso = el('perfilAviso');
    if (aviso) {
      aviso.textContent = idioma() === 'en'
        ? 'You are looking at another player\'s public profile.'
        : 'Estás viendo el perfil público de otro jugador.';
      aviso.hidden = false;
    }
    const titulo = document.querySelector('title');
    if (titulo) titulo.textContent = usuario.username + ' - Odissey';
  }

  async function cargar() {
    // Si la URL trae ?u= se busca ese usuario, no el de la sesion.
    const nombre = new URLSearchParams(location.search).get('u');
    if (nombre && nombre.trim()) return cargarPublico(nombre.trim());
    if (!token()) {
      el('perfilLogin').hidden = false;
      el('perfilHero').hidden = true;
      return;
    }
    const r = await api('/api/auth/me', { method: 'GET' });
    if (!r.ok || !r.datos || !r.datos.user) {
      el('perfilLogin').hidden = false;
      el('perfilHero').hidden = true;
      return;
    }
    usuario = r.datos.user;
    try { localStorage.setItem('odissey_discord_user', JSON.stringify(usuario)); } catch (e) { }
    el('perfilLogin').hidden = true;
    el('perfilHero').hidden = false;
    el('perfilAjustes').hidden = false;
    pintar();
  }

  function conectar() {
    // En vista publica no hay panel de ajustes: no se engancha nada para no tocar la cuenta ajena.
    if (vistaPublica) return;
    el('btnGuardar').addEventListener('click', guardar);
    el('btnDescartar').addEventListener('click', () => { pintar(); avisar(t('sinGuardar'), ''); });
    el('btnCambiarEmail').addEventListener('click', cambiarEmail);
    el('btnCambiarClave').addEventListener('click', cambiarPassword);
    el('btnColorAleatorio').addEventListener('click', colorAleatorio);

    // Minecraft: solo queda poder desenlazar. El enlace se hace desde el
    // servidor (node vincular-mc.js), no desde aqui.
    if (el('btnMcDesvincular')) el('btnMcDesvincular').addEventListener('click', desvincularMc);
    estadoMc();

    el('btnSalir').addEventListener('click', () => {
      if (window.OdisseyAuth && window.OdisseyAuth.salir) {
        window.OdisseyAuth.salir().then(() => { window.location.reload(); });
      }
    });

    el('btnIrLogin').addEventListener('click', () => {
      if (typeof window.openLoginModal === 'function') window.openLoginModal();
    });

    // Color: se aplica al momento y se guarda solo
    el('inputColor').addEventListener('input', () => {
      const v = el('inputColor').value;
      el('colorHexo').textContent = v.toUpperCase();
      document.documentElement.style.setProperty('--perfil-accent', v);
      el('perfilNombre').style.color = v;
      guardarColor();
    });

    // Bio: cuenta de caracteres
    el('inputBio').addEventListener('input', () => {
      el('bioCount').textContent = String(el('inputBio').value.length);
      marcarCambios();
    });

    ['inputUsuario', 'inputMc'].forEach(id => {
      el(id).addEventListener('input', marcarCambios);
    });

    // Foto y banner: los dos botones de la cabecera (el "+" de la foto y el
// de la esquina del banner). En la tarjeta de apariencia ya no hay más.
    el('btnAvatar').addEventListener('click', () => el('fileAvatar').click());
    el('btnBanner').addEventListener('click', () => el('fileBanner').click());

    el('fileAvatar').addEventListener('change', async (ev) => {
      const ruta = await subirImagen(ev.target.files[0], 'avatar');
      ev.target.value = '';
      if (!ruta) return;
      usuario.avatar = ruta;
      el('perfilAvatar').src = rutaImagen(usuario.avatar);
      guardar();
    });

    el('fileBanner').addEventListener('change', async (ev) => {
      const ruta = await subirImagen(ev.target.files[0], 'banner');
      ev.target.value = '';
      if (!ruta) return;
      usuario.banner = ruta;
      el('perfilBannerImg').src = rutaImagen(usuario.banner);
      el('perfilBannerImg').hidden = false;
      el('perfilBannerVacio').hidden = true;
      guardar();
    });

// Quitar foto o banner ya no tiene botón propio (se cambian arriba, en la
      // cabecera del perfil). La función se deja a mano por si algún día se
      // vuelve a exponer el botón, y para poder quitarla desde la consola.

      window.perfilQuitarFoto = function () {
        usuario.avatar = null;
        el('perfilAvatar').src = avatarPorDefecto(usuario.username, el('inputColor').value);
        guardar();
      };

      window.perfilQuitarBanner = function () {
        usuario.banner = null;
        el('perfilBannerImg').hidden = true;
        el('perfilBannerVacio').hidden = false;
        guardar();
      };

    // Volver de conectar Discord: el servidor deja el token en la URL
    const params = new URLSearchParams(location.search);
    if (params.get('discord_linked')) {
      history.replaceState({}, '', location.pathname);
      avisar('Discord conectado.', 'es-ok');
    }
    if (params.get('discord_error')) {
      history.replaceState({}, '', location.pathname);
      avisar('No se pudo conectar Discord.', 'es-error');
    }

    aplicarIdioma();

    // Al cambiar el idioma con la bandera hay que re-traducir esta pagina.
    document.addEventListener('click', (ev) => {
      const b = ev.target && ev.target.closest ? ev.target.closest('#langBtn') : null;
      if (!b) return;
      setTimeout(aplicarIdioma, 60);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  // Un ReferenceError en cualquier boton (un id mal puesto, una funcion que se
  // ha borrado) tumbaba todo lo de abajo, y la pagina se quedaba en
  // "Cargando..." para siempre sin decir ni por que. Ahora cadaenganchado va
  // por separado y cargar() se llama siempre.
  function arrancar() {
    try {
      conectar();
    } catch (err) {
      console.error('[perfil] fallo al conectar los botones:', err);
    }
    try {
      cargar();
    } catch (err) {
      console.error('[perfil] fallo al cargar:', err);
    }
  }
})();
