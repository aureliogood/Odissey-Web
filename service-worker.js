// =============================================================
//  Service worker de Odissey
// -------------------------------------------------------------
//  Tres trabajos:
//   1. Instalar la web como app instalable (PWA).
//   2. Precargar lo justo para que la app abra sin conexion.
//   3. Servir desde cache cuando no hay red.
//
//  IMPORTANTE - que NO hace a proposito:
//   - No cachea peticiones que no sean GET. Antes no se comprobaba el
//     metodo y cache.put() con un POST lanzaba "TypeError: Request
//     method POST is unsupported" en cada inicio de sesion, registro,
//     compra o reporte de la web.
//   - No cachea la API (/bot/...). Ahi viven el token de sesion y los
//     datos del usuario: guardarlos en Cache Storage los deja a mano de
//     cualquier script que corra en el mismo origen.
//   - No cachea peticiones de otros dominios (Google Fonts, mc-heads,
//     los CDN de imagenes): de esos ya se encarga la cache HTTP del
//     navegador.
// =============================================================

// Version de la cache. Si cambias un archivo del sitio, sube este numero:
// es lo unico que invalida la cache vieja al activar la nueva version.
// (El ?v=147 de los <link> es otra cosa: solo rompe la cache del
//  navegador, no la de aqui.)
var CACHE_NAME = 'odissey-v174';

var PRECACHE_URLS = [
  './',
  './index.html',

  // Solo los archivos .html, no las rutas limpias: el servidor traduce
  // /tienda a /tienda.html, asi que cache.add de una ruta limpia y la de
  // su .html guardarian DOS entradas en la cache por cada pagina. El
  // gestor de navegacion de mas abajo ya sabe pasar de una a otra cuando
  // no hay red.
  './tienda.html',
  './reglas.html',
  './staff.html',
  './noticias.html',
  './eventos.html',
  './galeria.html',
  './soporte.html',
  './wiki.html',
  './perfil.html',
  './reportes.html',
  './postulaciones.html',
  './404.html',
  './privacidad.html',
  './terminos.html',

  // CSS. css/tailwind.css faltaba y lo cargan todas las paginas: sin el,
  // la app instalada se abria sin estilos.
  './css/tailwind.css',
  './css/odiseo.css',
  './theme.css',
  './css/index.css',
  './css/dala.css',
  './css/dala-liquid.css',
  './css/dala-perfil.css',
  './css/dala-steve.css',
  './css/search.css',
  './css/perfil.css',
  './css/verificacion.css',
  './css/eventos-noticias.css',
  './css/galeria.css',
  './css/reglas.css',
  './css/staff.css',
  './css/soporte.css',
  './css/wiki.css',
  './css/nav-shared.css',
  './css/tienda.css',
  './css/reportes-postulaciones.css',
  './css/texto-legal.css',
  './css/auth.css',
  './css/turnstile.css',

  // JS.
  './auth.js',
  './js/turnstile.js',
  './js/supabase.js',
  './site-config.js',
  './site-data.js',
  './shop-config.js',
  './staff-config.js',
  './js/seguro.js',
  './js/animacion.js',
  './js/formulario.js',
  './js/analitica.js',
  './js/dala-art.js',
  './js/dala-auth-steve.js',
  './js/dala-bg.js',
  './js/dala-hero.js',
  './js/dala-liquid.js',
  './js/dala-nav.js',
  './js/perfil.js',
  './js/search.js',
  './js/verificacion.js',

  // Iconos e imagenes de la app.
  // Nota: admin.css ya no se precarga. Va con admin.html, que es una
  // pagina privada que NUNCA entra en la cache (ver NUNCA_EN_CACHE).
  './manifest.json',
  './img/logo-web.webp',
  './img/favicon-48.png',
  './img/apple-touch-icon.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/og-image.jpg',
  './img/backgrounds/background1.jpg',
];

// Paginas que nunca se precargan ni se sirven desde la cache: son privadas.
// El panel de administracion no debe quedar en la cache del dispositivo:
// si alguien lo abre sin conexion en un movil que no es suyo, tendria las
// pantallas de edicion en pantalla completa.
var NUNCA_EN_CACHE = ['/admin.html', '/admin', '/staffverificar.html', '/staffverificar'];

