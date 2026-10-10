// Prueba del captcha en un Chrome de verdad, con las claves de prueba de
// Cloudflare.
//
// Las peticiones se comprueban INTERCEPTANDO lo que sale del navegador
// (page.on('request')), no con un servidor mock. La primera version
// usaba un servidor propio, pero el puerto 3000 ya lo ocupa otro
// proceso (el bot de desarrollo) y las peticiones POST no llegaban: se
// perdian en el conflicto de puertos y el test daba "0 peticiones
// enviadas" cuando en realidad si se habian enviado.
//
// site-config.js se parchea de verdad y se restaura al final: asi se
// prueba el camino que seguira un visitante, incluido el orden de
// carga de los scripts. Fijar la clave despues de que la pagina ha
// cargado no sirve, porque el login ya se ha pintado sin captcha.
var http = require('http'), fs = require('fs'), path = require('path');
var puppeteer = require('puppeteer');
var RAIZ = process.cwd();
var CONFIG = path.join(RAIZ, 'site-config.js');
var ORIGINAL = fs.readFileSync(CONFIG, 'utf8');
var SALIDA = path.join(process.env.TEMP, 'opencode', 'capturas');
if (!fs.existsSync(SALIDA)) fs.mkdirSync(SALIDA, { recursive: true });

var CLAVE_PASA = '1x00000000000000000000AA';   // siempre pasa, visible
var CLAVE_FALLA = '2x00000000000000000000AB';  // siempre falla, visible

function ponerClave(clave) {
  var c = fs.readFileSync(CONFIG, 'utf8');
  var re = /turnstileSiteKey:\s*'[^']*'/;
  if (!re.test(c)) throw new Error('site-config.js ya no tiene turnstileSiteKey');
  fs.writeFileSync(CONFIG, c.replace(re, "turnstileSiteKey: '" + clave + "'"), 'utf8');
}
function restaurar() { fs.writeFileSync(CONFIG, ORIGINAL, 'utf8'); }

var T = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json',
};

