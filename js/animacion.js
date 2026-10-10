/* =============================================================
   animacion.js — las apariciones al hacer scroll
   -------------------------------------------------------------
   QUE ERA ESTO Y QUE ERA ESTE ARCHIVO

   Cada pagina declaraba su propio IntersectionObserver para que los
   elementos con la clase ".reveal" apareciesen al llegar a la vista.
   El problema era doble:

     1. En tres paginas (perfil, wiki y staffverificar) el observer
        se USABA al pintar el contenido pero nunca se declaraba.
        En cuanto se abria la ficha de un miembro del staff, salia
        un ReferenceError y esa parte de la pagina dejaba de
        funcionar.

     2. IntersectionObserver no existe en todos los navegadores. En
        los que no, la pagina reventaba al cargar y se quedaba en
        blanco.

   Aqui esta la solucion, en un solo sitio:

     - Si el navegador tiene IntersectionObserver, se usa.
     - Si no, el elemento se marca como visible al pintarse, que es
       exactamente lo mismo pero sin animacion.

   COMO SE USA
   -----------
   En vez de "observer.observe(el)":

       OdisseyAnimacion.observar(el);

   ------------------------------------------------------------- */
(function (global) {
  'use strict';

  const SIN_ANIMACION = 'off';

  /* Una unica instancia para toda la pagina: observar muchos elementos
     con el mismo observer es lo que recomienda el navegador, y asi se
     evita crear uno por cada llamada. */
  var observer = null;
  var disponible = typeof global.IntersectionObserver === 'function';

  if (disponible) {
    observer = new global.IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('visible');
          /* Deja de observar: ya ha aparecido y no tiene sentido
             seguir pendiente de el. Tambien evita que la memoria se
             llene en paginas largas. */
          observer.unobserve(entrada.target);
        }
      });
    }, { threshold: 0.12 });
  }

  /* Marca un elemento (o varios) como visible. Lo que hace la version
     sin IntersectionObserver, y tambien el camino normal cuando el
     elemento ya esta en pantalla. */
  function mostrar(elementos) {
    if (!elementos) return;
    var lista = elementos.length !== undefined && !elementos.tagName
      ? elementos
      : [elementos];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && lista[i].classList) lista[i].classList.add('visible');
    }
  }

  /* El equivalente de "observer.observe(el)" de antes. */
  function observar(elemento) {
    if (!elemento) return;
    if (observer) {
      try {
        observer.observe(elemento);
        return;
      } catch (e) {
        /* Si el navegador lanza al observar (que lo hace con
           elementos que ya no estan en el documento), se cae al plan
           B en vez de romper la pagina. */
      }
    }
    elemento.classList.add('visible');
  }

  /* Para cuando se acaba de pintar contenido nuevo y hay que
     registrarlo de golpe. Es lo que usan las funciones de renderizar
     la galeria y la ficha del staff. */
  function observarTodos(selector, contenedor) {
    var raiz = contenedor || global.document;
    if (!raiz || !raiz.querySelectorAll) return;
    var elementos = raiz.querySelectorAll(selector || '.reveal');
    for (var i = 0; i < elementos.length; i++) observar(elementos[i]);
  }

  /* Si el visitante ha pedido menos movimiento (la preferencia del
     sistema), no hay animaciones aunque el navegador las tenga. */
  function menosMovimiento() {
    try {
      return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  /* Registra todos los .reveal que ya estan en el HTML.
     Esto es OBLIGATORIO y no opcional: el CSS pone opacity:0 a
     .reveal, y solo se ven cuando se les anade .visible. Si aqui no
     se registran, la pagina se queda en blanco: el fondo y la barra
     de navegacion se ven, pero todo el contenido no.

     Antes cada pagina tenia su propia linea
     "document.querySelectorAll('.reveal').forEach(el => observer.observe(el))"
     y por eso se veia. Al mover el observer a este archivo, esa linea
     se perdio y por eso desaparecio el contenido. Por eso ahora el
     registro inicial se hace aqui, una sola vez, para todas las
     paginas. */
  function registrarIniciales() {
    if (!global.document) return;
    observarTodos('.reveal:not(.visible)');
  }

  /* Red de seguridad. Si por lo que sea el observer falla, o el
     navegador se queda atascado, o el elemento esta justo en el
     borde y el observer no lo dispara, el contenido NO se queda
     invisible: a los 2.5 segundos se ensena todo lo que siga
     escondido. Una pagina sin animaciones es mejor que una pagina
     en blanco. */
  function redDeSeguridad() {
    setTimeout(function () {
      var pendientes = global.document.querySelectorAll('.reveal:not(.visible)');
      for (var i = 0; i < pendientes.length; i++) {
        pendientes[i].classList.add('visible');
      }
    }, 2500);
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', registrarIniciales);
  } else {
    registrarIniciales();
  }
  redDeSeguridad();

  global.OdisseyAnimacion = {
    observar: observar,
    observarTodos: observarTodos,
    mostrar: mostrar,
    disponible: disponible,
    menosMovimiento: menosMovimiento,
    SIN_ANIMACION: SIN_ANIMACION,
  };
})(window);