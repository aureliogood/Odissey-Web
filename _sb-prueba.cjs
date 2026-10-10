// Prueba de la conexion con Supabase en un Chrome de verdad, contra el
// proyecto real del usuario.
//
// Importante: el proyecto todavia NO tiene las tablas (el usuario tiene
// que ejecutar los SQL). Asi que lo que se comprueba aqui es el camino
// completo hasta donde se puede llegar: que el cliente se crea, que la
// libreria se descarga, que Auth responde y que el login intenta
// autenticarse de verdad contra Supabase (no contra el bot).
var http = require('http'), fs = require('fs'), path = require('path');
var puppeteer = require('puppeteer');
var RAIZ = process.cwd();
var SALIDA = path.join(process.env.TEMP, 'opencode', 'capturas');

var T = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json',
};
var alBot = [];
var servidor = http.createServer(function (q, r) {
  var rel = decodeURIComponent(q.url.split('?')[0]);
  if (rel.indexOf('/bot/') === 0) {
    alBot.push(rel);
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
var fallos = 0;
function ok(c, t) { if (!c) fallos++; console.log((c ? '  ok   ' : '  FALLA ') + t); return c; }

servidor.listen(0, '127.0.0.1', async function () {
  var base = 'http://127.0.0.1:' + servidor.address().port;
  var nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  var p = await nav.newPage();
  await p.setViewport({ width: 390, height: 844 });

  var erroresJs = [];
  p.on('pageerror', function (e) { erroresJs.push(e.message.slice(0, 140)); });

  await p.goto(base + '/index.html', { waitUntil: 'networkidle2' });

  console.log('=== 1. ¿LLEGA LA LIBRERIA DE SUPABASE?');
  var lib = await p.evaluate(function () { return typeof window.supabase; });
  ok(lib === 'object', 'window.supabase existe (' + lib + ')');

  console.log('');
  console.log('=== 2. ¿SE CREA EL CLIENTE?');
  var cfg = await p.evaluate(function () {
    return {
      hayConfig: !!(window.OdisseySupabase && window.OdisseySupabase.hayConfig()),
      url: window.SITE_CONFIG.supabaseUrl,
      claveEmpieza: String(window.SITE_CONFIG.supabaseKey || '').slice(0, 14) + '...',
    };
  });
  ok(cfg.hayConfig, 'hay configuracion en site-config');
  ok(/^https:\/\/[a-z]+\.supabase\.co$/.test(cfg.url), 'la URL es la raiz del proyecto: ' + cfg.url);

  var cliente = await p.evaluate(async function () {
    try {
      const sb = await window.OdisseySupabase.obtener();
      const { data, error } = await sb.auth.getSession();
      return { ok: !error, error: error ? error.message : null, usuario: data && data.session ? 'con sesion' : 'sin sesion' };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ok(cliente.ok, 'el cliente se crea y habla con Auth: ' + (cliente.error || cliente.usuario));

  console.log('');
  console.log('=== 3. EL LOGIN VA A SUPABASE, NO AL BOT');
  /* El captcha se apaga para esta prueba. Con la clave real puesta, en
     localhost Cloudflare rechaza el reto porque el dominio no esta
     permitido, y el login se corta ANTES de llegar a Supabase. La prueba
     pasaria sin comprobar nada, que es peor que no probar. */
  await p.evaluate(function () {
    window.SITE_CONFIG.turnstileSiteKey = '';
  });
  alBot = [];
  await p.evaluate(function () { window.openLoginModal(); });
  await esperar(800);
  await p.evaluate(function () {
    document.getElementById('authLoginIdent').value = 'usuarioinventado';
    document.getElementById('authLoginPass').value = 'ClaveLarga123!';
    document.getElementById('authFormLogin').requestSubmit();
  });
  await esperar(6000);

  ok(alBot.length === 0, 'NO se ha llamado al bot para el login (' + alBot.length + ' llamadas)');
  var mensaje = await p.evaluate(function () {
    var e = document.getElementById('authErrorLogin');
    return e && !e.hidden ? e.textContent.trim() : '(sin mensaje)';
  });
  ok(mensaje.length > 0, 'el formulario responde con un mensaje');
  /* Aqui esta lo importante: el mensaje tiene que ser el de credenciales
     invalidas de SUPABASE. Si sale "espera un momento" es que el captcha
     ha cortado antes y la prueba no ha probado nada. */
  ok(/correct/i.test(mensaje),
    'llega a Supabase y responde "credenciales incorrectas": "' + mensaje.slice(0, 70) + '"');
  ok(!/web\.js|database\.js|bot|actualizada/i.test(mensaje),
    'y el mensaje no habla del bot');

  console.log('');
  console.log('=== 4. EL REGISTRO VA A SUPABASE');
  await p.evaluate(function () { window.SITE_CONFIG.turnstileSiteKey = ''; });
  alBot = [];
  await p.evaluate(function () {
    document.querySelector('#loginModal [data-auth-view="registro"]').click();
  });
  await esperar(2500);
  await p.evaluate(function () {
    document.getElementById('authRegUser').value = 'pruebasupabase';
    document.getElementById('authRegMail').value = 'pruebasupabase@example.com';
    document.getElementById('authRegPass').value = 'ClaveLarga123!';
    document.getElementById('authFormRegistro').requestSubmit();
  });
  await esperar(5000);
  ok(alBot.length === 0, 'NO se ha llamado al bot para el registro (' + alBot.length + ')');

  console.log('');
  console.log('=== 5. SIN ERRORES DE JAVASCRIPT');
  ok(erroresJs.length === 0, 'ninguno' + (erroresJs.length ? ': ' + erroresJs[0] : ''));

  await p.screenshot({ path: path.join(SALIDA, 'supabase-login.png') });
  console.log('');
  console.log('captura: supabase-login.png');

  await nav.close();
  servidor.close();
  console.log('');
  console.log(fallos === 0 ? 'TODO CORRECTO' : 'FALLOS: ' + fallos);
});