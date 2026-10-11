// ============================================================================
//  js/supabase.js
//  Cliente único de Supabase para toda la web.
//
//  POR QUE UN SOLO FICHERO
//  ---------------------------------------------------------------------------
//  Supabase guarda la sesión en localStorage. Si cada página crea su propio
//  cliente, cada una tiene su propia copia y al saltar entre páginas se
//  pisan la sesión y el visitante aparece como desconectado a mitad de una
//  acción. Con un cliente solo, la sesión es la misma en todas partes.
//
//  LO QUE ESTA EN LA WEB Y LO QUE NO
//  ---------------------------------------------------------------------------
//  Aquí va la "publishable key", que es publica por diseño: va incrustada en
//  el JS y cualquiera la ve. Es como una Directions API key.
//
//  La "secret key" NO va aquí ni en ningún sitio de esta carpeta. Va en las
//  variables de entorno de Supabase, y solo se usa desde el servidor o desde
//  una Edge Function.
//
//  LO QUE NO SE PUEDE HACER DESDE AQUÍ
//  ---------------------------------------------------------------------------
//  Con esta clave RLS se encarga de los permisos: es una puerta con llave,
//  pero la llave se usa desde el otro lado. Si el RLS de una tabla esta mal,
//  la web puede leer o escribir de mas. Eso se arregla en el SQL, no aqui.
// ============================================================================

