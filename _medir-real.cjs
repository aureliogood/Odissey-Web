// Mide el login en un Chrome de verdad y hace capturas.
// jsdom no maqueta, asi que esta es la unica forma de ver el ancho real
// de las cajas, el desbordamiento y los tamanos de toque.
var http = require('http'), fs = require('fs'), path = require('path');
var puppeteer = require('puppeteer');
var RAIZ = process.cwd();
var SALIDA = path.join(process.env.TEMP, 'opencode', 'capturas');
if (!fs.existsSync(SALIDA)) fs.mkdirSync(SALIDA, { recursive: true });

var TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
var servidor = http.createServer(function (req, res) {
  var rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  fs.readFile(path.join(RAIZ, rel), function (err, buf) {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  });
});
function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var fallos = 0;
function ok(c, t) { if (!c) fallos++; console.log((c ? '  ok   ' : '  FALLA ') + t); return c; }

// Lo que se mide: ancho real de cada caja, si desborda su contenedor, y
// si el texto tapa los iconos.
var MEDIR = [
  '.auth-tabs', '.auth-tab', '.auth-field', '.auth-label', '.auth-input-wrap',
  '.auth-input', '.auth-input-icon', '.auth-ver', '.auth-ver svg', '.auth-boton',
  '.auth-sub', '.auth-title', '.auth-pie', '.auth-ayuda',
];