var servidor = http.createServer(function (q, r) {
  var rel = decodeURIComponent(q.url.split('?')[0]);
  // Cualquier llamada a la API se corta aqui: es lo que haria el bot.
  if (/\/bot\//.test(rel)) {
    r.writeHead(401, { 'Content-Type': 'application/json' });
    r.end('{"ok":false,"message":"bot simulado"}');
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
var fallos = 0;
function ok(c, t) { if (!c) fallos++; console.log((c ? '  ok   ' : '  FALLA ') + t); return c; }

servidor.listen(0, '127.0.0.1', async function () {
  var base = 'http://127.0.0.1:' + servidor.address().port;
  var nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  /* Abre la pagina y devuelve un manejador con las peticiones a la API
     que se han visto desde ese momento.

     Se guardan todas las que van a /bot/, pero las de los formularios se
     buscan por endpoint: al cargar la pagina ya salen peticiones sueltas
     al bot (comprobar sesion, ajustes...), y mirar "la primera" daria
     una peticion vacia sin relacion con el captcha. */
  async function abrir(clave) {
    var p = await nav.newPage();
    await p.setViewport({ width: 390, height: 844 });
    var enviada = [];
    var erroresJs = [];
    p.on('request', function (r) {
      if (r.url().indexOf('/bot/') !== -1) {
        enviada.push({ url: r.url(), metodo: r.method(), cuerpo: r.postData() || '' });
      }
    });
    // Un "unhandled rejection" en un pagina se manifiesta years como
    // error en consola y nadie lo nota hasta que algo deja de funcionar.
    // Con el captcha encendido el script de Cloudflare ya se carga y ya
    // puede fallar, asi que se vigila.
    p.on('pageerror', function (e) { erroresJs.push(e.message); });
    await p.evaluateOnNewDocument(function (b) { window.API_BASE = b + '/bot'; }, base);
    await p.goto(base + '/index.html', { waitUntil: 'networkidle2' });
    await p.evaluate(function () { window.openLoginModal(); });
    await esperar(clave ? 5000 : 900);
    return {
      p: p,
      enviada: enviada,
      erroresJs: erroresJs,
      // Solo el POST del formulario indicado.
      envio: function (ruta) {
        return enviada.filter(function (x) {
          return x.metodo === 'POST' && x.url.indexOf(ruta) !== -1;
        });
      },
    };
  }

  try {
    // ---------- 1. INTERRUPTOR APAGADO ----------
    console.log('=== 1. CAPTCHA APAGADO (siteKey vacio): el login sigue funcionando');
    ponerClave('');
    {
      var c = await abrir(false);
      var hueco = await c.p.evaluate(function () {
        var w = document.querySelector('#loginModal .ts-widget');
        if (!w) return { existe: false };
        return { existe: true, oculto: w.hidden || getComputedStyle(w).display === 'none' };
      });
      ok(hueco.existe, 'el hueco existe en el HTML');
      ok(hueco.oculto, 'pero queda oculto: sin siteKey no se ve nada');

      await c.p.evaluate(function () {
        document.getElementById('authLoginIdent').value = 'usuario';
        document.getElementById('authLoginPass').value = 'ClaveLarga123!';
        document.getElementById('authFormLogin').requestSubmit();
      });
      await esperar(1200);
      var e1 = c.envio('/api/auth/login');
      ok(e1.length > 0, 'el envio sale igualmente (' + e1.length + ')');
      ok(e1.length && e1[0].cuerpo.indexOf('turnstile_token') === -1,
        'y sin token: el interruptor deja el sitio como estaba');
      await c.p.close();
    }

    // ---------- 2. ENCENDIDO, SIN TOKEN ----------
    console.log('');
    console.log('=== 2. ENCENDIDO pero SIN token: el envio se BLOQUEA');
    ponerClave(CLAVE_PASA);
    {
      var c = await abrir(true);
      var pintado = await c.p.evaluate(function () {
        var w = document.querySelector('#loginModal .ts-widget');
        return {
          oculto: !w || w.hidden,
          widgets: Object.keys(window.OdisseyTurnstile._interno.widgets).length,
        };
      });
      ok(!pintado.oculto, 'se quita el hidden al montar');
      ok(pintado.widgets >= 1, 'Queda registrado en el modulo');

      // Se invalida el widget a proposito para simular "aun no resuelto".
      await c.p.evaluate(function () {
        var T = window.OdisseyTurnstile;
        T._interno.widgets[Object.keys(T._interno.widgets)[0]].id = 999999;
      });

      await c.p.evaluate(function () {
        document.getElementById('authLoginIdent').value = 'usuario';
        document.getElementById('authLoginPass').value = 'ClaveLarga123!';
        document.getElementById('authFormLogin').requestSubmit();
      });
      await esperar(1200);
      ok(c.envio('/api/auth/login').length === 0, 'NO sale ninguna peticion: se corta antes de la API');
      var aviso = await c.p.evaluate(function () {
        var e = document.getElementById('authErrorLogin');
        return e && !e.hidden ? e.textContent.trim() : '';
      });
      ok(aviso.length > 0, 'se explica por que: "' + aviso + '"');
      await c.p.screenshot({ path: path.join(SALIDA, 'ts-bloqueado.png') });
      await c.p.close();
    }

    // ---------- 3. ENCENDIDO, CON TOKEN ----------
    console.log('');
    console.log('=== 3. ENCENDIDO y con el reto resuelto: sale CON token');
    {
      var c = await abrir(true);
      var token = await c.p.evaluate(function () { return window.OdisseyTurnstile.token(); });
      ok(!!token, 'hay token resuelto (' + (token || 'ninguno') + ')');

      await c.p.evaluate(function () {
        document.getElementById('authLoginIdent').value = 'usuario';
        document.getElementById('authLoginPass').value = 'ClaveLarga123!';
        document.getElementById('authFormLogin').requestSubmit();
      });
      await esperar(1200);
      var e3 = c.envio('/api/auth/login');
      ok(e3.length > 0, 'el envio sale (' + e3.length + ')');
      var cuerpo = e3.length ? e3[0].cuerpo : '';
      ok(cuerpo.indexOf('"turnstile_token"') !== -1, 'el cuerpo lleva turnstile_token');
      ok(cuerpo.indexOf('XXXX.DUMMY.TOKEN.XXXX') !== -1, 'con el valor del token resuelto');
      await c.p.screenshot({ path: path.join(SALIDA, 'ts-ok.png') });
      await c.p.close();
    }

    // ---------- 4. REGISTRO Y CAMBIO DE PESTAÑA ----------
    console.log('');
    console.log('=== 4. El registro va protegido y al cambiar de pestana no se duplica');
    {
      var c = await abrir(true);
      await c.p.evaluate(function () {
        document.querySelector('#loginModal [data-auth-view="registro"]').click();
      });
      await esperar(4000);
      var reg = await c.p.evaluate(function () {
        var w = document.querySelector('#loginModal .ts-widget');
        return {
          total: document.querySelectorAll('#loginModal .ts-widget').length,
          accion: w ? w.dataset.accion : null,
          token: window.OdisseyTurnstile.token(),
        };
      });
      ok(reg.total === 1, 'solo queda UN captcha tras cambiar de pestana (' + reg.total + ')');
      ok(reg.accion === 'registro', 'y es el de registro: "' + reg.accion + '"');
      ok(!!reg.token, 'con su propio token');

      await c.p.evaluate(function () {
        document.getElementById('authRegUser').value = 'usuario';
        document.getElementById('authRegMail').value = 'a@b.com';
        document.getElementById('authRegPass').value = 'ClaveLarga123!';
        document.getElementById('authFormRegistro').requestSubmit();
      });
      await esperar(1200);
      var e4 = c.envio('/api/auth/register');
      ok(e4.length > 0, 'el registro se envia');
      ok(e4.length && e4[0].cuerpo.indexOf('turnstile_token') !== -1,
        'llevando su token');
      await c.p.screenshot({ path: path.join(SALIDA, 'ts-registro.png') });
      await c.p.close();
    }

    // ---------- 5. NINGUN ERROR DE JS CON EL CAPTCHA ENCENDIDO ----------
    console.log('');
    console.log('=== 5. Con el captcha encendido, la pagina no da errores de JS');
    {
      var c = await abrir(true);
      // Se recorre el login entero: pestañas, validacion, toggle de clave.
      await c.p.evaluate(function () {
        var i = document.getElementById('authLoginIdent');
        i.value = '   ';
        i.dispatchEvent(new Event('blur'));
      });
      await esperar(300);
      await c.p.evaluate(function () {
        var v = document.querySelector('#loginModal .auth-ver');
        if (v) v.click();
      });
      await esperar(300);
      await c.p.evaluate(function () {
        document.querySelector('#loginModal [data-auth-view="registro"]').click();
      });
      await esperar(2500);
      await c.p.evaluate(function () {
        document.querySelector('#loginModal [data-auth-view="acceso"]').click();
      });
      await esperar(2500);
      ok(c.erroresJs.length === 0, 'ningun error de JavaScript' +
        (c.erroresJs.length ? ': ' + c.erroresJs.slice(0, 2).join(' | ') : ''));
      await c.p.close();
    }

    // ---------- 6. LA CLAVE SECRETA NO PUEDE ESTAR EN LA WEB ----------
    console.log('');
    console.log('=== 6. La clave secreta no puede estar en la web');
    var secretos = [];
    (function buscar(dir) {
      fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '.publish-tmp') return;
        var f = path.join(dir, e.name);
        if (e.isDirectory()) return buscar(f);
        if (!/\.(js|html|css|json|md)$/i.test(e.name)) return;
        var c = fs.readFileSync(f, 'utf8');
        // Una secret key de Cloudflare son dos bloques de 32 hex.
        var m = c.match(/0x[0-9A-Fa-f]{32}/g);
        if (m) secretos.push(path.relative(RAIZ, f));
      });
    })(RAIZ);
    ok(secretos.length === 0, 'ninguna secret key en la web' +
      (secretos.length ? ': ' + secretos.join(', ') : ''));

    var front = fs.readFileSync(path.join(RAIZ, 'js', 'turnstile.js'), 'utf8');
    // No basta con que no escriba la palabra: tiene que haber una
    // llamada de red a la API de verificacion.
    ok(!/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/.test(front),
      'el frontend NO llama a siteverify (eso es del bot)');
    ok(/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/.test(front),
      'el frontend solo carga el widget, que es lo correcto');
  } finally {
    restaurar();
    await nav.close();
    servidor.close();
  }

  console.log('');
  console.log(fallos === 0 ? 'TODO CORRECTO' : 'FALLOS: ' + fallos);
});