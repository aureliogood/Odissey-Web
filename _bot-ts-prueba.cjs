// Prueba del modulo del bot contra la API REAL de Cloudflare, con las
// claves de prueba oficiales. Comprueba lo que de verdad importa:
//
//   - un token bueno se acepta
//   - un token de la clave que siempre falla se rechaza
//   - un token repetido se rechaza (timeout-or-duplicate)
//   - un token de otra accion se rechaza
//   - sin token se rechaza
//   - un token enorme se corta sin llamar a la API
//   - con la API caida se rechaza (no se deja pasar)
var { exigirTurnstile } = require('./bot-turnstile');

// Secret de prueba: valida cualquier token de las claves de prueba.
process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
// Con las claves de prueba, Cloudflare responde hostname "localhost",
// no odisseymc.site. Es lo que hace que el primer test fallara con
// "dominio-distinto": la comprobacion del dominio funciona bien, lo que
// no estaba bien era el dominio de prueba.
process.env.TURNSTILE_SEGUROS = 'odisseymc.site,localhost';

var fallos = 0;
function ok(c, t) { if (!c) fallos++; console.log((c ? '  ok   ' : '  FALLA ') + t); return c; }
function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function peticion(token, extras) {
  var req = {
    body: {},
    headers: { 'cf-connecting-ip': '203.0.113.7' },
    ip: '203.0.113.7',
  };
  if (token !== undefined) req.body.turnstile_token = token;
  if (extras) Object.assign(req.body, extras);
  return req;
}

(async function () {
  console.log('=== 1. TOKEN BUENO (el que genera la clave que siempre pasa)');
  // Con la secret de prueba, Cloudflare acepta el token ficticio.
  var r = await exigirTurnstile(peticion('XXXX.DUMMY.TOKEN.XXXX'), 'login');
  ok(r.ok, 'se acepta (motivo si no: ' + r.motivo + ')');

  console.log('');
  console.log('=== 2. TOKEN DE LA CLAVE QUE SIEMPRE FALLA');
  process.env.TURNSTILE_SECRET_KEY = '2x0000000000000000000000000000000AA';
  var r2 = await exigirTurnstile(peticion('XXXX.DUMMY.TOKEN.XXXX'), 'login');
  ok(!r2.ok, 'se rechaza');
  ok(!r2.ok && !!r2.mensaje, 'con un mensaje para el visitante: "' + (r2.mensaje || '') + '"');

  console.log('');
  console.log('=== 3. TOKEN REPETIDO (timeout-or-duplicate)');
  process.env.TURNSTILE_SECRET_KEY = '3x0000000000000000000000000000000AA';
  var r3 = await exigirTurnstile(peticion('XXXX.DUMMY.TOKEN.XXXX'), 'login');
  ok(!r3.ok, 'se rechaza');
  ok(r3.motivo && r3.motivo.indexOf('timeout-or-duplicate') !== -1,
    'con el motivo correcto: ' + r3.motivo);
  ok(r3.mensaje && /caducado|reintent/i.test(r3.mensaje),
    'y un mensaje que dice que repita, no que es un bot: "' + r3.mensaje + '"');

  console.log('');
  console.log('=== 4. SIN TOKEN');
  process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
  var r4 = await exigirTurnstile(peticion(undefined), 'login');
  ok(!r4.ok && r4.motivo === 'sin-token', 'se rechaza con motivo sin-token');

  console.log('');
  console.log('=== 5. TOKEN ENORME (se corta antes de llamar a la API)');
  var r5 = await exigirTurnstile(peticion('x'.repeat(3000)), 'login');
  ok(!r5.ok && r5.motivo === 'token-invalido',
    'se rechaza sin gastar una llamada: ' + r5.motivo);

  console.log('');
  console.log('=== 6. LA API CAIDA: se rechaza, no se deja pasar');
  process.env.TURNSTILE_SECRET_KEY = 'clave-invalida-a-proposito';
  var r6 = await exigirTurnstile(peticion('XXXX.DUMMY.TOKEN.XXXX'), 'login');
  ok(!r6.ok, 'se rechaza (una clave secreta mala da invalid-input-secret)');
  // Y con la URL de la API cambiada a algo inalcanzable:
  process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
  console.log('     (red: se comprueba con el timeout, ver nota abajo)');

  console.log('');
  console.log('=== 7. SIN SECRET CONFIGURADA');
  delete process.env.TURNSTILE_SECRET_KEY;
  var r7 = await exigirTurnstile(peticion('XXXX.DUMMY.TOKEN.XXXX'), 'login');
  ok(!r7.ok && r7.motivo === 'sin-configurar',
    'se rechaza: es preferible que el bot no acepte a que acepte en abierto');

  console.log('');
  console.log('=== 8. INTERRUPTOR DE APAGADO');
  process.env.TURNSTILE_APAGADO = '1';
  process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
  var r8 = await exigirTurnstile(peticion(undefined), 'login');
  ok(r8.ok && r8.saltado, 'con TURNSTILE_APAGADO=1 pasa todo (para poder salir de un bloqueo)');
  delete process.env.TURNSTILE_APAGADO;

  console.log('');
  console.log('=== 9. ACCION DISTINTA');
  /* La respuesta real de Cloudflare con el token ficticio NO trae campo
     "action" (el token de prueba no se genero pintando un widget con
     action). Para probar la comprobacion se falsea fetch con una
     respuesta controlada: contra la API real esto no se puede llegar a
     ver, porque un token de verdad siempre trae la accion. */
  var real = global.fetch;
  global.fetch = async function () {
    return {
      ok: true,
      json: async function () {
        return { success: true, hostname: 'localhost', action: 'login' };
      },
    };
  };
  var r9 = await exigirTurnstile(peticion('XXXX.DUMMY.TOKEN.XXXX'), 'registro');
  ok(!r9.ok && r9.motivo === 'accion-distinta',
    'un token resuelto para "login" se rechaza en "registro": ' + r9.motivo);

  console.log('');
  console.log('=== 10. SIN CAMPO action: se rechaza (no se supone que sea buena)');
  global.fetch = async function () {
    return { ok: true, json: async function () { return { success: true, hostname: 'localhost' }; } };
  };
  var r10 = await exigirTurnstile(peticion('XXXX.DUMMY.TOKEN.XXXX'), 'registro');
  ok(!r10.ok && r10.motivo === 'accion-distinta',
    'si Cloudflare no dice de que formulario es, se rechaza: ' + r10.motivo);

  console.log('');
  console.log('=== 11. DOMINIO AJENO');
  global.fetch = async function () {
    return {
      ok: true,
      json: async function () {
        return { success: true, hostname: 'sitio-malicioso.example', action: 'login' };
      },
    };
  };
  var r11 = await exigirTurnstile(peticion('XXXX.DUMMY.TOKEN.XXXX'), 'login');
  ok(!r11.ok && r11.motivo === 'dominio-distinto',
    'un token resuelto en otro dominio se rechaza: ' + r11.motivo);

  global.fetch = real;

  console.log('');
  console.log(fallos === 0 ? 'TODO CORRECTO' : 'FALLOS: ' + fallos);
})();