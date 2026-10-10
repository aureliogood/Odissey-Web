// Captura limpia del login y del registro CON el captcha puesto, sin
// enviar nada, para mirar como queda.
var http = require('http'), fs = require('fs'), path = require('path');
var puppeteer = require('puppeteer');
var RAIZ = process.cwd();
var CONFIG = path.join(RAIZ, 'site-config.js');
var ORIGINAL = fs.readFileSync(CONFIG, 'utf8');
var SALIDA = path.join(process.env.TEMP, 'opencode', 'capturas');
if (!fs.existsSync(SALIDA)) fs.mkdirSync(SALIDA, { recursive: true });

var T = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json',
};
var servidor = http.createServer(function (q, r) {
  var rel = decodeURIComponent(q.url.split('?')[0]);
  if (rel.indexOf('/bot/') === 0) {
    r.writeHead(200, { 'Content-Type': 'application/json' });
    r.end('{"ok":false}');
    return;
  }
  if (rel === '/') rel = '/index.html';
  fs.readFile(path.join(RAIZ, rel), function (e, b) {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': T[path.extname(rel)] || 'application/octet-stream' });
    r.end(b);
  });
});
function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

servidor.listen(0, '127.0.0.1', async function () {
  var base = 'http://127.0.0.1:' + servidor.address().port;
  // Clave de prueba visible.
  var c = fs.readFileSync(CONFIG, 'utf8');
  fs.writeFileSync(CONFIG, c.replace(/turnstileSiteKey:\s*'[^']*'/, "turnstileSiteKey: '1x00000000000000000000AA'"), 'utf8');

  var nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    for (var v of [{ n: 'movil', w: 390, h: 844 }, { n: 'escritorio', w: 1280, h: 900 }]) {
      var p = await nav.newPage();
      await p.setViewport({ width: v.w, height: v.h });
      await p.evaluateOnNewDocument(function (b) { window.API_BASE = b + '/bot'; }, base);
      await p.goto(base + '/index.html', { waitUntil: 'networkidle2' });
      await p.evaluate(function () { window.openLoginModal(); });
      await esperar(5000);
      // Se acepta el banner de cookies para que no tape el boton.
      await p.evaluate(function () {
        var b = document.querySelector('#cookie-banner');
        if (b) { var a = b.querySelector('button:not(.cb-reject), .cb-accept'); if (a) a.click(); else b.remove(); }
      });
      await esperar(600);
      await p.screenshot({ path: path.join(SALIDA, 'final-login-' + v.n + '.png') });

      await p.evaluate(function () {
        document.querySelector('#loginModal [data-auth-view="registro"]').click();
      });
      await esperar(4000);
      await p.screenshot({ path: path.join(SALIDA, 'final-registro-' + v.n + '.png') });
      console.log('capturas de ' + v.n + ' listas');
      await p.close();
    }
  } finally {
    fs.writeFileSync(CONFIG, ORIGINAL, 'utf8');
    await nav.close();
    servidor.close();
  }
});