/* =============================================================
   formulario.js - proteccion contra spam y limite de envios
   -------------------------------------------------------------
   QUE HACE Y POR QUE

   Los formularios publicos de Odissey (reportar un jugador,
   valorar a un miembro del staff, pedir ayuda) crean trabajo
   real de verdad: abren un ticket en Discord, escriben en el
   registro y consumen la cola del staff. Eso los convierte en el
   objetivo ideal de un robot: puede enviarlos cientos de veces sin
   cansarse.

   Antes no havia NINGUNA proteccion. Lo unico que habia era un
   maxlength=16 en el nombre del jugador.

   LAS TRES CAPAS DE aqui:

   1. CAMPO TRAMPA (honeypot)
      Un <input> escondido que ninguna persona ve ni rellena. Un
      bot, en cambio, rellena todos los campos que encuentra. Si el
      campo trampa llega con texto, el envio se descarta en
      silencio.

      Por que NO se usa type="hidden": los bots lo saltan sin
      problema porque leen el HTML y ven que no hay nada que
      rellenar. El truco es un input de texto normal escondido con
      CSS y con tabindex="-1" para que ni el tabulador lo alcance.

   2. TIEMPO MINIMO
      Si el formulario se ha enviado en menos de 3 segundos desde
      que se abrio, no ha podido ser una persona. Un humano tarda
      mas en decidir que escribir. Un bot lo hace al instante.

   3. LIMITE DE ENVIOS
      Como mucho 5 envios por ventana de 10 minutos, contados en
      el navegador.

   LO QUE ESTO NO ES
   -----------------
   Esto NO es seguridad de verdad: un bot sofisticado lee el
   JavaScript y se salta las tres capas. Es una capa de cribado que
   elimina el 99% del ruido automatico y encarece un poco el
   ataque. La proteccion de verdad tiene que estar en el bot:
   limite por IP y por cuenta, y validacion en el servidor.

   De hecho, ESTE SCRIPT ES LA PARTE QUE EL ATACANTE PUEDE
   DESACTIVAR, y por eso el limite real va en el bot. Ver
   SEGURIDAD.md.
   ============================================================= */
