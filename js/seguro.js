/* =============================================================
   seguro.js - utilidades de escape compartidas por todas las paginas
   -------------------------------------------------------------
   Por que existe este archivo:
   cada pagina tenia su propia funcion escapeHtml() escrita en su
   <script> en linea. Eso hacia tres cosas malas:

     1. Cada copia era subtly distinta. En unas escapaba la comilla
        simple y en otras no. Y como hay sitios donde el valor acaba
        DENTRO de un atributo onclick="f('...')", no escapar la
        comilla simple es un XSS esperando a ocurrir.
     2. Un error de seguridad habia que corregirlo doce veces.
     3. Sumaba kilobytes a cada pagina.

   Ahora hay una sola copia de cada funcion, aqui.

   QUE HACE CADA UNA:
   - escapeHtml()  : para meter texto dentro de HTML. Escapa los
                     cinco caracteres especiales.
   - escapeArgJs() : para meter un valor dentro de un onclick, que
                     es el caso peligroso. Devuelve "" si el valor
                     no tiene el formato esperado.
   - urlSegura()   : para meter una URL dentro de href o src. Escapar
                     para HTML NO impide un javascript: en un <a>, que
                     se ejecuta al pinchar. Aqui se comprueba el
                     esquema antes de devolver nada.
   - textoLimpio() : para texto que va a un atributo como title=
                     donde no puede haber HTML. Recorta y quita
                     saltos de linea.

   Todas son puras: no tocan el DOM ni dependen de nada.
   ============================================================= */
(function (global) {
  'use strict';

  function escapeHtml(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Un id de la API dentro de un onclick. El formato cerrado es lo que
     el servidor genera de verdad ("web:12", "r_1699999", un UUID). Si el
     valor se sale de ese patron se devuelve "" y quien llama decide que
     hacer, en vez de construir un onclick roto. */
  function escapeArgJs(valor) {
    var s = String(valor == null ? '' : valor);
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(s)) return '';
    return s;
  }

  /* Una URL que viene de la base de datos (imagen de la galeria, captura
     de un reporte) va a un href o a un src. Solo se aceptan:
       - rutas del propio sitio, con o sin barra inicial: /uploads/foto.png
         o uploads/foto.png
       - http://  y  https://
     Se rechaza lo demas:
       - //evil.com   (protocolo-relativo: en realidad es otro dominio)
       - javascript:, data:, vbscript:, file:, blob:...
       - cualquier cosa que empiece por dos puntos y tenga algo antes
         (eso es un esquema, y un esquema es lo que ejecuta codigo).

     El criterio para las rutas relativas es "no tenga esquema": si no
     hay dos puntos antes de la primera barra, no puede ser un esquema,
     asi que es una ruta y es segura. Es el mismo criterio que usan los
     navegadores para decidir si un href es relativo o absoluto. */
  function urlSegura(valor) {
    var s = String(valor == null ? '' : valor).trim();
    if (!s) return '';
    // Con barra inicial: /*algo mas*/ es protocolo-relativo, no vale.
    if (s.charAt(0) === '/' && s.charAt(1) === '/') return '';
    // Solo http y https en absoluto.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
      return /^https?:\/\//i.test(s) ? escapeHtml(s) : '';
    }
    // Con esquema no: es una ruta interna.
    return escapeHtml(s);
  }

  /* Texto que va dentro de title=, placeholder=, alt= y similares: sin
     HTML y sin saltos de linea, que romperian el atributo. */
  function textoLimpio(valor, max) {
    var s = String(valor == null ? '' : valor)
      .replace(/[\r\n\t]+/g, ' ')
      .trim();
    var limite = max || 200;
    return escapeHtml(s.length > limite ? s.slice(0, limite) + '…' : s);
  }

  /* Una URL "normal" (no para un atributo) lista para usar en un fetch o
     en un window.location. Devuelve la cadena original o "" si el esquema
     no es de los permitidos. */
  function urlApi(valor) {
    var s = String(valor == null ? '' : valor).trim();
    if (!s) return '';
    if (s.charAt(0) === '/' && s.charAt(1) !== '/') return s;
    if (/^https?:\/\//i.test(s)) return s;
    return '';
  }

  global.OdisseySeguro = {
    escapeHtml: escapeHtml,
    escapeArgJs: escapeArgJs,
    urlSegura: urlSegura,
    urlApi: urlApi,
    textoLimpio: textoLimpio,
  };

  /* Se exponen tambien como globales sueltos a proposito: las paginas
     tienen cientos de llamadas a escapeHtml() escritas a mano y esas
     llamadas tendrian que reescribirse todas para ganar nada. Es la
     funcion centralizada, solo que accessible con el nombre viejo.

     escapeArgJs, urlSegura y textoLimpio se exponen igual por lo mismo:
     se usan desde el codigo que pinta plantillas. */
  if (typeof global.escapeHtml !== 'function') global.escapeHtml = escapeHtml;
  if (typeof global.escapeArgJs !== 'function') global.escapeArgJs = escapeArgJs;
  if (typeof global.urlSegura !== 'function') global.urlSegura = urlSegura;
  if (typeof global.textoLimpio !== 'function') global.textoLimpio = textoLimpio;
  if (typeof global.urlApi !== 'function') global.urlApi = urlApi;
})(window);

/* ------------------------------------------------------------------
   Quitar el ".html" de la barra de direcciones
   ------------------------------------------------------------------
   Todos los enlaces del sitio ya apuntan a la ruta limpia (/tienda, /admin),
   que es como los sirve Github Pages. Pero si alguien escribe la direccion
   a mano, o llega desde un marcador, desde un enlace antiguo de Google o
   desde un mensaje de Discord, puede entrar por "/tienda.html" y ahi si se
   ve el .html.

   history.replaceState cambia lo que hay en la barra sin recargar ni
   perder la pagina, que ya esta dibujada. Se usa replaceState y no
   assign porque dejaria la entrada anterior en el historial y el boton
   "atras" del navegador haria un vaiven raro.

   Este archivo va en las 19 paginas y es de los primeros que cargan, que
   es justo lo que hace falta: cuanto antes se quita, menos se ve. */
(function (global) {
  'use strict';
  var loc = global.location;
  if (!loc || !global.history || !global.history.replaceState) return;

  var ruta = loc.pathname;
  if (!/\.html$/i.test(ruta)) return;

  /* 404.html se queda: es la pagina que Github Pages busca por defecto
     cuando una ruta no existe, y borrarle la extension haria que, al
     recargar, Github Pages sirviera la pagina de error... que ya es
     esta. Sin peor, pero es mas claro no tocarla. */
  if (/\/404\.html$/i.test(ruta)) return;

  /* Si hay un directorio delante, se respeta: /carpeta/pagina.html ->
     /carpeta/pagina. Un replaceState no cambia de archivo en el servidor,
     asi que no hay riesgo de pedir una ruta que no exista. */
  var limpia = ruta.replace(/\.html$/i, '') || '/';
  try {
    global.history.replaceState(null, '', limpia + loc.search + loc.hash);
  } catch (e) {
    /* Si el navegador lo rechaza, se queda con el .html. No es grave. */
  }
})(window);