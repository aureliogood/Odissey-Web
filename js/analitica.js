/* =============================================================
   js/analitica.js — medir lo que pasa en la web
   -------------------------------------------------------------
   QUE ES ESTO

   Un contador invisible de eventos. En vez de mirar los accesos
   totales, que no dicen nada, registra COSAS CONCRETAS: cuantas
   veces se pulso el boton de jugar, cuantos pedidos se hicieron,
   cuantos reportes se enviaron, quantas personas llegaron desde
   Google. Con eso se puede responder a la pregunta util ("¿que
   pagina convierte?") en vez de a la inutil ("¿cuanta gente
   entro?").

   POR QUE NO HAY GOOGLE ANALYTICS AQUI

   Google Analytics descarga un script de Google que pesa 50 KB,
   guarda identificadores permanentes en el navegador de cada visitante y
   manda cada movimiento de raton a sus servidores. En una web de
   un servidor de Minecraft, eso es una capa que no hace falta y una
   fuente mas que puede romperse sin que nadie se entere.

   Por eso esto es un "evento de primera parte": el sitio mide y lo
   guarda en el propio servidor (que es lo que ya sabe hacer con
   /api/admin/log). Si algun dia se quiere un panel completo, se
   conecta Plausible o Umami (que no usan cookies) en la funcion
   instalar(), y todo lo de aqui sigue funcionando.

   LO QUE NO RECOGE
   - No recoge IPs.
   - No guarda nada antes de que el visitante acepte las cookies.
   - No manda nada a ningun tercero.

   COMO SE USA
   ----------
   En el HTML, en el elemento que quiero medir:
       <button data-analytics="boton_tienda">
   Y ya esta. No hay que llamar a ninguna funcion.

   Para ver los datos hay que mirar el registro del panel, que se
   registra con la misma tabla que las acciones de administracion.
   ============================================================= */
(function (global) {
  'use strict';

  const CLAVE = 'odissey_analytics';
  /* Suficiente para 60 dias de uso normal. */
  const MAX = 400;

  /* ¿Ha aceptado el visitante? Sin esto, no se registra nada: es lo
     que hace que el banner de cookies signifique algo y no sea
     decorativo. */
  function permitido() {
    try { return localStorage.getItem('odissey_cookie_consent') === 'accepted'; }
    catch (e) { return false; }
  }

  function leer() {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE) || '{}');
      return (v && typeof v === 'object') ? v : {};
    } catch (e) { return {}; }
  }

  function guardar(datos) {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) { }
  }

  /* Suma 1 a un contador. Los contadores guardan fechas de los ultimos
     30 dias, para poder dibujar "cuantos en los ultimos 7 dias" sin
     tener que depender del servidor. */
  function sumar(clave, valor) {
    const datos = leer();
    const ahora = Date.now();
    const lista = Array.isArray(datos[clave]) ? datos[clave].filter((t) => ahora - t < 30 * 864e5) : [];
    lista.push(ahora);
    datos[clave] = lista.slice(-MAX);
    guardar(datos);
  }

  /* Un evento de "conversion": algo que la persona HA HECHO, no solo
     ha visto. Las conversiones son las unicas que se pueden comparar
     entre paginas para decidir cual funciona. */
  function conversion(nombre, detalle) {
    if (!permitido()) return;
    sumar('conv:' + nombre);
    if (detalle) sumar('conv:' + nombre + ':' + detalle);
  }

  /* Un clic: alguien ha pulsado algo. Importa menos que una
     conversion, pero ayuda a entender por donde se entra. */
  function clic(nombre) {
    if (!permitido()) return;
    sumar('clic:' + nombre);
  }

  /* Una vista de pagina. Automatica. */
  function pagina() {
    if (!permitido()) return;
    sumar('pagina:' + (location.pathname.replace(/\/$/, '') || '/'));
  }

  /* El resumen que se puede enseyar en el panel de administracion. */
  function resumen() {
    const datos = leer();
    const salida = { clics: {}, conversiones: {}, paginas: {} };
    const desde = Date.now() - 7 * 864e5;
    for (const clave of Object.keys(datos)) {
      const lista = datos[clave];
      if (!Array.isArray(lista)) continue;
      const n = lista.filter((t) => t >= desde).length;
      if (!n) continue;
      const [tipo, ...resto] = clave.split(':');
      const nombre = resto.join(':');
      if (tipo === 'clic') salida.clics[nombre] = n;
      else if (tipo === 'conv') salida.conversiones[nombre] = n;
      else if (tipo === 'pagina') salida.paginas[nombre] = n;
    }
    return salida;
  }

  /* Delegacion: un solo listener para toda la web. Se fija el
     data-analytics en el HTML y este codigo decide que hacer. Asi no
     hay que tocar el JavaScript de cada pagina cuando se anade un
     boton nuevo. */
  document.addEventListener('click', function (ev) {
    if (!permitido()) return;
    const nodo = ev.target && ev.target.closest ? ev.target.closest('[data-analytics]') : null;
    if (!nodo) return;
    const etiqueta = nodo.getAttribute('data-analytics');
    /* "cta:" es una conversion (el visitante quiere entrar o comprar).
       "nav:" es solo un clic (esta mirando secciones). */
    if (etiqueta.indexOf('cta_') === 0 || etiqueta.indexOf('conversion_') === 0) {
      conversion(etiqueta);
    } else {
      clic(etiqueta);
    }
  }, true);

  /* Al cargar, una vista de la pagina. Se espera un poco para no
     contar como vista un arranque que se cancela (un F5 rápido, un
     bot que solo pide el HTML). */
  if (document.readyState === 'complete') setTimeout(pagina, 800);
  else global.addEventListener('load', function () { setTimeout(pagina, 800); });

  global.OdisseyAnalitica = {
    clic: clic,
    conversion: conversion,
    pagina: pagina,
    resumen: resumen,
    limpiar: function () { try { localStorage.removeItem(CLAVE); } catch (e) { } },
  };
})(window);