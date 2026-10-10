// ============================================================================
//  turnstile.js  —  para el BOT (odisseymc.site/bot), NO para la web.
//
//  ESTA MITAD ES LA QUE PROTEGE. Lo que hay en la web (js/turnstile.js)
//  solo enseña el reto y recoge un token: se puede ver, se puede saltar.
//  Aqui es donde se decide si ese token vale algo.
//
//  POR QUE NO PUEDE ESTAR EN LA WEB
//  ---------------------------------------------------------------------------
//  La comprobacion necesita la SECRET KEY. Si esa clave estuviera en un
//  archivo publicado, cualquiera la leeria con F12 y podria:
//    1. generar sus propios tokens sin resolver nunca un reto, y
//    2. llamar a siteverify y darle la razon a mano.
//  Por eso la clave solo puede estar en este archivo, que no se sirve.
//
//  USO
//  ---------------------------------------------------------------------------
//    const { exigirTurnstile } = require('./turnstile');
//
//    app.post('/api/auth/register', async (req, res) => {
//      const verif = await exigirTurnstile(req, 'registro');
//      if (!verif.ok) {
//        return res.status(400).json({ ok: false, message: verif.mensaje });
//      }
//      ... seguir con el registro normal ...
//    });
//
//  El segundo argumento es la accion que se espera. El token lleva la
//  accion con la que se resolvio, asi que se puede comprobar que el
//  visitante que esta creando una cuenta no esta reutilizando un token
//  EJECUTADO de otra pantalla.
//
//  VARIABLES DE ENTORNO
//  ---------------------------------------------------------------------------
//    TURNSTILE_SECRET_KEY   la secret key de Cloudflare (obligatoria)
//    TURNSTILE_SEGUROS      dominios que se aceptan. Por defecto, solo
//                           odisseymc.site.
//    TURNSTILE_APAGADO      poner a "1" para desactivarlo sin tocar codigo
//                           (mismo interruptor que hay en la web)
// ============================================================================

'use strict';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/* Segundos que se espera a Cloudflare antes de rendirse. Si el token es
   bueno, siteverify responde en 100-300 ms. A los 8 s ya se puede
   considerar que algo va mal, y dejar al visitante esperando mas solo
   hace que se vaya. */
const TIMEOUT_MS = 8000;

function secreto() {
  return (process.env.TURNSTILE_SECRET_KEY || '').trim();
}

function apagado() {
  return process.env.TURNSTILE_APAGADO === '1';
}

/* Dominios que se aceptan en la respuesta. La respuesta de siteverify
   trae el dominio donde se resolvio el reto: si alguien resuelve el
   reto en su propia pagina y nos manda ese token, el dominio no sera
   el nuestro y hay que rechazarlo. */
function dominiosPermitidos() {
  const crudo = (process.env.TURNSTILE_SEGUROS || 'odisseymc.site').trim();
  return crudo.split(',').map(function (d) { return d.trim(); }).filter(Boolean);
}

