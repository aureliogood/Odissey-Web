// ============================================================================
//  js/turnstile.js
//  Cloudflare Turnstile: la parte del navegador.
//
//  QUE HACE Y QUE NO HACE
//  ---------------------------------------------------------------------------
//  Esto pone el reto delante del visitante y recoge el token. NO lo
//  valida. La validacion la hace el bot contra siteverify, porque la
//  clave secreta no puede salir de un archivo que se publica.
//
//  Si este archivo validara el token, la clave secreta estaria en el
//  navegador de cada visitante y bastaria con abrir las herramientas
//  de desarrollo para saltarse el captcha entero. Por eso la
//  validacion NO esta aqui y no debe anadirse nunca.
//
//  CUANDO SE USA
//  ---------------------------------------------------------------------------
//      OdisseyTurnstile.montar(contenedor, 'registro', function (token) {
//          // token llega ya resuelto; si nunca se resuelve, el envio
//          // se bloquea abajo.
//      });
//
//  Y al enviar:
//      if (OdisseyTurnstile.activo()) {
//          cuerpo.turnstile_token = OdisseyTurnstile.token();
//      }
// ============================================================================

(function (global) {
  'use strict';

  /* El script de Cloudflare se carga una sola vez y se comparte entre
     todos los formularios de la pagina. Si cada uno cargara su propio
     <script>, abrir el login y luego el formulario de soporte
     descargaria el reto dos veces. */
  var CARGANDO = null;
  var LISTOS = [];
  var widgets = {};   // id -> configuracion
  var contador = 0;

  /* El token caduca a los 5 minutos (300 s). Es el dato que mas olvidos
     causa: el visitante deja el formulario abierto, vuelve a los 10
     minutos, envia, y el servidor responde "timeout-or-duplicate".
     Sin avisar antes parece un fallo del servidor o un error suyo.

     A los 4 minutos se da por caducado y se resetea el reto, para que
     le de tiempo a enviar sin quedarse con el widget en error. */
  var CADUCA_EN_MS = 4 * 60 * 1000;

  /* Tiempo máximo para que el reto se resuelva.
     Cloudflare dice que en condiciones normales se resuelve en 2-3
     segundos. Aquí, no siempre.

     Lo que pasaba (y se vio en la web real): el script se carga bien,
     Cloudflare monta el hueco del widget y el token no llega NUNCA, sin
     lanzar error ni un solo callback. Puede pasar si los subdominios del
     challenge no resuelven por DNS, que es justo lo que pasaba en la red
     de quien probó.

     Sin este reloj el visitante se quedaba en "Espera un momento"
     indefinidamente, para siempre, sin forma de seguir. Con el, a los
     20 segundos se le dice que la comprobación no ha podido hacerse y se
     le da un botón para reintentarla. */
  var RESUELVE_EN_MS = 20 * 1000;

  function config() {
    var c = global.SITE_CONFIG || {};
    return {
      siteKey: (c.turnstileSiteKey || '').trim(),
      // Interruptor de emergencia: si algo falla grave, se pone a false
      // y el sitio vuelve a funcionar sin captcha.
      activo: c.turnstileActivo !== false,
    };
  }

  function disponible() {
    var c = config();
    return !!(c.activo && c.siteKey);
  }

  function cargarScript() {
    if (global.turnstile) return Promise.resolve();
    if (CARGANDO) return CARGANDO;

    /* La funcion que el script de Cloudflare busca por su cuenta. Se
       define ANTES de colgar el <script>: si el fichero esta en cache y
       se descarga en dos milisegundos, la callback se puede disparar
       antes de que exista la funcion y el reto no se pintaria nunca. */
    global.odisseyTurnstileListo = function () {
      var pendientes = LISTOS;
      LISTOS = [];
      pendientes.forEach(function (fn) { fn(); });
    };

    CARGANDO = new Promise(function (resolver, rechazar) {
      /* ESTA LINEA ES LA QUE SE HABIA OLVIDADO: sin empujar el
         resolver a LISTOS, la promesa no se resolvia nunca, montar()
         se quedaba esperando y el widget no se pintaba. Se colgaba el
         <script>, pero nadie llamaba a resolver. */
      LISTOS.push(resolver);

      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=odisseyTurnstileListo&render=explicit';
      s.async = true;
      s.defer = true;
      s.crossOrigin = 'anonymous';

      /* Si el script no llega, casi siempre es que un bloqueador de
         anuncios lo ha parado, o que no hay conexion. En ese caso el
         envio tiene que quedar bloqueado: si se dejara pasar, el
         servidor recibiria un formulario sin token y lo rechazaria
         igual, pero el visitante veria un error mas tarde y sin
         saber por que. Fallar aqui es mas claro. */
      s.onerror = function () {
        CARGANDO = null;
        LISTOS = [];
        rechazar(new Error('No se ha podido cargar la proteccion anti-robot.'));
      };

      document.head.appendChild(s);

      /* Red de seguridad: si en 12 s el script no ha llegado, se avisa
         igual. Sin esto, si el <script> se queda colgado sin disparar
         error, el visitante pulsaria Enviar y no pasaria nada. */
      global.setTimeout(function () {
        if (!global.turnstile) {
          CARGANDO = null;
          LISTOS = [];
          rechazar(new Error('La proteccion anti-robot no responde.'));
        }
      }, 12000);
    });

    return CARGANDO;
  }

  /**
   * Pinta el reto dentro de `contenedor`.
   *
   * @param {Element|string} contenedor  donde va el widget
   * @param {string} accion  etiqueta que viaja al servidor ("registro",
   *                         "login", "soporte"...). El servidor comprueba
   *                         que el token sea del formulario que dice ser
   *                         y no uno reutilizado de otro.
   * @param {function} alResolver  se llama con el token ya valido
   * @param {object} [opciones]
   */
  function montar(contenedor, accion, alResolver, opciones) {
    var cfg = config();
    var opts = opciones || {};

    if (!disponible()) {
      // Interruptor apagado: se avisa igualmente para que el que
      // desarrollo no piense que hay captcha cuando no lo hay.
      if (global.console && console.warn) {
        console.warn('[turnstile] desactivado: no hay siteKey en SITE_CONFIG');
      }
      if (alResolver) alResolver('');
      return Promise.resolve(null);
    }

    var el = typeof contenedor === 'string' ? document.getElementById(contenedor) : contenedor;
    if (!el) return Promise.reject(new Error('No existe el contenedor del captcha.'));

    return cargarScript().then(function () {
      var id = 'ts-' + (++contador);

      widgets[id] = {
        accion: accion,
        alResolver: alResolver,
        expirado: false,
        // Al resetting, el token viejo deja de valer. Se limpia para que
        // no se pueda reutilizar por error.
        alResetear: null,
      };

      /* El aviso de caducidad se pinta en este <p>, que va justo debajo
         del widget. Se escribe desde JS para no duplicar el texto en
         cada pagina donde aparece el captcha. */
      var aviso = document.createElement('p');
      aviso.className = 'ts-aviso';
      aviso.setAttribute('role', 'status');
      aviso.setAttribute('aria-live', 'polite');
      aviso.hidden = true;
      el.parentNode.insertBefore(aviso, el.nextSibling);
      widgets[id].aviso = aviso;

      var widgetId = global.turnstile.render(el, {
        sitekey: cfg.siteKey,
        action: accion,
        // Tema: el sitio es negro. Con el tema automatico, en un movil
        // con modo oscuro el reto sale claro sobre fondo oscuro y
        // parece un parche.
        theme: 'dark',
        // tamano normal. El "compact" mide 150px de alto y en la tarjeta
        // del login se come media pantalla.
        size: 'normal',
        callback: function (token) {
          widgets[id].expirado = false;
          widgets[id].fallido = false;
          if (widgets[id].relojResolver) { clearTimeout(widgets[id].relojResolver); widgets[id].relojResolver = null; }
          if (aviso) aviso.hidden = true;
          if (widgets[id].botonReintentar) {
            widgets[id].botonReintentar.remove();
            widgets[id].botonReintentar = null;
          }
          if (widgets[id].alResolver) widgets[id].alResolver(token);
        },
        'expired-callback': function () {
          avisoCaducado(widgets[id]);
        },
        'error-callback': function () {
          /* El reto ha FALLADO, no sigue en marcha. Se marca como
             fallido para que al pulsar Enviar el mensaje sea "recarga y
             reintenta" y no "espera un momento", que dejaría al
             visitante creyendo que solo es lento, esperando para siempre.

             Esto no es raro: pasa si Cloudflare tiene un problema, si el
             dominio no está en la lista del widget, o si un bloqueador
             ha interfered con el iframe. */
          widgets[id].fallido = true;
          if (widgets[id].relojResolver) { clearTimeout(widgets[id].relojResolver); widgets[id].relojResolver = null; }
          if (widgets[id].temporizador) { clearTimeout(widgets[id].temporizador); widgets[id].temporizador = null; }
          if (aviso) aviso.hidden = true;
          errorConReintento(widgets[id], el, aviso,
            'No se ha podido comprobar que no eres un robot.');
        },
        'timeout-callback': function () {
          avisoCaducado(widgets[id]);
        },
      });

      widgets[id].id = widgetId;

      /* Vigilancia propia del caducado. El callback de Cloudflare no
         siempre salta si el visitante deja la pestaña en segundo plano,
         y el token murio igualmente. Con este temporizador el widget
         se refresca solo y el visitante no se queda con un reto muerto
         sin avisar. */
      widgets[id].temporizador = global.setTimeout(function () {
        if (widgets[id].expirado) return;
        avisoCaducado(widgets[id]);
      }, CADUCA_EN_MS);

      /* El reloj que faltaba: si en 20 s no hay token y no hay error,
         algo se ha quedado atascado en Cloudflare y no va a llegar. Se
         marca como fallido y se ofrece reintentar, para que el visitante
         no se quede esperando indefinidamente. */
      widgets[id].relojResolver = global.setTimeout(function () {
        if (!widgets[id].fallido && !widgets[id].expirado && !token(id)) {
          widgets[id].fallido = true;
          if (widgets[id].temporizador) { clearTimeout(widgets[id].temporizador); widgets[id].temporizador = null; }
          if (aviso) aviso.hidden = true;
          errorConReintento(widgets[id], el, aviso,
            'La comprobacion no ha podido terminar. Puede ser que tu conexion o un bloqueador la esten parando.');
        }
      }, RESUELVE_EN_MS);

      return widgetId;
    }).catch(function (err) {
      var e = document.createElement('p');
      e.className = 'ts-error';
      e.setAttribute('role', 'alert');
      e.textContent = (err && err.message) ||
        'No se ha podido cargar la proteccion anti-robot.';
      el.parentNode.insertBefore(e, el);
      // Sin reto no se puede enviar. Se devuelve rejection para que el
      // formulario lo note y no finja que ha ido bien.
      throw err;
    });
  }

  /** Pinta el error y un boton para reintentarlo.
        Un boton y no solo un texto: si el problema es la red o un
        bloqueador, recargar la pagina entera a veces lo arregla y otras
        no. Resetear el widget es lo barato, y si tampoco, al menos el
        visitante tiene algo que hacer en vez de mirar una pantalla
        bloqueada. */
  function errorConReintento(w, cajaWidget, aviso, texto) {
    if (!w) return;
    if (w.mensajeError && w.mensajeError.parentNode) w.mensajeError.remove();

    var e = document.createElement('p');
    e.className = 'ts-error';
    e.setAttribute('role', 'alert');
    e.textContent = texto;
    w.mensajeError = e;

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ts-reintentar';
    b.textContent = 'Reintentar';
    b.addEventListener('click', function () {
      e.remove();
      if (b.parentNode) b.remove();
      w.fallido = false;
      w.expirado = false;
      if (aviso) aviso.hidden = true;
      reset(w);
      // El mismo reloj de 20 s, otra vez: si tampoco funciona esta vez,
      // vuelve a salir el boton.
      w.relojResolver = global.setTimeout(function () {
        if (!w.fallido && !w.expirado && !token(w.id)) {
          w.fallido = true;
          if (aviso) aviso.hidden = true;
          errorConReintento(w, cajaWidget, aviso, texto);
        }
      }, RESUELVE_EN_MS);
    });
    e.appendChild(document.createTextNode(' '));
    e.appendChild(b);
    w.botonReintentar = b;

    if (cajaWidget && cajaWidget.parentNode) {
      if (aviso && aviso.nextSibling) cajaWidget.parentNode.insertBefore(e, aviso);
      else cajaWidget.parentNode.insertBefore(e, cajaWidget.nextSibling);
    }
  }

  function avisoCaducado(w) {
    if (!w) return;
    w.expirado = true;
    if (w.temporizador) { clearTimeout(w.temporizador); w.temporizador = null; }
    if (w.aviso) {
      w.aviso.hidden = false;
      w.aviso.textContent = 'La comprobacion ha caducado. Se va a repetir en un momento.';
    }
    reset(w);
  }

  /** Resetea el widget y quita el token guardado. */
  function reset(w) {
    if (!w || !w.id || !global.turnstile) return;
    try {
      global.turnstile.reset(w.id);
    } catch (e) { /* el widget ya no existe */ }
    if (w.alResetear) w.alResetear();
  }

  /** Resetea todos los widgets vivos. Se llama al reenviar un formulario. */
  function resetTodo() {
    Object.keys(widgets).forEach(function (k) { reset(widgets[k]); });
  }

  /** Si el widget esta fallado (el reto dio error), para que el
      formulario diga "recarga" y no "espera". */
  function fallido(id) {
    var w = id ? widgets[id] : primeroVivo();
    return !!(w && w.fallido);
  }

  /**
   * Token actual del widget indicado, o '' si aun no se ha resuelto.
   * Se mandaria tal cual en el cuerpo de la peticion.
   */
  function token(id) {
    var w = id ? widgets[id] : primeroVivo();
    if (!w || !global.turnstile) return '';
    if (w.fallido) return '';
    try {
      return global.turnstile.getResponse(w.id) || '';
    } catch (e) {
      return '';
    }
  }

  function primeroVivo() {
    var claves = Object.keys(widgets);
    return claves.length ? widgets[claves[claves.length - 1]] : null;
  }

  global.OdisseyTurnstile = {
    montar: montar,
    reset: reset,
    resetTodo: resetTodo,
    token: token,
    fallido: fallido,
    disponible: disponible,
    // Se exporta para las pruebas: permite comprobar que un envio sin
    // token esta bloqueado sin tener que resolver un reto de verdad.
    _interno: {
      widgets: widgets,
      cargarScript: cargarScript,
      CADUCA_EN_MS: CADUCA_EN_MS,
    },
  };

})(window);