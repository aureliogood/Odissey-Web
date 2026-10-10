// Contraste REAL: lee los colores que el navegador ha calculado, no los
// que pone el CSS. Importa porque una regla con #loginModal en dala.css
// puede ganar a otra sin id en auth.css, y entonces el color que se ve
// no es el que habiamos escrito.
var http = require('http'), fs = require('fs'), path = require('path');
var puppeteer = require('puppeteer');
var RAIZ = process.cwd();
var T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
var servidor = http.createServer(function (q, r) {
  var rel = decodeURIComponent(q.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  fs.readFile(path.join(RAIZ, rel), function (e, b) {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': T[path.extname(rel)] || 'application/octet-stream' });
    r.end(b);
  });
});

function srgb(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function lin(c) { return srgb(c); }
function lum([r, g, b]) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
function ratio(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
function parse(c) {
  var m = c.match(/[\d.]+/g).map(Number);
  return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
}
function sobre(fg, bg, alfa) {
  return [fg.r * alfa + bg[0] * (1 - alfa), fg.g * alfa + bg[1] * (1 - alfa), fg.b * alfa + bg[2] * (1 - alfa)];
}

servidor.listen(0, '127.0.0.1', async function () {
  var base = 'http://127.0.0.1:' + servidor.address().port;
  var nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  var p = await nav.newPage();
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(base + '/index.html', { waitUntil: 'networkidle2' });
  await p.evaluate(function () { window.openLoginModal(); });
  await new Promise(function (r) { setTimeout(r, 500); });

  var datos = await p.evaluate(function () {
    function c(sel, prop, pseudo) {
      var e = document.querySelector('#loginModal ' + sel);
      if (!e) return null;
      return getComputedStyle(e, pseudo || null)[prop];
    }
    var tarjeta = c('.login-card, .auth-window', 'backgroundColor') || c('.auth-field', 'backgroundColor');
    return {
      fondo: tarjeta,
      campo: c('.auth-input', 'backgroundColor'),
      placeholder: c('.auth-input', 'color', '::placeholder'),
      etiqueta: c('.auth-label', 'color'),
      sub: c('.auth-sub', 'color'),
      titulo: c('.auth-title', 'color'),
      tabActiva: c('.auth-tab.is-activa', 'color'),
      tabInactiva: c('.auth-tab:not(.is-activa)', 'color'),
      boton: c('.auth-boton', 'backgroundColor'),
      botonTexto: c('.auth-boton', 'color'),
      ayuda: null,
    };
  });

  // En el registro hay texto de ayuda: se cambia y se mide ahi.
  await p.evaluate(function () {
    document.querySelector('#loginModal [data-auth-view="registro"]').click();
  });
  await new Promise(function (r) { setTimeout(r, 400); });
  datos.ayuda = await p.evaluate(function () {
    var e = document.querySelector('#loginModal .auth-ayuda');
    return e ? getComputedStyle(e).color : null;
  });

  var fondo = parse(datos.fondo);
  // El fondo de la tarjeta es opaco, pero si algún día lleva alfa se
  // compone sobre negro (que es lo que hay detrás del login).
  var fondoArr = [fondo.r, fondo.g, fondo.b];
  if (fondo.a < 1) fondoArr = sobre(fondo, [0, 0, 0], fondo.a);

  console.log('=== CONTRASTE REAL (lo que ve el visitante)');
  console.log('    fondo de la tarjeta: ' + datos.fondo);
  console.log('');

  var fallos = 0;
  function medir(nombre, color, min) {
    if (!color) { console.log('    ' + nombre.padEnd(20) + ' (no existe)'); return true; }
    var c = parse(color);
    if (c.a < 1) c = { r: c.r * c.a + fondoArr[0] * (1 - c.a), g: c.g * c.a + fondoArr[1] * (1 - c.a), b: c.b * c.a + fondoArr[2] * (1 - c.a) };
    var r = ratio([c.r, c.g, c.b], fondoArr);
    var ok = r >= min;
    if (!ok) fallos++;
    console.log('    ' + (ok ? 'ok   ' : 'FALLA') + ' ' + nombre.padEnd(20) +
      r.toFixed(2).padStart(6) + ':1   (min ' + min + ')   ' + color);
    return ok;
  }
  var fallos = 0;
  medir('placeholder', datos.placeholder, 4.5);
  medir('etiqueta', datos.etiqueta, 4.5);
  medir('subtitulo', datos.sub, 4.5);
  medir('titulo', datos.titulo, 4.5);
  medir('ayuda registro', datos.ayuda, 4.5);
  medir('pestana inactiva', datos.tabInactiva, 4.5);
  // El boton: texto sobre su propio fondo dorado.
  if (datos.botonTexto) {
    var f = parse(datos.boton), t = parse(datos.botonTexto);
    if (f.a < 1) f = { r: f.r * f.a + fondoArr[0] * (1 - f.a), g: f.g * f.a + fondoArr[1] * (1 - f.a), b: f.b * f.a + fondoArr[2] * (1 - f.a) };
    var rr = ratio([t.r, t.g, t.b], [f.r, f.g, f.b]);
    console.log('    ' + (rr >= 4.5 ? 'ok   ' : 'FALLA') + ' ' + 'texto del boton'.padEnd(20) +
      rr.toFixed(2).padStart(6) + ':1   (min 4.5)   ' + datos.botonTexto + ' sobre ' + datos.boton);
    if (rr < 4.5) fallos++;
  }

  await nav.close();
  servidor.close();
  console.log('');
  console.log(fallos === 0 ? 'Todo pasa' : 'FALLOS: ' + fallos);
});