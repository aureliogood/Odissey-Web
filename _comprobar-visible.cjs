/* =============================================================
   _comprobar-visible.cjs

   QUE HACE Y POR QUE EXISTE

   El CSS del sitio pone "opacity: 0" a todo elemento que lleva la
   clase ".reveal", y solo se ven cuando el JavaScript les anade
   ".visible". Es decir: el contenido esta OCULTO por defecto y se
   enseña por codigo.

   El dia que ese codigo fallo (se perdio una linea al mover el
   observer a js/animacion.js) la pagina entero se quedo en blanco:
   se veia el fondo y la barra de navegacion, pero ni una linea de
   contenido. Ese es el peor tipo de fallo posible, porque el HTML
   esta perfecto, los enlaces funcionan y no hay ningun error visible
   en la consola.

   Este script carga cada pagina de verdad (con jsdom y un servidor
   HTTP propio, para que carguen tambien los <script src>) y
   comprueba que ningun ".reveal" se queda sin ver.

   Ademas, a proposito, se ejecuta SIN IntersectionObserver. Ese es
   el caso peligroso: si el observer no existe, el camino de reserva
   tiene que ensenar el contenido igualmente.

   COMO SE EJECUTA
       node _comprobar-visible.cjs

   Necesita jsdom:
       npm install --no-save jsdom

   Codigo de salida: 0 si todo bien, 1 si algo falla.
   ============================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');

const RAIZ = __dirname;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/* El tiempo que se espera antes de mirar. Tiene que ser MAS grande
   que la red de seguridad de js/animacion.js (2.5 s), porque si no
   se miraria antes de que tenga efecto y saltaria un falso positivo. */
const ESPERA_MS = 3200;

const servidor = http.createServer(function (req, res) {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const limpio = rel === '/' ? '/index.html' : rel;
  const destino = path.join(RAIZ, limpio);
  if (!destino.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
  fs.readFile(destino, function (err, buf) {
    if (err) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream',
    });
    res.end(buf);
  });
});

function esperar(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

/* Errores que no son culpa de la pagina: son del entorno de pruebas. */
const RUIDO = [
  /Not implemented/,       // canvas, navegacion: jsdom no lo trae
  /Could not parse CSS/,   // css moderno que jsdom no entiende
  /Could not load (img|link)/,
  /fetch|NetworkError/i,   // la API del bot no existe aqui
];

/* Esta comprobacion es sobre NUESTRO contenido: que se vea y que el
   JavaScript no falle. No debería depender de que un servidor de
   terceros este en pie.

   Con el captcha de Cloudflare, jsdom intentaba descargar
   challenges.cloudflare.com y ejecutar su codigo minificado, que usa
   APIs que jsdom no tiene. Quebraba 14 de las 19 paginas enteras sin
   que hubiera ni un solo fallo nuestro.

   Aqui se cortan las peticiones a otros dominios devolviendo un
   script vacio: el <div> del captcha se queda sin pintar y el resto de
   la pagina se comprueba igual. De paso el chequeo deja de hacer
   peticiones fuera, asi que va mas rapido y no se cae si Cloudflare
   tiene un mal dia.

   NO se filtra el error por texto: el script de Cloudflare esta
   minificado y su error es "s[dp(...)][dp(...)] is not a function",
   que no dice de quien es. Si el script ni llega a cargarse, el error
   no se produce y no hay que adivinar. */
const sinTerceros = requestInterceptor(function (request) {
  const url = request.url;
  if (url.indexOf('127.0.0.1') !== -1 || url.indexOf('localhost') !== -1) return undefined;
  return new Response('', { headers: { 'Content-Type': 'application/javascript' } });
});

async function comprobar(f, base) {
  const errores = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) {
    const m = e.message || String(e);
    if (RUIDO.some(function (r) { return r.test(m); })) return;
    errores.push(m.split('\n')[0]);
  });
  vc.on('error', function (m) {
    const t = String(m);
    if (RUIDO.some(function (r) { return r.test(t); })) return;
    errores.push('console: ' + t.slice(0, 160));
  });

  const dom = new JSDOM(fs.readFileSync(f, 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    resources: { interceptors: [sinTerceros] },
    virtualConsole: vc,
    url: base + '/' + f,
    beforeParse: function (w) {
      /* Sin IntersectionObserver A PROPOSITO. Es el caso peligroso:
         si el navegador no lo tiene, el contenido tiene que verse
         igualmente por el camino de reserva. */
      if (!w.matchMedia) {
        w.matchMedia = function () {
          return { matches: false, addListener: function () { }, removeListener: function () { } };
        };
      }
      w.scrollTo = function () { };
      w.HTMLElement.prototype.scrollIntoView = function () { };
      Object.defineProperty(w.navigator, 'serviceWorker', {
        value: { register: function () { return Promise.resolve(); } },
        configurable: true,
      });
      // La API del bot no existe: se responde 404 a todo.
      w.fetch = function () {
        return Promise.resolve({
          ok: false, status: 404,
          json: function () { return Promise.resolve({}); },
          text: function () { return Promise.resolve(''); },
          clone: function () { return this; },
        });
      };
    },
  });

  await esperar(ESPERA_MS);

  const d = dom.window.document;
  const reveal = d.querySelectorAll('.reveal');
  const visibles = d.querySelectorAll('.reveal.visible');
  const h1 = d.querySelector('h1');
  const texto = (d.body.textContent || '').replace(/\s+/g, ' ').trim();

  const r = {
    reveal: reveal.length,
    visibles: visibles.length,
    h1: h1 ? h1.textContent.trim().slice(0, 30) : '',
    caracteres: texto.length,
    errores: errores,
  };
  dom.window.close();
  return r;
}

servidor.listen(0, '127.0.0.1', async function () {
  const base = 'http://127.0.0.1:' + servidor.address().port;
  const paginas = fs.readdirSync(RAIZ)
    .filter(function (f) { return f.endsWith('.html'); })
    .sort();

  let fallos = 0;

  for (const f of paginas) {
    let r;
    try { r = await comprobar(f, base); }
    catch (e) {
      console.log('FALLA ' + f + ' -> no se pudo cargar: ' + e.message);
      fallos++;
      continue;
    }

    const problemas = [];
    if (r.reveal && r.visibles !== r.reveal) {
      problemas.push('CONTENIDO INVISIBLE: ' + r.reveal + ' .reveal y solo ' +
        r.visibles + ' visibles');
    }
    if (!r.h1) problemas.push('sin h1');
    if (r.caracteres < 800) problemas.push('solo ' + r.caracteres + ' caracteres de texto');
    if (r.errores.length) problemas.push('JS: ' + r.errores[0]);

    if (problemas.length) {
      fallos++;
      console.log('FALLA ' + f + ' -> ' + problemas.join(' | '));
    } else {
      console.log('ok    ' + f + '  (' + r.caracteres + ' caracteres' +
        (r.reveal ? ', ' + r.visibles + '/' + r.reveal + ' reveal visibles' : '') + ')');
    }
  }

  console.log('');
  if (fallos === 0) {
    console.log('Ningun problema: todas las paginas enseñan su contenido.');
  } else {
    console.log('Paginas con problema: ' + fallos);
  }
  servidor.close();
  if (fallos) process.exitCode = 1;
});