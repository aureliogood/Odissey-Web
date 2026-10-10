// ===================================================================
// search.js - Buscador de jugadores.
//
// Se carga en todas las paginas y hace tres cosas:
//   1. anade el boton "Buscar" al menu (si la pagina tiene menu)
//   2. monta la ventana de busqueda
//   3. busca cuentas contra /api/users/search y abre el perfil publico
//
// Va en un archivo aparte y no repetido en 13 HTML para que el menu, el
// estilo y el atajo de teclado se cambien en un solo sitio.
// Se abre con Ctrl+K / Cmd+K y con "/" cuando no se esta escribiendo.
// ===================================================================
(function () {
  'use strict';

  const API = window.API_BASE || 'https://odisseymc.site/bot';
  const MAX = 8;

  const T = {
    es: {
      title: 'Buscar jugadores',
      placeholder: 'Escribe un usuario o nombre de Minecraft...',
      hint: 'Busca por nombre de usuario o por nombre de Minecraft.',
      empty: 'Escribe al menos 2 letras.',
      none: 'No hay ninguna cuenta con ese nombre.',
      error: 'No se pudo buscar. Intentalo de nuevo.',
      short: 'demasiadas busquedas, espera un momento',
      close: 'Cerrar',
      results: 'Resultados',
      yo: 'Tu perfil'
    },
    en: {
      title: 'Find players',
      placeholder: 'Type a username or Minecraft name...',
      hint: 'Search by username or by Minecraft name.',
      empty: 'Type at least 2 letters.',
      none: 'No account matches that name.',
      error: 'Search failed. Please try again.',
      short: 'too many searches, wait a moment',
      close: 'Close',
      results: 'Results',
      yo: 'Your profile'
    }
  };

  function idioma() {
    try { return localStorage.getItem('odissey_lang') === 'en' ? 'en' : 'es'; } catch (e) { return 'es'; }
  }
  function t(k) { return (T[idioma()] || T.es)[k] || ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  let modal = null;
  let input = null;
  let resultados = null;
  let estado = null;
  let cronometro = null;
  let peticion = 0;

  // ---------- Ventana ----------
  function crear() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'buscador-fondo';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', t('title'));
    modal.hidden = true;
    modal.innerHTML =
      '<div class="buscador-caja">' +
        '<div class="buscador-cabecera">' +
          '<svg class="buscador-lupa" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>' +
          '<input type="search" class="buscador-input" autocomplete="off" spellcheck="false" enterkeyhint="search">' +
          '<button type="button" class="buscador-cerrar" aria-label="Cerrar">&times;</button>' +
        '</div>' +
        '<p class="buscador-pista"></p>' +
        '<div class="buscador-estado" hidden></div>' +
        '<div class="buscador-lista" role="listbox"></div>' +
      '</div>';
    document.body.appendChild(modal);

    input = modal.querySelector('.buscador-input');
    resultados = modal.querySelector('.buscador-lista');
    estado = modal.querySelector('.buscador-estado');
    modal.querySelector('.buscador-pista').textContent = t('hint');
    modal.querySelector('.buscador-cerrar').addEventListener('click', cerrar);
    modal.addEventListener('click', e => { if (e.target === modal) cerrar(); });
    resultados.addEventListener('click', alPulsarItem);
    input.addEventListener('input', alEscribir);
    input.addEventListener('keydown', alPulsar);
  }

  function abrir() {
    crear();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    pintarIdioma();
    input.value = '';
    resultados.innerHTML = '';
    estado.hidden = true;
    // Foco al final: en iOS se abre el teclado solo con focus().
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 30);
  }

  function cerrar() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  function pintarIdioma() {
    if (!modal) return;
    modal.querySelector('.buscador-pista').textContent = t('hint');
    modal.querySelector('.buscador-cerrar').setAttribute('aria-label', t('close'));
    modal.setAttribute('aria-label', t('title'));
    input.placeholder = t('placeholder');
  }

  // ---------- Busqueda ----------
  function alEscribir() {
    clearTimeout(cronometro);
    const q = input.value.trim();
    if (q.length < 2) {
      resultados.innerHTML = '';
      estado.hidden = true;
      return;
    }
    // 250ms: no se lanza una peticion por cada tecla.
    cronometro = setTimeout(() => buscar(q), 250);
  }

  function alPulsar(e) {
    if (e.key === 'Escape') { cerrar(); return; }
    if (e.key !== 'Enter') return;
    const primero = resultados.querySelector('.buscador-item');
    if (primero) { e.preventDefault(); abrirPerfil(primero.dataset.user); }
  }

  function mensaje(texto) {
    resultados.innerHTML = '';
    estado.textContent = texto;
    estado.hidden = false;
  }

  async function buscar(q) {
    const mine = ++peticion;
    estado.hidden = true;
    try {
      const r = await fetch(API + '/api/users/search?q=' + encodeURIComponent(q));
      const j = await r.json().catch(() => ({}));
      if (mine !== peticion) return;          // hay una busqueda mas nueva
      if (r.status === 429) return mensaje(t('short'));
      if (!j || !j.ok) return mensaje(t('error'));
      const lista = Array.isArray(j.results) ? j.results : [];
      if (!lista.length) return mensaje(t('none'));
      pintar(lista);
    } catch (err) {
      if (mine === peticion) mensaje(t('error'));
    }
  }

  // Las fotos las sirve el servidor en /uploads/... de la raiz del dominio, no
  // debajo de /bot. Sin esto el avatar salia con el icono de imagen rota.
  const RAIZ_API = API.replace(/\/bot\/?$/, '');

  // Los avatares que quedaron guardados de cuando las cuentas se vinculaban
  // con Discord son imagenes de cdn.discordapp.com. Como el login con Discord
  // ya no existe, no se muestran: se usa el avatar con la inicial.
  function esAvatarDeDiscord(valor) {
    return /(^|\/\/)(cdn\.)?(discordapp|discord)\.com/i.test(String(valor || ''))
      || /mc-heads\.net/i.test(String(valor || ''));
  }

  function rutaAvatar(valor) {
    if (!valor) return '';
    const v = String(valor);
    if (esAvatarDeDiscord(v)) return '';
    if (/^https?:\/\//i.test(v)) {
      const ruta = v.replace(/^https?:\/\/[^/]+/i, '');
      if (ruta.indexOf('/uploads/') !== -1) return RAIZ_API + ruta.replace(/^\/bot/, '');
      return v;
    }
    return RAIZ_API + (v.charAt(0) === '/' ? v : '/' + v);
  }

  function pintar(lista) {
    resultados.innerHTML = lista.slice(0, MAX).map(u => {
      const letra = (u.username || '?').charAt(0).toUpperCase();
      const color = u.accent || '#eab308';
      const src = rutaAvatar(u.avatar);
      const foto = src
        ? '<img class="buscador-avatar" src="' + esc(src) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<span class=&quot;buscador-inicial&quot; style=&quot;background:' + esc(color) + '&quot;>' + esc(letra) + '</span>\'">'
        : '<span class="buscador-inicial" style="background:' + esc(color) + '">' + esc(letra) + '</span>';
      const mc = u.mcName
        ? '<span class="buscador-mc">Minecraft: ' + esc(u.mcName) + '</span>'
        : '';
      const bio = u.bio
        ? '<span class="buscador-bio">' + esc(String(u.bio).slice(0, 70)) + '</span>'
        : '';
      return '<button type="button" class="buscador-item" role="option" data-user="' + esc(u.username) + '">' +
        '<span class="buscador-foto">' + foto + '</span>' +
        '<span class="buscador-datos"><span class="buscador-nombre">' + esc(u.username) + '</span>' + mc + bio + '</span>' +
        '<span class="buscador-ver">Ver perfil</span>' +
      '</button>';
    }).join('');
  }

  function abrirPerfil(username) {
    if (!username) return;
    location.href = 'perfil.html?u=' + encodeURIComponent(username);
  }

  // Un solo listener en la lista en vez de uno por resultado: los resultados
  // se repintan en cada busqueda y asi no hay que volver a engancharlos.
  function alPulsarItem(e) {
    const item = e.target.closest ? e.target.closest('.buscador-item') : null;
    if (item) abrirPerfil(item.dataset.user);
  }

  // ---------- Boton del menu ----------
  function boton() {
    return '<button type="button" class="nav-pill__link js-buscar" title="Ctrl+K">' +
      '<svg class="nav-pill__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>' +
      '<span>' + t('title') + '</span></button>';
  }

  /* El boton va en la pastilla de navegacion (.nav-pill), que es donde
     estan los demas enlaces en todas las paginas. Antes se buscaba
     #menuDropdown, un desplegable que ya no existe en ningun HTML, asi que
     el boton nunca se insertaba y el buscador solo se abria con Ctrl+K.
     En movil se anade tambien al panel que construye dala-nav.js, para que
     no desaparezca al plegarse la barra. */
  function montarBoton() {
    if (document.querySelector('.js-buscar')) return true;

    const pastilla = document.querySelector('.nav-pill');
    if (pastilla) {
      pastilla.insertAdjacentHTML('beforeend', boton());
      enganchar();
      return true;
    }

    const panel = document.getElementById('navMenuPanel');
    if (panel) {
      const lista = panel.querySelector('.menu-panel__list');
      if (lista) {
        lista.insertAdjacentHTML('beforeend', boton());
        enganchar();
        return true;
      }
    }
    return false;
  }

  function enganchar() {
    document.querySelectorAll('.js-buscar').forEach(b => {
      if (b.dataset.listo === '1') return;
      b.dataset.listo = '1';
      b.addEventListener('click', () => {
        // Si el panel de movil estaba abierto, se cierra antes de abrir
        // el buscador: si no, el buscador se queda detras del panel.
        if (typeof closeMenu === 'function') { try { closeMenu(); } catch (e) { console.warn('[search] closeMenu fallo', e); } }
        abrir();
      });
    });
  }

  // ---------- Atajos ----------
  function atajos(e) {
    const dentro = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'
      || e.target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      modal && !modal.hidden ? cerrar() : abrir();
      return;
    }
    if (dentro || modal && !modal.hidden) return;
    if (e.key === '/') { e.preventDefault(); abrir(); }
  }

  function alCargar() {
    document.addEventListener('keydown', atajos);

    /* La barra de navegacion la escribe el HTML de cada pagina, pero el
       panel de movil lo construye dala-nav.js al pulsar el boton de menu.
       Si el boton no cabe todavia (el script entra antes que el DOM) se
       reintenta un rato. Antes se reintentaba 21 veces sin parar y siempre
       fallando, porque buscaba un contenedor que no existe en ninguna
       pagina: eran 3 segundos de temporizadores por visita. */
    let intentos = 0;
    const reloj = setInterval(() => {
      if (montarBoton() || ++intentos > 20) clearInterval(reloj);
    }, 150);
    montarBoton();

    /* El panel de movil lo crea dala-nav.js la primera vez que se pulsa el
       boton de menu, es decir despues de que esto ya haya terminado. Se
       vigila su aparicion para meter tambien el boton ahi, o en el movil
       el buscador desapareceria al plegar la barra. */
    if (window.MutationObserver && !document.getElementById('navMenuPanel')) {
      // El nombre es "vigila" con un espacio delante: escribiendolo
      // junto se crea una variable que no existe y la linea siguiente
      // lanza un ReferenceError, que tumba este script entero.
      const vigila = new MutationObserver(() => {
        if (montarBoton()) vigila.disconnect();
      });
      vigila.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => vigila.disconnect(), 60000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', alCargar);
  } else {
    alCargar();
  }

  // API minima para que otras partes (o el propio menu) abran el buscador.
  window.OdisseySearch = { abrir, cerrar };
})();