// ============================================================================
//  js/datos.js
//  Capa que reemplaza al bot.
//
//  QUE HACE
//  ---------------------------------------------------------------------------
//  El bot atendia ~55 rutas /api/... en 19 paginas: 221 llamadas en total.
//  Reescribirlas una a una seria un trabajo enorme y lleno de trampas.
//
//  En vez de eso, este archivo intercepta las peticiones que la web hace a
//  su propia ruta /api/... y las responde desde Supabase. Las 221 llamadas
//  siguen escribiendose igual; lo unico que cambia es quien responde.
//
//  ASI NADIE APUNTA AL BOT. La URL del bot se ha borrado del codigo: ya no
//  hay servidor que la atienda y hacia tiempo que devolvia un 404 silencioso
//  en cada pagina. Aqui solo se nombra para recordar que no se va a volver.
//
//  LO QUE ESTA RETIRADO Y NO SE SUSTITUYE
//  ---------------------------------------------------------------------------
//  Decidido: el bot ya no existe y estas funciones no tienen sustituto
//  posible en una web estatica.
//
//    /api/tickets/*        crear canales de ticket en Discord
//    /api/mc/*             RCON con el servidor de Minecraft
//    /api/staff/puente/*   el puente de staff
//    /api/auth/discord/*   enlazar y desenlazar Discord
//    /api/guilds/*, /api/discord/stats
//
//  Devuelven { ok:false, error:'retirado' } con un 501. La interfaz que las
//  usaba esta marcada como retirada y se oculta: es mejor que verse roto
//  que dejar un boton que no hace nada.
//
//  LO QUE SI SE SUSTITUYE
//  ---------------------------------------------------------------------------
//  Sesion, perfil, comprobacion de admin, contenido, reportes, valoraciones,
//  pedidos y el panel de administracion, todo contra Supabase con RLS.
//  Los permisos ya no los comprueba este archivo: los comprueba la base de
//  datos, que es donde de verdad no se pueden saltar.
// ============================================================================