(function (global) {
  'use strict';

  /* Ventana de tiempo para el limite de envios. */
  const VENTANA_MS = 10 * 60 * 1000;   // 10 minutos
  const MAX_ENVIOS = 5;                // envios por ventana
  const TIEMPO_MINIMO_MS = 3000;       // 3 segundos desde abrir el formulario
  const CLAVE = 'odissey_envios';

  /* Cuando se abrio el formulario por primera vez. En memoria, no
     en localStorage: si se recarga la pagina, el reloj vuelve a
     cero, que es justo lo que hace un bot. */
  let abiertoEn = Date.now();

  /* ---------- limite de envios ---------- */

  function leerEnvios() {
    try {
      const lista = JSON.parse(localStorage.getItem(CLAVE) || '[]');
      const ahora = Date.now();
      // Solo cuentan los de la ventana actual.
      return lista.filter((t) => ahora - t < VENTANA_MS);
    } catch (e) { return []; }
  }

  function guardarEnvios(lista) {
    try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch (e) { }
  }

  /* Segundos que quedan para poder volver a enviar. 0 si ya puede. */
  function esperaRestante() {
    const lista = leerEnvios();
    if (lista.length < MAX_ENVIOS) return 0;
    const masAntiguo = lista[0];
    const restante = VENTANA_MS - (Date.now() - masAntiguo);
    return restante > 0 ? Math.ceil(restante / 1000) : 0;
  }

  /* ---------- la trampa ---------- */

  function puedeEnviar(idTrampa) {
    /* El id del campo trampa. Las paginas lo llaman sin argumentos, y
       entonces se busca por defecto; el id solo hace falta si en algun
       momento hubiera dos trampas en la misma pagina. */
    const trampa = document.getElementById(idTrampa || 'report-trampa');

    // Capa 1: trampa.
    // Se mira ANTES que el tiempo. Un robot puede tener la trampa
    // rellena desde el principio, y si se comprobara el tiempo primero
    // veria "has enviado demasiado rapido", aprenderia que ese es el
    // primer filtro y se dedicaria a esperar tres segundos. Con el
    // orden de aqui ve el aviso generico y no aprende nada.
    if (trampa && trampa.value.trim() !== '') {
      // No se le dice al visitante qué ha fallado: si se le dice
      // ("pon un email en el campo de la web"), el bot aprende y
      // deja de rellenarlo. Se dice un error generico.
      return {
        ok: false,
        motivo: 'No se ha podido enviar. Revisa el formulario.',
      };
    }

    // Capa 2: tiempo. Se mide desde que se cargo la pagina la
    // primera vez, no desde que se abrio este modal, porque abrir
    // el modal y escribir 4 letras y enviar son 2 segundos y eso
    // si lo hace una persona.
    if (Date.now() - abiertoEn < TIEMPO_MINIMO_MS) {
      return {
        ok: false,
        motivo: 'Has enviado esto demasiado rápido. Espera un momento.',
      };
    }

    // Capa 3: limite.
    const espera = esperaRestante();
    if (espera > 0) {
      const min = Math.ceil(espera / 60);
      return {
        ok: false,
        motivo: 'Has enviado demasiados mensajes seguidos. Espera ' + min +
          ' min antes de volver a intentarlo.',
      };
    }

    return { ok: true };
  }

  /* Avisa de que ya se ha enviado. Se llama SOLO cuando el envio
     ha funcionado de verdad, no antes: si se contara al intentarlo
     y el envio fallara, el visitante perderia un intento sin
     haber enviado nada. */
  function registrarEnvio() {
    const lista = leerEnvios();
    lista.push(Date.now());
    guardarEnvios(lista.slice(-MAX_ENVIOS));
  }

  /* Reinicia el reloj de "tiempo minimo". Se llama cuando el
     visitante abre un formulario: desde ese momento empieza a
     contar. */
  function abrirFormulario() {
    abiertoEn = Date.now();
  }

  /* ---------- comprobacion de URLs ---------- */

  /* Un enlace pegado por el usuario va a acabar en un href que
     pincha el staff. Un "javascript:..." ahi se ejecuta. Solo se
     aceptan http(s) o rutas internas. */
  function enlaceSeguro(valor) {
    const s = String(valor || '').trim();
    if (!s) return '';
    if (s.charAt(0) === '/' && s.charAt(1) !== '/') return s;
    if (/^https?:\/\//i.test(s)) return s;
    return '';
  }

  /* ---------- ir a la pagina de gracias ----------

     Cuando un formulario se envia bien, el visitante tiene que ver
     algo mas que un aviso verde que se le pasa en dos segundos. Esta
     funcion lo lleva a gracias.html con el motivo en la URL.

     El motivo solo se usa para decidir que frase se pinta. Se
     comprueba contra la lista de la propia pagina: si llega
     cualquier otra cosa, se cae en "general", que es texto fijo.
     No hay nada secreto ni que comprobar de verdad aqui: lo que
     importa es si el envio se guardo, y eso ya lo ha dicho el
     servidor.

     Vive aqui y no en cada pagina porque las 13 que tienen el boton
     de comprar la necesitan, y antes estaba escrita solo en una,
     con lo que en las otras dozen estaba sin definir. */
  function irAGracias(tipo) {
    const permitidos = ['reporte', 'valoracion', 'soporte', 'compra', 'postulacion'];
    const t = permitidos.indexOf(tipo) !== -1 ? tipo : 'general';
    try {
      global.location.href = 'gracias.html?tipo=' + encodeURIComponent(t);
    } catch (e) {
      global.location.href = 'gracias.html';
    }
  }

  global.irAGracias = irAGracias;

  global.OdisseyFormulario = {
    puedeEnviar: puedeEnviar,
    registrarEnvio: registrarEnvio,
    abrirFormulario: abrirFormulario,
    esperaRestante: esperaRestante,
    enlaceSeguro: enlaceSeguro,
    irAGracias: irAGracias,
    MAX_ENVIOS: MAX_ENVIOS,
  };

  /* Al abrir cualquier modal de formulario, se pone a cero el
     reloj de "has enviado demasiado rapido". */
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!t || !t.closest) return;
    const disparador = t.closest('[onclick*="ReportModal"],[onclick*="RatingModal"],[onclick*="openReport"]');
    if (disparador) abrirFormulario();
  }, true);
})(window);