(function (global) {
  'use strict';

  const cfg = global.SITE_CONFIG || global.DEFAULT_SITE_CONFIG || {};
  const URL_SUPABASE = (cfg.supabaseUrl || '').replace(/\/+$/, '');
  const CLAVE = cfg.supabaseKey || '';

  /* Se carga desde CDN con la version fijada. Sin "latest": si Supabase
     publica una version nueva un martes, el sitio entero empieza a
     comportarse distinto sin que se haya tocado nada. La version se
     cambia a proposito y se prueba. */
  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';

  let cargando = null;
  let cliente = null;
  let creando = null;

  function hayConfig() {
    return !!(URL_SUPABASE && CLAVE);
  }

  /** Carga la libreria si no esta. Devuelve una promesa. */
  function cargarLibreria() {
    if (global.supabase) return Promise.resolve(global.supabase);
    if (cargando) return cargando;

    cargando = new Promise(function (resolver, rechazar) {
      const s = document.createElement('script');
      s.src = CDN;
      s.async = true;
      s.onload = function () {
        if (!global.supabase) {
          cargando = null;
          rechazar(new Error('La libreria de Supabase ha cargado pero no aparece.'));
          return;
        }
        resolver(global.supabase);
      };
      s.onerror = function () {
        cargando = null;
        rechazar(new Error('No se ha podido cargar Supabase. Revisa tu conexion.'));
      };
      document.head.appendChild(s);
    });
    return cargando;
  }

  /**
   * Devuelve el cliente de Supabase, creandolo la primera vez.
   *
   * @param {object} [opciones]
   * @param {boolean} [opciones.esperarSesion=true]  con false, no espera a
   *        que se recupere la sesion guardada. Se usa cuando hace falta
   *        saber YA si hay usuario, sin esperar.
   */
  async function obtener(opciones) {
    const opts = opciones || {};
    if (cliente) return cliente;
    if (opts.esperarSesion === false && creando) return creando;

    if (!hayConfig()) {
      throw new Error('Supabase no esta configurado (falta supabaseUrl o supabaseKey en site-config.js).');
    }

    /* Varias partes de la pagina piden el cliente a la vez: auth.js al
       arrancar, js/datos.js al montarse, cada pagina al pintar su
       contenido. Si dos de ellas pasan por aqui en el mismo instante,
       las dos ven "cliente === null" y crean dos clientes.

       Y eso no es solo memoria de mas: Supabase avisa con "Multiple
       GoTrueClient instances detected" y las dos instancias se pelean
       por la sesion en localStorage. Una actualiza el token y la otra lo
       sobrescribe con el suyo, y el visitante ve como se le cae la
       sesion al saltar entre paginas.

       Por eso se guarda la PROMESA, no el cliente: la segunda llamada
       espera a la primera en vez de crear la suya. */
    if (creando) return creando;

    creando = (async function () {
      await cargarLibreria();
      const nuevo = global.supabase.createClient(URL_SUPABASE, CLAVE, {
        auth: {
          // La sesion se guarda en localStorage. Es lo que hace que entrar en
          // una pagina y saltar a otra siga con la sesion puesta.
          persistSession: true,
          autoRefreshToken: true,
          // Si otra pestana inicia o cierra sesion, esta se entera. Sin esto,
          // se cierra sesion en una pestana y en las demas sigue creyendose
          // que se esta dentro.
          detectSessionInUrl: true,
        },
      });
      cliente = nuevo;
      observarSesion(nuevo);
      return nuevo;
    })();

    try {
      return await creando;
    } finally {
      // Se suela aunque falle: si el siguiente lo intenta otra vez, tiene
      // que poder intentarlo, no quedarse con una promesa muerta.
      creando = null;
    }
  }

  /** Cliente sin esperar: para cuando solo se hacen consultas publicas. */
  async function rapido() {
    return obtener({ esperarSesion: false });
  }

  /* ------------------------------------------------------------------
   * Usuario con sesion, pero SIN esperar.
   *
   * Hay sitios que necesitan saber al instante si hay alguien dentro, y no
   * pueden esperar a una promesa: los formularios que avisan antes de enviar
   * ("conectate para reportar"), el boton de mi cuenta, el badge de la
   * cabecera. Con Promise, el boton se pintaria "entrar" durante un instante
   * aunque haya sesion, y eso se ve como un parpadeo.
   *
   * Asi que se guarda una copia sincronica que se refresca sola con
   * onAuthStateChange. Si en algun momento el listener no llegara a
   * dispararse, es_cache() se queda en false y el codigo que dependa de
   * esto cae por el camino viejo, que es lo seguro.
   * ------------------------------------------------------------------ */
  const sesion = { usuario: null, id: null, cache: false };

  /* El perfil (nombre, avatar, color) tambien se necesita de un vistazo.
     Hay codigo que monta la cabecera con el nombre y el avatar antes de
     que ninguna promesa haya resuelto: si solo hubiera una version con
     Promise, el boton se dibujaria vacio y luego cambiaria solo, que se
     ve como un parpadeo. */
  const ficha = { perfil: null, cache: false };

  function marcarPerfil(p) {
    ficha.perfil = p || null;
    ficha.cache = true;
    return ficha.perfil;
  }

  /** Perfil del usuario con sesion, o null. De un vistazo, sin esperar. */
  function perfilActualSync() {
    return ficha.cache ? ficha.perfil : null;
  }

  function marcarSesion(u) {
    sesion.usuario = u || null;
    sesion.id = (u && u.id) || null;
    sesion.cache = true;
    avisarSesion();
    return sesion.usuario;
  }

  /* Avisa de que la sesion ya esta decidida. Lo escucha auth.js para
     repintar el boton de la cabecera.

     Se dispara desde aqui y no desde un promise suelto en la pagina
     porque el orden no esta garantizado: la cabecera se pinta al
     principio, antes de que Supabase haya leido la sesion del
     almacenamiento, y se quedaba en "Entrar" con el usuario dentro. */
  function avisarSesion() {
    try {
      if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('odissey-sesion-lista', {
          detail: { id: sesion.id },
        }));
      }
    } catch (e) { /* si no se puede despachar, la pagina sigue igual */ }
  }

  async function observarSesion(sb) {
    try {
      const { data } = await sb.auth.getSession();
      marcarSesion(data && data.session ? data.session.user : null);
    } catch (e) {
      marcarSesion(null);
    }
    /* El perfil no se puede pedir hasta saber quien es. Se pide aqui y en
       cada cambio de sesion, para que la cabecera tenga el nombre y el
       avatar desde el principio y no un instante mas tarde. */
    await refrescarPerfil();
    try {
      sb.auth.onAuthStateChange(function (_evento, s) {
        marcarSesion(s ? s.user : null);
        marcarPerfil(null);
        refrescarPerfil();
      });
    } catch (e) {
      /* Si no se puede observar, el cache se queda con lo que hubiera.
         Las funciones que lo usan comprueban ficha.cache antes. */
    }
  }

  /** Vuelve a pedir el perfil y lo deja en la cache. */
  async function refrescarPerfil() {
    try {
      const u = usuarioActualSync();
      if (!u) { marcarPerfil(null); return null; }
      const sb = await rapido();
      const { data } = await sb.from('profiles').select('*').eq('id', u).maybeSingle();
      return marcarPerfil(data || null);
    } catch (e) {
      return marcarPerfil(null);
    }
  }

  /** Id del usuario con sesion, o null. De un vistazo, sin esperar. */
  function usuarioActualSync() {
    return sesion.cache ? sesion.id : null;
  }

  /**
   * Usuario con sesion abierta, o null.
   * No lanza: casi ningun sitio necesita Handlebars cuando no hay nadie
   * dentro, y aqui casi siempre es el caso normal (visitante anonimo).
   */
  async function usuarioActual() {
    try {
      const sb = await obtener({ esperarSesion: false });
      const { data } = await sb.auth.getSession();
      return marcarSesion((data && data.session && data.session.user) || null);
    } catch (e) {
      return null;
    }
  }

  /** Perfil (profiles) del usuario con sesion, o null. */
  async function perfilActual() {
    try {
      const u = await usuarioActual();
      if (!u) return null;
      const sb = await rapido();
      const { data } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
      // Se deja en la cache tambien, para que el codigo sincronico que
      // dibuja la cabecera lo tenga sin tener que esperar otra vez.
      return marcarPerfil(data || null);
    } catch (e) {
      return null;
    }
  }

  global.OdisseySupabase = {
    obtener,
    rapido,
    usuarioActual,
    usuarioActualSync,
    marcarSesion,
    perfilActualSync,
    refrescarPerfil,
    perfilActual,
    hayConfig,
    URL: URL_SUPABASE,
    // Para las pruebas: poder Resetear entre casos.
    _interno: {
      limpiar: function () { cliente = null; cargando = null; creando = null; },
    },
  };

})(window);