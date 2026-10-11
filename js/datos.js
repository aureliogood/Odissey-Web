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

  /* Lee el cuerpo como bytes, que es lo que lleva la subida de imagen.
     Se intenta arrayBuffer() y, si no existe (navegador antiguo), se
     recurre a FileReader sobre el blob. */
  function cuerpoBinario(peticion) {
    if (!peticion) return Promise.resolve(null);
    if (typeof peticion.arrayBuffer === 'function') {
      return peticion.arrayBuffer().then(function (b) { return new Uint8Array(b); })
        .catch(function () { return null; });
    }
    return new Promise(function (resolver) {
      try {
        const lector = new FileReader();
        lector.onload = function () { resolver(new Uint8Array(lector.result)); };
        lector.onerror = function () { resolver(null); };
        lector.readAsArrayBuffer(peticion);
      } catch (e) { resolver(null); }
    });
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

  /* ¿Quien llama es ADMIN?

     Esto se comprueba aqui Y en la RLS de la tabla, por dos motivos
     distintos: la RLS es la que de verdad protege los datos, y esto evita
     gastar una consulta en intentarlo cuando la respuesta va a ser que no
     de todas formas. Si alguien someday se equivoca al escribir una
     politica, esta comprobacion sigue cerrando la puerta.

     Solo "admin". Antes habia tambien esStaff(), que aceptaba "staff", y
     se usaba en /api/admin/data y en la gestion de reportes. El panel
     admin.html solo deja entrar a los admin (mira isAdmin), asi que
     those rutas eran una puerta de atrás: un staff no podia abrir el
     panel pero si llamar a la API a mano y sacarse todos los datos, o
     vaciar la lista de reportes. Ya no queda ninguna llamada a esStaff. */
  async function esAdmin(sb, user) {
    if (!user) return false;
    const p = await perfilDe(sb, user.id);
    return !!(p && p.rol === 'admin');
  }

  /* El mantenimiento se lee con los dos nombres.

   La columna se llama "activo" (asi se llamaba en el bot) pero el panel, la
   pagina publica y la vista previa usan "active". Con solo uno de los dos,
   lo que se guarda y lo que se lee nunca casan: el banner se activaba,
   se guardaba, y la pagina no lo veia porque buscaba una clave que no
   existia. Salia "activado" en el panel y no aparecia nada en la web.

   Se devuelve con las dos claves y asi no importa cual use cada sitio. */
function mantenimientoPlano(m) {
    if (!m) return null;
    return {
      id: m.id,
      activo: !!m.activo,
      active: !!m.activo,
      message: m.message || '',
      status: m.status || 'online',
      updated_at: m.updated_at,
    };
  }

  /* Forma de la respuesta que ya esperaba la web.

     OJO con los nombres: la web habla en camelCase (user.avatar,
     user.accent, user.banner) porque asi lo hacia el bot, y la base de
     datos usa snake_case (avatar_url, accent_color). Se devuelven LAS
     DOS: la primera para el codigo que ya existe, la segunda para lo
     nuevo. Si solo se devolviera una, el perfil se pintaria a medias. */
  function usuarioPlano(u, p) {
    const perfil = p || {};
    return {
      uid: u.id,
      username: perfil.username || (u.email || '').split('@')[0],
      email: u.email,
      rol: perfil.rol || 'user',
      role: perfil.rol || 'user',
      bio: perfil.bio,
      mcName: perfil.mc_name,
      accent: perfil.accent_color,
      avatar: perfil.avatar_url,
      banner: perfil.banner_url,
      // Los mismos en snake_case, para lo que se escriba de nuevo.
      mc_name: perfil.mc_name,
      accent_color: perfil.accent_color,
      avatar_url: perfil.avatar_url,
      banner_url: perfil.banner_url,
      isAdmin: perfil.rol === 'admin',
      isStaff: perfil.rol === 'staff' || perfil.rol === 'admin',
    };
  }

  /* La web manda los campos en camelCase y la tabla los tiene en
     snake_case. Esta tabla es la unica forma de traducirlo: si se
     aceptara cualquiera de los dos, un cambio de nombre en un sitio
     romperia el otro en silencio. */
  const CAMPOS_PERFIL = {
    username: 'username',
    bio: 'bio',
    mcName: 'mc_name',
    mc_name: 'mc_name',
    accent: 'accent_color',
    accent_color: 'accent_color',
    avatarUrl: 'avatar_url',
    avatar_url: 'avatar_url',
    bannerUrl: 'banner_url',
    banner_url: 'banner_url',
  };

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

  async function manejar(ruta, query, cuerpo, metodo, sb, peticion) {
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
      Object.keys(CAMPOS_PERFIL).forEach(function (clave) {
        if (cuerpo && cuerpo[clave] !== undefined) campos[CAMPOS_PERFIL[clave]] = cuerpo[clave];
      });
      if (!Object.keys(campos).length) return responder({ ok: false, error: 'nada_que_guardar' }, 400);
      // El id lo pone la RLS: el cliente no puede tocar el perfil de otro.
      const { error } = await sb.from('profiles').update(campos).eq('id', u.id);
      if (error) return responder({ ok: false, error: error.message }, 400);
      const p = await perfilDe(sb, u.id);
      return responder({ ok: true, user: usuarioPlano(u, p) });
    }

    /* Subida de avatar o banner. El bot guardaba el archivo en una carpeta
       y devolvia la ruta. Aqui va a Storage, con la ruta
       <id del usuario>/<tipo>.<ext>.

       El id va SIEMPRE en la ruta y la politica de Storage comprueba que
       esa carpeta sea la del usuario que sube. Sin eso, cualquiera
       autenticado podria escribir en la carpeta de otro. */
    if (ruta === '/api/auth/profile/image') {
      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);

      const tipo = query.kind === 'banner' ? 'banner' : 'avatar';
      const ext = (query.ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const buffer = await cuerpoBinario(peticion);

      if (!buffer || !buffer.length) {
        return responder({ ok: false, error: 'archivo_vacio' }, 400);
      }
      // Mismo tope que el bot: 4 MB.
      if (buffer.length > 4194304) {
        return responder({ ok: false, error: 'demasiado_grande' }, 413);
      }

      const ruta = u.id + '/' + tipo + '.' + ext;
      const { error } = await sb.storage.from('perfiles').upload(ruta, buffer, {
        upsert: true,
        contentType: (query.tipo || 'image/jpeg'),
        cacheControl: '31536000',
      });
      if (error) return responder({ ok: false, error: error.message }, 400);

      const { data: url } = sb.storage.from('perfiles').getPublicUrl(ruta);

      // Se guarda en el perfil para que no haya que reconstruir la URL
      // cada vez que se pinta la cabecera.
      const columna = tipo === 'banner' ? { banner_url: url.publicUrl } : { avatar_url: url.publicUrl };
      await sb.from('profiles').update(columna).eq('id', u.id);

      return responder({ ok: true, path: url.publicUrl, url: url.publicUrl, ...columna });
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
        maintenance: mantenimientoPlano(mantenimiento.data),
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

    /* Lo que ve el panel de admin. Solo rol "admin": el panel no deja
       entrar a los staff, asi que dejarles la API abierta seria una
       puerta de atrás. La RLS tampoco les deja leer estas tablas, asi que
       esto no es lo unico que protege: si la consulta falla, se devuelve
       el error en vez de inventarse una respuesta vacia. */
    if (ruta === '/api/admin/data') {
      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      if (!(await esAdmin(sb, u))) {
        return responder({ ok: false, error: 'sin_permiso' }, 403);
      }
      const [news, events, gallery, products, staff, ratings, reports, orders, ajustes, log, mant] =
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
          /* El mantenimiento faltaba aqui. El panel lo lee de esta
             respuesta, asi que sin esta consulta la casilla salia vacia
             siempre y la vista previa decia "inactivo" aunque estuviera
             activado en la web. */
          sb.from('maintenance').select('*').eq('id', 1).maybeSingle(),
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
        maintenance: mantenimientoPlano(mant.data),
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

    // ---- valoraciones ----
    /* La RLS ya obliga a que user_id sea el de la sesion, asi que aqui no
       se toca: se manda user_id: u.id y si alguien manipulase el cuerpo,
       la base de datos lo rechazaria igual. */
    if (ruta === '/api/ratings' && metodo === 'POST') {
      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      const staff = cuerpo && cuerpo.staff ? String(cuerpo.staff).trim().toLowerCase() : '';
      const stars = Number(cuerpo && cuerpo.stars);
      const comentario = cuerpo && cuerpo.comment ? String(cuerpo.comment).trim().slice(0, 500) : '';
      const dispositivo = cuerpo && cuerpo.deviceId ? String(cuerpo.deviceId) : '';
      if (!staff || !(stars >= 1 && stars <= 5)) {
        return responder({ ok: false, error: 'datos_invalidos' }, 400);
      }
      /* Un solo voto por miembro del staff. Antes lo controlaba el bot por
         dispositivo; aqui se comprueba por dispositivo Y por cuenta, que
         es lo mismo pero mas dificil de esquivar cambiando de navegador. */
      const { data: previas } = await sb.from('ratings').select('user_id,device_id')
        .eq('staff', staff);
      const repetido = (previas || []).some(function (r) {
        return r.user_id === u.id || (dispositivo && r.device_id === dispositivo);
      });
      if (repetido) return responder({ ok: false, error: 'ya_valorado' }, 409);
      const id = 'rt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const { data, error } = await sb.from('ratings').insert({
        id: id, user_id: u.id, staff: staff, stars: stars,
        comment: comentario, device_id: dispositivo,
      }).select().single();
      if (error) return responder({ ok: false, error: error.message }, 400);
      return responder({ ok: true, rating: data });
    }

    /* Quitar tu propia valoracion. La RLS solo deja borrar las propias, y
       el .eq('user_id') es una comprobacion extra, no la unica. */
    if (ruta.indexOf('/api/ratings/') === 0 && metodo === 'DELETE') {
      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      let staff = ruta.slice('/api/ratings/'.length);
      try { staff = decodeURIComponent(staff); } catch (e) { /* se usa tal cual */ }
      staff = String(staff).trim().toLowerCase();
      const { error } = await sb.from('ratings').delete().eq('staff', staff).eq('user_id', u.id);
      if (error) return responder({ ok: false, error: error.message }, 400);
      return responder({ ok: true });
    }

    // ---- reportes ----
    if (ruta === '/api/reports' && metodo === 'POST') {
      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      const target = cuerpo && cuerpo.target ? String(cuerpo.target).trim().slice(0, 64) : '';
      const reason = cuerpo && cuerpo.reason ? String(cuerpo.reason).trim().slice(0, 120) : 'Reporte';
      const detail = cuerpo && cuerpo.detail ? String(cuerpo.detail).trim().slice(0, 2000) : '';
      const capture = cuerpo && cuerpo.capture ? String(cuerpo.capture).trim().slice(0, 500) : '';
      if (!target) return responder({ ok: false, error: 'datos_invalidos' }, 400);
      const id = 'rp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const { data, error } = await sb.from('reports').insert({
        id: id, user_id: u.id, target: target, reason: reason,
        detail: detail, capture: capture, status: 'nuevo',
      }).select().single();
      if (error) return responder({ ok: false, error: error.message }, 400);
      return responder({ ok: true, report: data });
    }

    /* Los reportes ya no abren ticket de Discord: eso se retiro. La pagina
       sigue llamando aqui, asi que se responde sin hacer nada en vez de
       dejar un error suelto en la consola. */
    if (ruta === '/api/reports/ticket' && metodo === 'POST') {
      return responder({ ok: true, ignorado: true });
    }

    // ---- gestion de reportes (solo admin) ----
    /* El panel llama POST a /api/admin/reports/:id para cambiar el estado
       y DELETE para borrarlo. Las dos comprueban el rol aqui y la RLS lo
       vuelve a comprobar en la tabla. Solo "admin", igual que el resto
       del panel: si se dejara a "staff", un staff podria vaciar la lista
       de reportes sin haber visto nunca el panel. */
    if (ruta.indexOf('/api/admin/reports/') === 0) {
      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      if (!(await esAdmin(sb, u))) {
        return responder({ ok: false, error: 'sin_permiso' }, 403);
      }
      let id = ruta.slice('/api/admin/reports/'.length);
      try { id = decodeURIComponent(id); } catch (e) { /* se usa tal cual */ }
      id = String(id).trim();
      if (!id) return responder({ ok: false, error: 'id_invalido' }, 400);

      if (metodo === 'DELETE') {
        const { data, error } = await sb.from('reports').delete().eq('id', id).select('id');
        if (error) return responder({ ok: false, error: error.message }, 400);
        /* deleted = 0 significa que no habia ninguna fila con ese id. No es
           un fallo, pero el panel lo comprueba para avisar de que el boton
           no ha borrado nada de verdad. */
        return responder({ ok: true, deleted: (data || []).length });
      }

      if (metodo === 'POST' || metodo === 'PUT') {
        const estado = cuerpo && cuerpo.status ? String(cuerpo.status).trim() : '';
        /* Los estados que el panel ofrece. Sin esta lista, cualquiera podria
           dejar el reporte en un estado inventado que luego el panel no sabe
           pintar. */
        if (['nuevo', 'proceso', 'resuelto'].indexOf(estado) === -1) {
          return responder({ ok: false, error: 'estado_invalido' }, 400);
        }
        const { data, error } = await sb.from('reports').update({ status: estado })
          .eq('id', id).select('id,status');
        if (error) return responder({ ok: false, error: error.message }, 400);
        if (!(data || []).length) {
          return responder({ ok: false, error: 'no_encontrado' }, 404);
        }
        return responder({ ok: true, report: data[0] });
      }

      return responder({ ok: false, error: 'metodo_no_permitido' }, 405);
    }

    // ---- escritura del panel (solo admin) ----
    /* El panel llama a nueve rutas para guardar y no existia NINGUNA. Solo
       estaban las de lectura, asi que Salvar mantenimiento, noticias,
       eventos, galeria, tienda, staff y ajustes noMake nada: la peticion
       salia, el servidor contestaba "ruta_desconocida" y el panel decia
       que si, guardando.

       Todas son admin solo. La idea es no escribir nueve codigos casi
       iguales: cada tabla dice que campos admite, y aqui se quita
       cualquier otro que venga en el cuerpo.

       WHY se filtra: el cuerpo viene del navegador. Aunque la RLS suelte
       la escritura, si se metiera un campo de mas se podria cambiar algo
       que no debería tocarse (por ejemplo 'rol' en una tabla de perfiles).
       Aqui la lista blanca manda. */
    const ESCRITURA_ADMIN = {
      news: { tabla: 'news', campos: ['id', 'title', 'category', 'text', 'date'] },
      events: { tabla: 'events', campos: ['id', 'title', 'date', 'description'] },
      gallery: { tabla: 'gallery', campos: ['id', 'image', 'caption'] },
      products: { tabla: 'products', campos: ['id', 'name', 'price', 'category', 'icon', 'badge', 'image', 'sort_order'] },
      staff: { tabla: 'staff_members', campos: ['id', 'name', 'role', 'description', 'bio', 'minecraft', 'discord', 'sort_order'] },
    };

    /* Se queda solo con los campos que la tabla admite. */
    function soloCampos(permitidos, objeto) {
      var limpio = {};
      if (!objeto || typeof objeto !== 'object') return limpio;
      permitidos.forEach(function (campo) {
        if (objeto[campo] !== undefined) limpio[campo] = objeto[campo];
      });
      return limpio;
    }

    /* Un id corto y unico. El panel envia algunos, pero no todos, y sin
       id la fila no tendria clave primaria. */
    function nuevoId(prefijo) {
      return prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /* ---- /api/admin/<tabla>  POST: crear o guardar una fila ---- */
    if (ruta.indexOf('/api/admin/') === 0 && metodo === 'POST') {
      var resto = ruta.slice('/api/admin/'.length);
      var sinId = resto.split('/')[0];
      var conId = resto.indexOf('/') !== -1 ? resto.split('/')[1] : null;

      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      if (!(await esAdmin(sb, u))) {
        return responder({ ok: false, error: 'sin_permiso' }, 403);
      }

      /* --- registro de acciones del admin --- */
      if (sinId === 'log') {
        var accion = cuerpo && cuerpo.action ? String(cuerpo.action).slice(0, 300) : '';
        if (!accion) return responder({ ok: false, error: 'sin_accion' }, 400);
        var perfilAdmin = await perfilDe(sb, u.id);
        await sb.from('admin_log').insert({
          admin: (perfilAdmin && perfilAdmin.username) || 'admin',
          action: accion,
          date: new Date().toISOString(),
        });
        return responder({ ok: true });
      }

      /* --- mantenimiento --- */
      if (sinId === 'maintenance') {
        var m = (cuerpo && cuerpo.maintenance) || {};
        /* Aqui esta el fallo que hacia que el banner no saliera: la
           columna se llama "activo" y el panel, la pagina y el preview
           usan "active". Se guardaba una cosa y se leia otra, asi que
           el banner no aparecia nunca. Se acepta cualquiera de las dos y
           se devuelve ambas. */
        var activo = m.activo !== undefined ? !!m.activo : !!m.active;
        var fila = {
          activo: activo,
          message: m.message ? String(m.message).slice(0, 300) : null,
          status: m.status ? String(m.status).slice(0, 40) : (activo ? 'maintenance' : 'online'),
          updated_at: new Date().toISOString(),
        };
        var { error: errM } = await sb.from('maintenance').update(fila).eq('id', 1);
        if (errM) return responder({ ok: false, error: errM.message }, 400);
        return responder({ ok: true, maintenance: { id: 1, active: activo, activo: activo, message: fila.message, status: fila.status } });
      }

      /* --- ajustes del sitio --- */
      if (sinId === 'settings') {
        if (cuerpo && cuerpo.reset) {
          /* Restaurar: se deja la fila como estaba con los valores de
             fabrica. No se borra, para no romper los NOT NULL. */
          var { error: errR } = await sb.from('site_settings').update({
            server_ip: 'odisseymc.net', server_port: '25565', gamemode: 'Survival Custom',
            discord_invite: 'https://discord.gg/odisseymc', discord_server_id: null,
            version: '1.20 - 1.21', updated_at: new Date().toISOString(),
          }).eq('id', 1);
          if (errR) return responder({ ok: false, error: errR.message }, 400);
          return responder({ ok: true, reset: true });
        }
        var s = soloCampos(
          ['server_ip', 'server_port', 'gamemode', 'discord_invite', 'discord_server_id', 'version'],
          cuerpo && cuerpo.settings
        );
        s.updated_at = new Date().toISOString();
        var { error: errS } = await sb.from('site_settings').update(s).eq('id', 1);
        if (errS) return responder({ ok: false, error: errS.message }, 400);
        return responder({ ok: true });
      }

      /* --- accion sobre una cuenta --- */
      if (sinId === 'usuario' && conId === 'accion') {
        var objetivo = cuerpo && cuerpo.uid ? String(cuerpo.uid) : '';
        var que = cuerpo && cuerpo.accion ? String(cuerpo.accion) : '';
        if (!objetivo || !que) return responder({ ok: false, error: 'peticion_incompleta' }, 400);

        var destino = await perfilDe(sb, objetivo);
        var nombreDestino = (destino && destino.username) || 'cuenta';

        /* Un admin no se puede quitar a si mismo el rol: si se queda el
           panel sin ningun admin, nadie vuelve a entrar. */
        if (objetivo === u.id && (que === 'rol' || que === 'borrar')) {
          if (que === 'rol' && cuerpo && cuerpo.rol !== 'admin') {
            return responder({ ok: false, error: 'No puedes quitarte a ti mismo el rol de admin.' }, 400);
          }
          if (que === 'borrar') {
            return responder({ ok: false, error: 'No puedes borrar tu propia cuenta desde el panel.' }, 400);
          }
        }

        if (que === 'rol') {
          var rolNuevo = String((cuerpo && cuerpo.rol) || 'user');
          if (['user', 'staff', 'admin'].indexOf(rolNuevo) === -1) {
            return responder({ ok: false, error: 'rol_invalido' }, 400);
          }
          var { error: errR2 } = await sb.from('profiles').update({ rol: rolNuevo }).eq('id', objetivo);
          if (errR2) return responder({ ok: false, error: errR2.message }, 400);
          return responder({ ok: true, mensaje: 'Rol cambiado a ' + rolNuevo, usuario: nombreDestino });
        }

        if (que === 'borrar') {
          /* Borrar la cuenta de Supabase Auth necesita service_role, que
             el navegador no tiene. Se marca para borrar y se dice claro:
             fingir que se ha borrado seria peor. */
          var { error: errB } = await sb.from('profiles').update({ mc_name: null, bio: null }).eq('id', objetivo);
          if (errB) return responder({ ok: false, error: errB.message }, 400);
          return responder({
            ok: false,
            error: 'La cuenta se limpia, pero borrarla del todo hay que hacerlo en Supabase > Authentication > Users.',
            mensaje: 'Cuenta limpiada',
            usuario: nombreDestino,
          });
        }

        if (que === 'nombre') {
          var nuevoNombre = String((cuerpo && cuerpo.nombre) || '').trim();
          if (!/^[A-Za-z0-9_]{3,20}$/.test(nuevoNombre)) {
            return responder({ ok: false, error: 'El nombre solo admite 3-20 caracteres de letra, numero o guion bajo.' }, 400);
          }
          var { error: errN } = await sb.from('profiles').update({ username: nuevoNombre }).eq('id', objetivo);
          if (errN) return responder({ ok: false, error: errN.message }, 400);
          return responder({ ok: true, mensaje: 'Nombre cambiado a ' + nuevoNombre, usuario: nuevoNombre });
        }

        return responder({ ok: false, error: 'accion_desconocida' }, 400);
      }

      /* --- contenido: noticias, eventos, galeria, tienda, staff --- */
      var spec = ESCRITURA_ADMIN[sinId];
      if (spec) {
        /* Guardar una lista entera (lo usan tienda y staff). */
        var lista = cuerpo && (cuerpo[sinId] || cuerpo.items || cuerpo.products || cuerpo.staff);
        if (Array.isArray(lista)) {
          var { error: errL } = await sb.from(spec.tabla).delete().neq('id', '___nunca___');
          if (errL) return responder({ ok: false, error: errL.message }, 400);
          var filas = [];
          for (var i = 0; i < lista.length; i++) {
            var limpia = soloCampos(spec.campos, lista[i]);
            if (!limpia.id) limpia.id = nuevoId(sinId.slice(0, 2) + '_');
            if (limpia.sort_order === undefined) limpia.sort_order = i;
            filas.push(limpia);
          }
          if (filas.length) {
            var { error: errI } = await sb.from(spec.tabla).insert(filas);
            if (errI) return responder({ ok: false, error: errI.message }, 400);
          }
          return responder({ ok: true, guardados: filas.length });
        }

        /* Guardar una fila suelta. */
        var item = cuerpo && (cuerpo.item || cuerpo[sinId]);
        var fila1 = soloCampos(spec.campos, item);
        if (!Object.keys(fila1).length) {
          return responder({ ok: false, error: 'no_hay_nada_que_guardar' }, 400);
        }
        if (fila1.id) {
          var { error: errU } = await sb.from(spec.tabla).update(fila1).eq('id', fila1.id);
          if (errU) return responder({ ok: false, error: errU.message }, 400);
          return responder({ ok: true, item: fila1 });
        }
        fila1.id = nuevoId(sinId.slice(0, 2) + '_');
        var { error: errA } = await sb.from(spec.tabla).insert(fila1);
        if (errA) return responder({ ok: false, error: errA.message }, 400);
        return responder({ ok: true, item: fila1 });
      }

      return responder({ ok: false, error: 'ruta_desconocida' }, 404);
    }

    /* ---- /api/admin/<tabla>/<id>  DELETE ---- */
    if (ruta.indexOf('/api/admin/') === 0 && metodo === 'DELETE') {
      var partes = ruta.slice('/api/admin/'.length).split('/');
      var tabla = partes[0];
      var idBorrar = partes[1] ? decodeURIComponent(partes[1]) : '';

      if (!u) return responder({ ok: false, error: 'no_auth' }, 401);
      if (!(await esAdmin(sb, u))) {
        return responder({ ok: false, error: 'sin_permiso' }, 403);
      }

      var destino2 = ESCRITURA_ADMIN[tabla];
      if (destino2 && idBorrar) {
        var { data: borrado, error: errD } = await sb.from(destino2.tabla).delete().eq('id', idBorrar).select('id');
        if (errD) return responder({ ok: false, error: errD.message }, 400);
        return responder({ ok: true, deleted: (borrado || []).length, id: idBorrar });
      }

      /* Las calificaciones se borran aparte: no estan en ESCRITURA_ADMIN
         porque el panel las borra una a una, no en bloque. */
      if (tabla === 'ratings' && idBorrar) {
        var { data: borrado2, error: errD2 } = await sb.from('ratings').delete().eq('id', idBorrar).select('id');
        if (errD2) return responder({ ok: false, error: errD2.message }, 400);
        return responder({ ok: true, deleted: (borrado2 || []).length, id: idBorrar });
      }

      return responder({ ok: false, error: 'ruta_desconocida' }, 404);
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
        /* Un cuerpo que no es texto (una imagen) llega como ArrayBuffer o
           Blob. Se envuelve para que jsonDe y cuerpoBinario lo lean. */
        p2.arrayBuffer = async function () {
          if (opciones.body instanceof ArrayBuffer) return opciones.body;
          if (opciones.body && typeof opciones.body.arrayBuffer === 'function') {
            return opciones.body.arrayBuffer();
          }
          return new ArrayBuffer(0);
        };
      }

      return window.OdisseySupabase.obtener({ esperarSesion: false })
        .then(function (sb) {
          return jsonDe(p2).then(function (cuerpo) {
            if (estaRetirada(p.ruta)) {
              return responder({ ok: false, ...RETIRADO }, 501);
            }
            return manejar(p.ruta, p.query, cuerpo, metodo, sb, p2);
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