function esRutaPrivada(ruta) {
  for (var i = 0; i < NUNCA_EN_CACHE.length; i++) {
    if (ruta === NUNCA_EN_CACHE[i] || ruta.indexOf(NUNCA_EN_CACHE[i] + '/') === 0) return true;
  }
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      /* addAll() es todo-o-nada: si UNA URL falla, la instalacion entera se
         cancela y el service worker no llega a activarse. Con allSettled
         cada fallo se ignora y el resto se guarda. */
      return Promise.allSettled(
        PRECACHE_URLS.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' }));
        })
      ).then(function (results) {
        var fallidas = results.filter(function (r) { return r.status === 'rejected'; });
        if (fallidas.length) {
          console.warn('[sw] no se pudieron precachear ' + fallidas.length +
            ' de ' + PRECACHE_URLS.length + ' rutas (se ignoran):',
            PRECACHE_URLS.filter(function (_, i) { return results[i].status === 'rejected'; }));
        }
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      // Sin esto, una version del service worker antigua sigue sirviendo
      // sus archivos cacheados hasta que se cierren todas las pestanas.
      if (self.registration.navigationPreload) {
        return self.registration.navigationPreload.disable();
      }
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* Las rutas limpias que el .htaccess traduce a un .html. Si no hay red y
   el visitante pide /tienda, se le sirve la copia de /tienda.html. */
var PAGINAS = [
  'staff', 'tienda', 'reglas', 'noticias', 'eventos', 'galeria', 'soporte',
  'reportes', 'postulaciones', 'wiki', 'perfil', 'privacidad',
  'terminos',
];

function equivalenteHtml(url) {
  var ruta = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  if (!ruta) return './index.html';
  if (ruta.slice(-5) === '.html') return './' + ruta;
  if (PAGINAS.indexOf(ruta) !== -1) return './' + ruta + '.html';
  return null;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Solo GET. Los POST (login, registro, pedidos, reportes) y los PUT/DELETE
  // van directos al servidor: cache.put() con un POST lanza una excepcion.
  if (req.method !== 'GET') return;

  // Solo http/https: se dejan pasar los esquemas del navegador.
  if (req.url.indexOf('http') !== 0) return;

  // Solo nuestro propio dominio. Las peticiones a otros sitios (Google Fonts,
  // mc-heads.net, flagcdn) las cachea el navegador con su propia cache HTTP,
  // que ademas tiene una cabecera Cache-Control mejor puta.
  if (origenDe(req) !== self.location.origin) return;

  var url = new URL(req.url);

  // La API no se cachea nunca: lleva el token de sesion en la URL y los datos
  // del usuario en la respuesta.
  if (url.pathname.indexOf('/bot') === 0) return;

  // Rutas privadas: nunca ni en cache ni servidas desde ella.
  if (esRutaPrivada(url.pathname)) return;

  var esHtml = req.mode === 'navigate' ||
    req.destination === 'document' ||
    /\.html?($|\?)/i.test(url.pathname);

  /* fetch() normal RESPETA la cache HTTP del navegador, y ahi los .css/.js
     duran una semana. Con cache:'no-cache' la peticion va siempre a la red
     (revalidando), que es lo que se quiere en una web pequena y es lo que
     hace que un F5 normal muestre la version nueva.

     Esto antes se saltaba el HTML: `|| esHtml ? undefined : ...`. O sea,
     justo lo contrario de lo que decia el comentario. GitHub Pages sirve
     el HTML con Cache-Control de 10 minutos, asi que durante esos 10
     minutos un visitante que vuelve ve la pagina VIEJA: los <script> que
     le faltan no se cargan y las cosas nuevas no aparecen. Es
     exactamente "en mi movil no sale, en el tuyo si".

     La cache de aqui solo se usa cuando NO hay red, que es a lo que
     sirve de verdad. */
  var opciones = req.cache === 'only-if-cached' ? undefined : { cache: 'no-cache' };
  void esHtml;

  event.respondWith(
    fetch(req, opciones).then(function (respuesta) {
      if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
        var copia = respuesta.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          // cache.put() es asincrono y puede fallar (cuota llena, por
          // ejemplo). Sin este catch la promesa suelta sale como
          // "unhandled rejection" en la consola.
          return cache.put(req, copia).catch(function () { });
        });
      }
      return respuesta;
    }).catch(function () {
      // Sin red.
      return caches.match(req).then(function (enCache) {
        if (enCache) return enCache;

        if (req.mode === 'navigate') {
          var html = equivalenteHtml(url);
          if (html) {
            return caches.match(html).then(function (pagina) {
              // Si tampoco esta la pagina concreta, la portada: es mejor
              // teach la home que una pantalla en blanco.
              return pagina || caches.match('./index.html');
            });
          }
          return caches.match('./index.html');
        }

        // Un recurso que no se guardo no se puede inventar: se responde con
        // un 504 explicito para que la pagina sepa que no fue un error del
        // servidor, y devuelva el tipo correcto en vez de parsear un "".
        return new Response('', {
          status: 504,
          statusText: 'Sin conexion',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      });
    })
  );
});

function origenDe(req) {
  try {
    return new URL(req.url).origin;
  } catch (e) {
    return '';
  }
}