/** Llama a siteverify. No lanza: devuelve siempre un objeto con ok. */
async function verificarConCloudflare(token, remoteip) {
  const clave = secreto();
  if (!clave) return { ok: false, motivo: 'sin-configurar' };

  const cuerpo = new URLSearchParams();
  cuerpo.append('secret', clave);
  cuerpo.append('response', token);
  if (remoteip) cuerpo.append('remoteip', remoteip);

  // AbortController para el timeout: sin esto, si Cloudflare se queda
  // colgado, la peticion del visitante se queda esperando colgada y el
  // bot acumula sockets abiertos.
  const control = new AbortController();
  const reloj = setTimeout(function () { control.abort(); }, TIMEOUT_MS);

  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      body: cuerpo,
      signal: control.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const datos = await res.json();
    return { ok: !!datos.success, datos: datos };
  } catch (err) {
    // Fallo de red o timeout. NO se trata como token valido.
    const porTimeout = err && err.name === 'AbortError';
    return { ok: false, motivo: porTimeout ? 'timeout' : 'error-red' };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Comprueba el token de una peticion.
 *
 * @param {object} req   la peticion de Express
 * @param {string} accion  la accion que se espera ("login", "registro"...)
 * @returns {Promise<{ok:boolean, motivo?:string, mensaje?:string}>}
 */
async function exigirTurnstile(req, accion) {
  /* Interruptor de emergencia. Mismo criterio que en la web: si algo
     falla grave, se apaga y el sitio sigue funcionando. */
  if (apagado()) return { ok: true, saltado: true };

  const cuerpo = (req && req.body) || {};
  const token = cuerpo.turnstile_token || cuerpo['cf-turnstile-response'] || '';

  if (!token) {
    return { ok: false, motivo: 'sin-token', mensaje: 'Completa la comprobacion anti-robot.' };
  }

  /* Cloudflare dice que el token no pasa de 2048 caracteres. Un token
     mayor es de alguien que ha mandado cualquier cosa. Se corta antes
     de gastar una llamada a la API. */
  if (typeof token !== 'string' || token.length > 2048) {
    return { ok: false, motivo: 'token-invalido', mensaje: 'La comprobacion anti-robot no es valida.' };
  }

  /* La IP del visitante. Detras de Cloudflare llega en CF-Connecting-IP;
     detras de un proxy normal, en X-Forwarded-For (y puede ser una
     lista). Se coje la primera. */
  const ip = (req.headers['cf-connecting-ip'] ||
    String(req.headers['x-forwarded-for'] || '').split(',')[0] ||
    req.ip || '').trim();

  const verif = await verificarConCloudflare(token, ip);

  if (!verif.ok) {
    const errores = (verif.datos && verif.datos['error-codes']) || [verif.motivo];
    // timeout-or-duplicate es el mas comun en uso normal: el visitante
    // dejo el formulario abierto mas de 5 minutos. Se le dice que
    // repita, que es lo que puede hacer; no es un ataque.
    const caducado = errores.indexOf('timeout-or-duplicate') !== -1;
    return {
      ok: false,
      motivo: errores.join(',') || 'desconocido',
      mensaje: caducado
        ? 'La comprobacion ha caducado. Vuelve a intentarlo.'
        : 'No se ha podido comprobar que no eres un robot.',
    };
  }

  const datos = verif.datos || {};

  /* CLAVES DE PRUEBA. Cloudflare pone esto en la respuesta cuando el
     token venia de una sitekey de prueba. Es de fiar: este JSON solo lo
     puede generar Cloudflare y solo lo puede pedir quien tenga la
     secret key, o sea, este bot.

     Hace falta porque los tokens de prueba NO llevan campo "action", y
     las comprobaciones de abajo comparan justo eso. Sin esta excepcion,
     probar con claves de prueba y accion puesta no pasaria nunca, que
     es un WAY worse: el bot esta probando en localhost y bloquea.

     En produccion con claves reales este flag no aparece y las
     comprobaciones se aplican enteras. Si aparece en produccion, es que
     hay una secret key de prueba puesta por error, y se avisa. */
  const esDePrueba = !!(datos.metadata && datos.metadata.result_with_testing_key);
  if (esDePrueba) {
    console.warn('[turnstile] AVISO: se ha validado un token de PRUEBA. ' +
      'En produccion esto significa que TURNSTILE_SECRET_KEY es una clave de prueba.');
  }

  /* ACCION. El token lleva la accion con la que se resolvio el reto.
     Sirve para que un token sacado de un formulario facil (por ejemplo
     una valueacion, que no necesita casi nada) no se pueda usar en otro
     mas interesante (el registro).

     Aqui es OBLIGATORIO que venga. Si se esperaba una accion y la
     respuesta no la trae, se rechaza: no se sabe de que formulario
     salio ese token, y suponer que "sera que si" es justamente el
     supuesto que un atacante quiere que hagas.

     AVISO: esto solo funciona si el widget se pinta con `action`. En
     js/turnstile.js se pasa siempre. Si alguien quita el `action` al
     pintar el widget, esto rechaza TODOS los envios. Es lo que se
     quiere: cerrando en falso se ve enseguida, y abriendo en falso no
     se ve nunca. */
  if (accion && !esDePrueba && datos.action !== accion) {
    return {
      ok: false,
      motivo: 'accion-distinta',
      mensaje: 'La comprobacion anti-robot no corresponde a este formulario.',
    };
  }

  /* Y que se haya resuelto en TU dominio, no en otro cualquiera. */
  const permitidos = dominiosPermitidos();
  if (permitidos.length && !esDePrueba && datos.hostname && permitidos.indexOf(datos.hostname) === -1) {
    return { ok: false, motivo: 'dominio-distinto', mensaje: 'La comprobacion anti-robot no es valida.' };
  }

  return { ok: true, datos: datos };
}

module.exports = { exigirTurnstile, verificarConCloudflare, SITEVERIFY };