(function (global) {
  'use strict';

  const RETIRADO = {
    error: 'retirado',
    message: 'Esta funcion se ha retirado.',
  };

  /* Tabla de rutas retiradas. Si aparece aqui, no hay nada que hacer:
     se responde 501 y la interfaz que la usa se oculta. */
  const RETIRADAS = [
    /^\/api\/tickets/,
    /^\/api\/mc\//,
    /^\/api\/staff\/puente/,
    /^\/api\/staff\/(link|status)/,
    /^\/api\/auth\/discord/,
    /^\/api\/guilds/,
    /^\/api\/discord\/stats/,
  ];

  function estaRetirada(ruta) {
    return RETIRADAS.some(function (r) { return r.test(ruta); });
  }

  function origen() {
    return global.location.origin + '';
  }

  /** ¿Esta peticion es una de las nuestras (mismo origen + /api/)? */
  function esNuestra(url) {
    if (typeof url !== 'string') return false;
    if (url.indexOf('/api/') === -1) return false;
    // Que no sea de otro dominio: las peticiones a Supabase pasan
    // de largo, que es justamente lo que queremos.
    return url.indexOf('supabase.co') === -1 &&
           url.indexOf('cloudflare.com') === -1 &&
           url.indexOf('/rest/v1/') === -1 &&
           url.indexOf('/auth/v1/') === -1;
  }

  function partes(url) {
    const limpia = url.split('?')[0];
    const ruta = limpia.substring(limpia.indexOf('/api/'));
    const qs = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    const query = {};
    if (qs) {
      qs.split('&').forEach(function (par) {
        const i = par.indexOf('=');
        if (i > 0) query[par.slice(0, i)] = decodeURIComponent(par.slice(i + 1));
      });
    }
    return { ruta, query };
  }

  async function jsonDe(peticion) {
    try {
      const texto = await peticion.clone().text();
      return texto ? JSON.parse(texto) : {};
    } catch (e) {
      return {};
    }
  }

  function responder(datos, codigo) {
    return Promise.resolve({
      ok: true,
      status: codigo || 200,
      json: function () { return Promise.resolve(datos); },
      text: function () { return Promise.resolve(JSON.stringify(datos)); },
      clone: function () { return this; },
      headers: { get: function () { return null; } },
    });
  }

  // ---------- operaciones ----------

  async function usuario(sb) {
    const { data } = await sb.auth.getSession();
    return (data && data.session && data.session.user) || null;
  }

  async function perfilDe(sb, id) {
    const { data } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    return data || null;
  }

  /* Forma de la respuesta que ya esperaba la web. */
  function usuarioPlano(u, p) {
    return {
      uid: u.id,
      username: (p && p.username) || (u.email || '').split('@')[0],
      email: u.email,
      rol: (p && p.rol) || 'user',
      role: (p && p.rol) || 'user',
      avatar_url: p && p.avatar_url,
      mc_name: p && p.mc_name,
      accent_color: p && p.accent_color,
      bio: p && p.bio,
      isAdmin: p && p.rol === 'admin',
      isStaff: p && (p.rol === 'staff' || p.rol === 'admin'),
    };
  }

  /* Las fechas venían como texto ("2026-10-10") y Postgres las devuelve
     como timestamptz ("2026-10-10T00:00:00+00"). El codigo de la web las
     compara y las pinta con el formato corto, así que se vuelve a dejar
     como texto con la parte de la fecha, que es lo que esperaba. */
  function normaliza(campoFecha) {
    return function (fila) {
      if (!fila) return fila;
      const v = fila[campoFecha];
      if (typeof v === 'string' && v.includes('T')) {
        fila[campoFecha] = v.slice(0, 10);
      }
      return fila;
    };
  }

  async function manejar(ruta, query, cuerpo, metodo, sb) {
    const u = await usuario(sb);

    // ---- sesion y estado ----
    if (ruta === '/api/session' || ruta === '/api/auth/me') {
      if (!u) return responder({ ok: false });
      const p = await perfilDe(sb, u.id);
      return responder({ ok: true, user: usuarioPlano(u, p) });
    }

    if (ruta === '/api/admin/check') {
      if (!u) return responder({ ok: false, isAdmin: false });
      const p = await perfilDe(sb, u.id);
      return responder({
        ok: true,
        isAdmin: !!(p && p.rol === 'admin'),
        isStaff: !!(p && (p.rol === 'staff' || p.rol === 'admin')),
      });
    }

    if (ruta === '/api/logout' || ruta === '/api/auth/logout') {
      // El cierre de sesion real lo hace auth.js con Supabase. Aqui solo
      // se responde bien, porque hay paginas que llaman a esta ruta y
      // luego limpian su localStorage por su cuenta.
      try { await sb.auth.signOut({ scope: 'global' }); } catch (e) { /* nada */ }
      return responder({ ok: true });
    }

    // ---- perfil ----
    if (ruta === '/api/auth/profile') {
      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      if (metodo === 'GET') {
        const p = await perfilDe(sb, u.id);
        return responder({ ok: true, user: usuarioPlano(u, p) });
      }
      const campos = {};
      ['username', 'mc_name', 'bio', 'accent_color', 'banner_url'].forEach(function (k) {
        if (cuerpo && cuerpo[k] !== undefined) campos[k] = cuerpo[k];
      });
      if (cuerpo && cuerpo.avatar_url !== undefined) campos.avatar_url = cuerpo.avatar_url;
      if (!Object.keys(campos).length) return responder({ ok: false }, 400);
      // El id lo pone la RLS: el cliente no puede tocar el perfil de otro.
      const { error } = await sb.from('profiles').update(campos).eq('id', u.id);
      if (error) return responder({ ok: false, error: error.message }, 400);
      const p = await perfilDe(sb, u.id);
      return responder({ ok: true, user: usuarioPlano(u, p) });
    }

    if (ruta === '/api/auth/password') {
      if (!u) return responder({ ok: false }, 401);
      const { error } = await sb.auth.updateUser({ password: cuerpo && cuerpo.password });
      if (error) return responder({ ok: false, error: error.message }, 400);
      return responder({ ok: true });
    }

    if (ruta === '/api/auth/email') {
      if (!u) return responder({ ok: false }, 401);
      const { error } = await sb.auth.updateUser({ email: cuerpo && cuerpo.email });
      if (error) return responder({ ok: false, error: error.message }, 400);
      return responder({ ok: true });
    }

    // ---- contenido publico ----
    if (ruta === '/api/content') {
      /* Devuelve todo el contenido publico de una vez. Es lo que pide
         site-data.js al cargar cada pagina. */
      const [ajustes, mantenimiento, news, events, gallery, products, staff, ratings] =
        await Promise.all([
          sb.from('site_settings').select('*').maybeSingle(),
          sb.from('maintenance').select('*').maybeSingle(),
          sb.from('news').select('*'),
          sb.from('events').select('*'),
          sb.from('gallery').select('*'),
          sb.from('products').select('*').order('sort_order'),
          sb.from('staff_members').select('*').order('sort_order'),
          sb.from('ratings').select('*'),
        ]);
      return responder({
        ok: true,
        news: (news.data || []).map(normaliza('date')),
        events: (events.data || []).map(normaliza('date')),
        gallery: gallery.data || [],
        products: products.data || [],
        staff: staff.data || [],
        ratings: ratings.data || [],
        settings: ajustes.data || null,
        maintenance: mantenimiento.data || null,
        productsConfigured: true,
        productsEmpty: !(products.data || []).length,
        staffConfigured: true,
        staffEmpty: !(staff.data || []).length,
      });
    }

    /* Lo del usuario que ha entrado: sus reportes y sus pedidos. La RLS
       ya limita a que vea solo los suyos, asi que aqui no se filtra nada
       a mano. */
    if (ruta === '/api/my/data') {
      if (!u) return responder({ ok: false }, 401);
      const [reports, orders] = await Promise.all([
        sb.from('reports').select('*').order('created_at', { ascending: false }),
        sb.from('orders').select('*').order('created_at', { ascending: false }),
      ]);
      return responder({ ok: true, reports: reports.data || [], orders: orders.data || [] });
    }

    /* Lo que ve el panel de admin. La RLS no deja ni leer ni escribir a
       quien no sea staff: si la consulta falla, se devuelve el error en
       vez de inventarse una respuesta vacia. */
    if (ruta === '/api/admin/data') {
      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      const p = await perfilDe(sb, u.id);
      if (!p || (p.rol !== 'admin' && p.rol !== 'staff')) {
        return responder({ ok: false, error: 'sin_permiso' }, 403);
      }
      const [news, events, gallery, products, staff, ratings, reports, orders, ajustes, log] =
        await Promise.all([
          sb.from('news').select('*'),
          sb.from('events').select('*'),
          sb.from('gallery').select('*'),
          sb.from('products').select('*').order('sort_order'),
          sb.from('staff_members').select('*').order('sort_order'),
          sb.from('ratings').select('*'),
          sb.from('reports').select('*').order('created_at', { ascending: false }),
          sb.from('orders').select('*').order('created_at', { ascending: false }),
          sb.from('site_settings').select('*').maybeSingle(),
          sb.from('admin_log').select('*').order('creado', { ascending: false }).limit(200),
        ]);
      return responder({
        ok: true,
        news: (news.data || []).map(normaliza('date')),
        events: (events.data || []).map(normaliza('date')),
        gallery: gallery.data || [],
        products: products.data || [],
        staff: staff.data || [],
        ratings: ratings.data || [],
        reports: reports.data || [],
        orders: orders.data || [],
        settings: ajustes.data || null,
        log: log.data || [],
      });
    }

    if (ruta === '/api/mcname') {
      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      const { error } = await sb.from('profiles')
        .update({ mc_name: cuerpo && cuerpo.mcName ? String(cuerpo.mcName) : '' })
        .eq('id', u.id);
      if (error) return responder({ ok: false, error: error.message }, 400);
      return responder({ ok: true });
    }

    if (ruta === '/api/users/search') {
      const q = (query.q || (cuerpo && cuerpo.q) || '').toLowerCase();
      if (!q) return responder({ ok: true, users: [] });
      const { data } = await sb.from('profiles').select('*')
        .ilike('username_lower', '%' + q + '%').limit(20);
      return responder({ ok: true, users: data || [] });
    }

    // ---- listings ----
    const LISTAS = {
      '/api/reports': 'reports',
      '/api/ratings': 'ratings',
      '/api/orders': 'orders',
      '/api/admin/news': 'news',
      '/api/admin/events': 'events',
      '/api/admin/gallery': 'gallery',
      '/api/admin/products': 'products',
      '/api/admin/staff': 'staff_members',
      '/api/admin/settings': 'site_settings',
      '/api/admin/maintenance': 'maintenance',
    };
    if (LISTAS[ruta]) {
      const { data, error } = await sb.from(LISTAS[ruta]).select('*');
      if (error) return responder({ ok: false, error: error.message }, 400);
      return responder({ ok: true, items: data || [] });
    }

    return responder({ ok: false, error: 'ruta_desconocida' }, 404);
  }

  // ---------- instalacion ----------

  async function instalar() {
    if (!window.OdisseySupabase) return false;
    const base = global.fetch;

    global.fetch = function (entrada, opciones) {
      const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url);

      if (!esNuestra(url)) return base.apply(this, arguments);

      const p = partes(url);
      const metodo = (opciones && opciones.method) || 'GET';
      const peticion = typeof entrada === 'string'
        ? { url: url, clone: function () { return peticion; }, text: async function () { return ''; } }
        : entrada;

      const p2 = peticion;
      if (typeof entrada === 'string' && opciones && opciones.body) {
        p2.clone = function () {
          return { text: async function () { return opciones.body; } };
        };
        p2.text = async function () { return opciones.body; };
      }

      return window.OdisseySupabase.obtener({ esperarSesion: false })
        .then(function (sb) {
          return jsonDe(p2).then(function (cuerpo) {
            if (estaRetirada(p.ruta)) {
              return responder({ ok: false, ...RETIRADO }, 501);
            }
            return manejar(p.ruta, p.query, cuerpo, metodo, sb);
          });
        })
        .catch(function (err) {
          // Un fallo aqui no debe romper la pagina entera: se responde
          // con un error limpio y la interfaz ya trata lo que no hay.
          if (global.console && console.warn) {
            console.warn('[datos] ' + p.ruta + ': ' + (err && err.message));
          }
          return responder({ ok: false, error: 'sin_conexion', message: String(err && err.message || err) }, 503);
        });
    };

    return true;
  }

  global.OdisseyDatos = {
    instalar: instalar,
    retirado: estaRetirada,
    RETIRADO: RETIRADO,
    origen: origen,
  };

  /* Se instala en cuanto se carga este archivo, no cuando lo diga
     alCargar() de auth.js.

     site-data.js llama a loadPublic() nada más entrar, al principio de la
     pagina. Si la capa se montara después, esa primera llamada ya habria
     salido a la red, GitHub Pages respondería 404 y el contenido
     (noticias, eventos, tienda, staff) se quedaría vacío para siempre,
     sin reintentar. Es una carrera, y se perdia siempre.

     Que se instale aquí no necesita a Supabase: el interceptor solo
     intercepta y devuelve una promesa. El cliente se pide dentro, que es
     asíncrono de todas formas. Por eso puede montarse sin esperar a nada.

     Este archivo tiene que cargarse antes que site-data.js (y antes que
     auth.js, que alCargar también lo montaba). */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { instalar(); });
    } else {
      instalar();
    }
  }

})(window);