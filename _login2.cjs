// Renderiza el login DE VERDAD (cargando auth.js en un DOM con
// #loginView) y comprueba el HTML que sale. Es lo que ve el navegador.

var http = require('http'), fs = require('fs'), path = require('path');
var { JSDOM, VirtualConsole } = require('jsdom');
var RAIZ = process.cwd();
var TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
var servidor = http.createServer(function (req, res) {
  var rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  var destino = path.join(RAIZ, rel);
  fs.readFile(destino, function (err, buf) {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream' });
    res.end(buf);
  });
});
function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var fallos = 0;
function ok(c, t) { if (!c) fallos++; console.log((c ? '  ok   ' : '  FALLA ') + t); return c; }

servidor.listen(0, '127.0.0.1', async function () {
  var base = 'http://127.0.0.1:' + servidor.address().port;

  var errores = [];
  var vc = new VirtualConsole();
  vc.on('jsdomError', function (e) {
    var m = e.message || String(e);
    if (/Not implemented|Could not parse|Could not load/.test(m)) return;
    if (/fetch|NetworkError/i.test(m)) return;
    errores.push(m.split('\n')[0]);
  });

  // Se parte de index.html y se inyecta el contenedor que auth.js busca.
  var html = fs.readFileSync('index.html', 'utf8')
    .replace('<body>', '<body><div id="loginView"></div>');

  var dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    resources: 'usable', virtualConsole: vc, url: base + '/index.html',
    beforeParse: function (w) {
      w.fetch = function () {
        return Promise.resolve({ ok: false, status: 401, json: function () { return Promise.resolve({ ok: false, message: 'Credenciales incorrectas' }); }, text: function () { return Promise.resolve(''); }, clone: function () { return this; } });
      };
      if (!w.matchMedia) w.matchMedia = function () { return { matches: false, addListener: function () { }, removeListener: function () { } }; };
      w.scrollTo = function () { };
      w.HTMLElement.prototype.scrollIntoView = function () { };
      Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: function () { return Promise.resolve(); } }, configurable: true });
    },
  });

  await esperar(1600);
  var d = dom.window.document;

  console.log('=== el login se ha montado');
  var login = d.getElementById('loginView');
  ok(login && login.innerHTML.length > 200, 'el login tiene contenido (' + (login ? login.innerHTML.length : 0) + ' caracteres)');
  if (!login || !login.innerHTML.length) { console.log(login ? login.innerHTML.slice(0, 400) : 'vacio'); dom.window.close(); servidor.close(); return; }

  console.log('');
  console.log('=== ESTRUCTURA (input-labels, form-labels)');
  ok(!!d.getElementById('authFormLogin'), 'el login es un <form>');
  ok(d.getElementById('authFormLogin').hasAttribute('novalidate'), 'lleva novalidate (la validacion la hace el JS)');
  ok(!!d.getElementById('authFormLogin').getAttribute('aria-labelledby'), 'el form se anuncia por su titulo');

  var etiquetas = login.querySelectorAll('label[for]');
  ok(etiquetas.length === 2, 'cada campo tiene etiqueta con for (' + etiquetas.length + ')');
  etiquetas.forEach(function (l) {
    ok(!!d.getElementById(l.getAttribute('for')), 'la etiqueta apunta a un campo real: ' + l.getAttribute('for'));
  });

  console.log('');
  console.log('=== CAMPOS (input-type-keyboard, autofill-support)');
  var ident = d.getElementById('authLoginIdent');
  var pass = d.getElementById('authLoginPass');
  ok(ident.getAttribute('autocomplete') === 'username', 'usuario: autocomplete=username');
  ok(pass.getAttribute('autocomplete') === 'current-password', 'clave: autocomplete=current-password');
  ok(ident.getAttribute('name') !== null, 'el campo tiene name (los gestores de contrasenas lo necesitan)');
  ok(pass.getAttribute('name') !== null, 'la clave tiene name');
  ok(pass.getAttribute('maxlength') === '128', 'la clave acota a 128 caracteres');
  ok(!!d.querySelector('#authLoginPass + .auth-ver'), 'el boton de ver clave va DENTRO del campo');

  console.log('');
  console.log('=== ERRORES (error-placement, aria-live-errors)');
  ok(!!d.getElementById('err-authLoginIdent'), 'el usuario tiene su propia caja de error');
  ok(!!d.getElementById('err-authLoginPass'), 'la clave tiene su propia caja de error');
  var errId = d.getElementById('err-authLoginIdent');
  ok(errId.getAttribute('role') === 'alert', 'la caja de error tiene role=alert');
  ok(errId.hasAttribute('hidden'), 'la caja de error arranca oculta');
  ok(ident.getAttribute('aria-describedby').indexOf('err-authLoginIdent') !== -1,
    'el campo apunta a su error con aria-describedby');
  var general = d.getElementById('authErrorLogin');
  ok(general.getAttribute('role') === 'alert' && general.getAttribute('aria-live') === 'assertive',
    'el error general se anuncia con role=alert y aria-live=assertive');

  console.log('');
  console.log('=== BOTON DE VER CLAVE (password-toggle, aria-label)');
  var ver = d.querySelector('.auth-ver');
  ok(!!ver, 'existe el boton');
  ok(!!ver.getAttribute('aria-label'), 'tiene nombre accesible: "' + ver.getAttribute('aria-label') + '"');
  ok(ver.getAttribute('aria-pressed') === 'false', 'aria-pressed=false al empezar');
  ok(ver.type === 'button', 'es type=button (no envia el formulario)');
  // Se pulsa y se comprueba que cambia el estado.
  ver.click();
  await esperar(50);
  ok(d.getElementById('authLoginPass').type === 'text', 'al pulsarlo se ve la clave');
  ok(ver.getAttribute('aria-pressed') === 'true', 'aria-pressed pasa a true');
  ok(ver.getAttribute('aria-label').toLowerCase().indexOf('ocult') !== -1,
    'el nombre accesible cambia a ocultar: "' + ver.getAttribute('aria-label') + '"');
  ver.click();
  await esperar(50);
  ok(d.getElementById('authLoginPass').type === 'password', 'al volver a pulsarlo se oculta');

  console.log('');
  console.log('=== VALIDACION EN BLUR (inline-validation)');
  // Con el campo vacio y sin haber escrito nada, no debe marcar error.
  var ident2 = d.getElementById('authLoginIdent');
  ident2.focus();
  ident2.dispatchEvent(new dom.window.Event('blur'));
  await esperar(50);
  ok(d.getElementById('err-authLoginIdent').hasAttribute('hidden'),
    'un campo vacio sin tocar no se marca con error');

  // Escribiendo algo y saliendo, se valida.
  ident2.value = '   ';
  ident2.dispatchEvent(new dom.window.Event('blur'));
  await esperar(50);
  var conError = d.getElementById('err-authLoginIdent');
  ok(!conError.hasAttribute('hidden'), 'un campo solo con espacios si se marca');
  ok(conError.querySelector('span').textContent.length > 0, 'el mensaje dice algo util: "' + conError.querySelector('span').textContent + '"');
  ok(ident2.getAttribute('aria-invalid') === 'true', 'el campo queda con aria-invalid=true');

  // Al corregir, el error desaparece.
  ident2.value = 'aureliogood';
  ident2.dispatchEvent(new dom.window.Event('input'));
  await esperar(50);
  ok(d.getElementById('err-authLoginIdent').hasAttribute('hidden'), 'al corregir, el error desaparece');
  ok(ident2.getAttribute('aria-invalid') === 'false', 'aria-invalid vuelve a false');

  console.log('');
  console.log('=== ESTADO DE CARGA (submit-feedback)');
  var boton = d.querySelector('#authFormLogin button[type=submit]');
  ok(!!boton, 'hay boton de envio');
  ok(!!boton.querySelector('.auth-boton__carga'), 'el boton tiene hueco para el spinner');
  ok(!!boton.querySelector('.auth-boton__texto'), 'el boton tiene el texto');
  ok(boton.textContent.indexOf('Entrar') !== -1, 'el texto inicial es "Entrar"');

  console.log('');
  console.log('=== REGISTRO: politica de contrasena (input-helper-text)');
  // Se cambia a la pestaÃ±a de registro.
  var tabRegistro = d.querySelector('[data-auth-view="registro"]');
  tabRegistro.click();
  await esperar(300);
  var reg = d.getElementById('authRegPass');
  ok(!!reg, 'el campo de contrasena del registro existe');
  ok(reg.getAttribute('minlength') === '12', 'pide 12 caracteres (minlength=12)');
  ok(reg.getAttribute('autocomplete') === 'new-password', 'autocomplete=new-password');
  var ayuda = d.getElementById('ayuda-authRegPass');
  ok(!!ayuda, 'la ayuda tiene id propio');
  ok(reg.getAttribute('aria-describedby').indexOf('ayuda-authRegPass') !== -1,
    'el campo apunta a la ayuda con aria-describedby');
  ok(/12 caracteres/.test(ayuda.textContent), 'la ayuda dice el requisito exacto: "' + ayuda.textContent.slice(0, 60) + '"');

  var mail = d.getElementById('authRegMail');
  ok(mail.getAttribute('type') === 'email', 'el correo es type=email');
  ok(mail.getAttribute('inputmode') === 'email', 'el correo pide el teclado con @ en el movil');

  console.log('');
  console.log('=== TECLADO (keyboard-nav)');
  ok(!!d.querySelector('.auth-tab[role=tab][aria-selected]'), 'las pestanas tienen role=tab y aria-selected');
  ok(d.querySelector('.auth-tab[aria-selected="true"]') !== null, 'la pestana activa se marca');

  console.log('');
  console.log('=== ERRORES DE JAVASCRIPT');
  ok(errores.length === 0, 'ninguno' + (errores.length ? ': ' + errores[0] : ''));

  dom.window.close();
  servidor.close();
  console.log('');
  console.log(fallos === 0 ? 'TODO CORRECTO' : 'FALLOS: ' + fallos);
});