servidor.listen(0, '127.0.0.1', async function () {
  var base = 'http://127.0.0.1:' + servidor.address().port;
  var navegador = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });

  var vistas = [
    { nombre: 'movil', w: 390, h: 844, dsf: 2 },
    { nombre: 'movil-pequeno', w: 320, h: 640, dsf: 2 },
    { nombre: 'tablet', w: 768, h: 1024, dsf: 1 },
    { nombre: 'escritorio', w: 1280, h: 900, dsf: 1 },
  ];

  for (var v of vistas) {
    var pagina = await navegador.newPage();
    await pagina.setViewport({ width: v.w, height: v.h, deviceScaleFactor: v.dsf });
    await pagina.goto(base + '/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
    // El login se pinta al pedirlo, como lo haria el visitante. La
    // funcion openLoginModal la define cada pagina, no auth.js, asi que
    // se llama a la global; si no existe se cae al boton de la cabecera.
    await pagina.evaluate(function () {
      if (typeof window.openLoginModal === 'function') {
        window.openLoginModal();
        return;
      }
      var b = document.querySelector('[data-open-login], #navLoginBtn, .nav-user-btn');
      if (b) b.click();
    });
    await esperar(700);
    // El banner de cookies tapa el boton de enviar en la captura. Se
    // acepta para quitarlo de en medio: si no, la foto del login
    // sale tapada y no se puede revisar.
    await pagina.evaluate(function () {
      var b = document.querySelector('#cookie-banner');
      if (!b) return;
      var acepta = b.querySelector('button:not(.cb-reject), .cb-accept, [data-accept]');
      if (acepta) acepta.click();
      else b.remove();
    });
    await esperar(500);
    // Si sigue oculto, es que la pagina no lo abrio: hay que saberlo
    // en vez de medir cajas de tamano 0 y concluir que todo esta bien.
    var abierto = await pagina.evaluate(function () {
      var m = document.getElementById('loginModal');
      if (!m) return 'no existe #loginModal';
      var c = m.querySelector('.login-card, .auth-window') || m;
      var r = c.getBoundingClientRect();
      var c2 = getComputedStyle(c);
      return {
        visible: r.width > 0 && r.height > 0 && c2.visibility !== 'hidden' && c2.display !== 'none' && c2.opacity !== '0',
        ancho: Math.round(r.width), alto: Math.round(r.height),
        display: c2.display, visibility: c2.visibility, opacity: c2.opacity,
      };
    });
    ok(abierto.visible && abierto.ancho > 100,
      'el login esta abierto y se ve (' + JSON.stringify(abierto) + ')');
    if (!abierto.visible || abierto.ancho <= 100) {
      await pagina.screenshot({ path: path.join(SALIDA, 'login-' + v.nombre + '-CERRADO.png') });
      console.log('       captura del login cerrado: ' + v.nombre + '-CERRADO.png');
      await pagina.close();
      continue;
    }

    console.log('');
    console.log('=== ' + v.nombre + ' (' + v.w + 'x' + v.h + ')');

    var datos = await pagina.evaluate(function (medir) {
      function caja(sel) {
        var e = document.querySelector('#loginModal ' + sel);
        if (!e) return null;
        var r = e.getBoundingClientRect();
        var c = getComputedStyle(e);
        return {
          sel: sel,
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right), bottom: Math.round(r.bottom),
          fuente: parseFloat(c.fontSize),
          display: c.display, position: c.position,
          overflow: r.right > window.innerWidth + 0.5,
          texto: (e.textContent || '').trim().slice(0, 30),
        };
      }
      var fuera = [];
      document.querySelectorAll('#loginModal *').forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
          fuera.push((e.className || e.tagName) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
        }
      });
      return {
        cajas: medir.map(caja).filter(Boolean),
        desbordes: fuera,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        loginVisible: !!document.querySelector('#loginModal .login-card, #loginModal .auth-window'),
        titulo: (document.querySelector('#loginModal h1, #loginModal h2') || {}).textContent || '',
      };
    }, MEDIR);

    // Que no haya scroll horizontal: es el sintoma de que algo se sale.
    ok(datos.scrollW <= datos.innerW + 1,
      'sin scroll horizontal (scrollWidth ' + datos.scrollW + ' <= ' + datos.innerW + ')');
    ok(datos.desbordes.length === 0,
      'ninguna caja se sale de la pantalla' +
      (datos.desbordes.length ? ': ' + datos.desbordes.slice(0, 4).join(' | ') : ''));

    var anchoPantalla = v.w;
    datos.cajas.forEach(function (c) {
      console.log('       ' + c.sel.padEnd(18) + (c.w + 'x' + c.h).padStart(10) +
        '  x=' + String(c.x).padStart(4) + '  ' + c.display);
    });

    var porSel = {};
    datos.cajas.forEach(function (c) { porSel[c.sel] = c; });

    if (porSel['.auth-input-wrap'] && porSel['.auth-input']) {
      var wrap = porSel['.auth-input-wrap'], inp = porSel['.auth-input'];
      console.log('');
      console.log('       wrap  ' + wrap.w + 'px   input ' + inp.w + 'px');
      ok(Math.abs(inp.w - wrap.w) <= 2,
        'el input ocupa todo el ancho del recuadro (' + inp.w + ' vs ' + wrap.w + ')');
    }
    if (porSel['.auth-input-icon'] && porSel['.auth-input']) {
      var ic = porSel['.auth-input-icon'];
      var dentro = ic.right <= porSel['.auth-input'].right + 1;
      ok(dentro, 'el icono cabe dentro del campo (icono hasta ' + ic.right + ', campo hasta ' + porSel['.auth-input'].right + ')');
      ok(ic.w <= 24 && ic.h <= 24, 'el icono mide ' + ic.w + 'x' + ic.h + ' (no se ha estirado)');
    }
    if (porSel['.auth-ver']) {
      ok(porSel['.auth-ver'].w >= 44 && porSel['.auth-ver'].h >= 44,
        'el boton de ver clave es ' + porSel['.auth-ver'].w + 'x' + porSel['.auth-ver'].h + ' (min 44)');
    }
    ['.auth-input', '.auth-tab', '.auth-boton'].forEach(function (s) {
      if (porSel[s]) {
        ok(porSel[s].h >= 44, s + ' alto ' + porSel[s].h + 'px (min 44 para el dedo)');
      }
    });
    // La etiqueta tiene que caber en una linea: si envuelve, descuadra.
    if (porSel['.auth-label']) {
      ok(porSel['.auth-label'].h < 40, 'la etiqueta cabe en una linea (' + porSel['.auth-label'].h + 'px)');
    }
    // La tarjeta tiene un ancho maximo a proposito (no se estira en
    // pantallas grandes para que las lineas no sean larguisimas). Solo
    // se comprueba que en movil no se quede estrecha.
    var tarjeta = porSel['.auth-input-wrap'];
    if (tarjeta && anchoPantalla <= 500) {
      ok(tarjeta.w >= anchoPantalla * 0.6,
        'en movil el campo aprovecha la pantalla (' + tarjeta.w + 'px de ' + anchoPantalla + ')');
    }

    // Separacion vertical: los bloques del formulario no pueden quedar
    // pegados. Con el boton a ancho completo se notaba mucho: tocaba el
    // campo de arriba y la linea del pie.
    var vertical = await pagina.evaluate(function () {
      function y(sel) {
        var e = document.querySelector('#loginModal ' + sel);
        return e ? e.getBoundingClientRect() : null;
      }
      var salida = [];
      var etiquetas = Array.prototype.map.call(
        document.querySelectorAll('#loginModal .auth-field'), function (f) {
          return {
            wrap: f.querySelector('.auth-input-wrap').getBoundingClientRect(),
            alto: f.getBoundingClientRect().height,
          };
        });
      var boton = document.querySelector('#loginModal .auth-boton').getBoundingClientRect();
      var pie = document.querySelector('#loginModal .auth-pie').getBoundingClientRect();
      salida.push({ tipo: 'campo1-fin -> campo2-inicio', hueco: etiquetas[1].wrap.top - etiquetas[0].wrap.bottom });
      salida.push({ tipo: 'campo2-fin -> boton', hueco: boton.top - etiquetas[1].wrap.bottom });
      salida.push({ tipo: 'boton-fin -> pie', hueco: pie.top - boton.bottom });
      return salida;
    });
    console.log('       huecos verticales: ' +
      vertical.map(function (v) { return v.tipo + ' = ' + Math.round(v.hueco) + 'px'; }).join(' | '));
    vertical.forEach(function (v) {
      ok(v.hueco >= 8, v.tipo + ': ' + Math.round(v.hueco) + 'px de aire (min 8)');
    });

    // Captura para mirarla a ojo.
    var archivo = path.join(SALIDA, 'login-' + v.nombre + '.png');
    await pagina.screenshot({ path: archivo });
    console.log('       captura: ' + archivo);

    // El registro es la otra mitad del login: mas campos, mas largo y
    // con el texto de ayuda de la contraseña. Si no se mira, se quedan
    // cosas rotas sin enterarse.
    if (v.nombre === 'movil' || v.nombre === 'escritorio') {
      await pagina.evaluate(function () {
        document.querySelector('#loginModal [data-auth-view="registro"]').click();
      });
      await esperar(500);
      var archivoReg = path.join(SALIDA, 'login-registro-' + v.nombre + '.png');
      await pagina.screenshot({ path: archivoReg });
      console.log('       captura: ' + archivoReg);
    }

    // Modo claro: los colores propios desaparecen y quedan los valores
    // por defecto. Es donde mas se rompe el contraste sin avisar.
    var claro = await pagina.evaluate(function () {
      document.documentElement.classList.add('theme-light');
      return getComputedStyle(document.body).backgroundColor;
    });
    await esperar(400);
    var archivoClaro = path.join(SALIDA, 'login-claro-' + v.nombre + '.png');
    await pagina.screenshot({ path: archivoClaro });
    console.log('       captura: ' + archivoClaro + '   (fondo ' + claro + ')');
    await pagina.evaluate(function () {
      document.documentElement.classList.remove('theme-light');
    });
    await esperar(300);
    await pagina.close();
  }

  await navegador.close();
  servidor.close();
  console.log('');
  console.log(fallos === 0 ? 'TODO CORRECTO' : 'FALLOS: ' + fallos);
});