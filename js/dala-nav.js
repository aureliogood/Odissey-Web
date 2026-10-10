/* =============================================================
   BARRA DE NAVEGACION — panel de movil
   -------------------------------------------------------------
   Los enlaces ya estan siempre visibles en la pastilla del centro,
   asi que en escritorio este archivo no hace nada.

   En pantallas estrechas (menos de 1000 px) los diez enlaces no caben
   en una fila, y el unico sitio donde meterlos es un panel debajo de
   la barra. Ese panel se construye aqui, copiando los enlaces de la
   pastilla: asi hay una sola lista en el HTML y no dos que se puedan
   desincronizar.

   Este archivo define ademas window.toggleMenu y window.closeMenu, que
   son las funciones que el boton de la barra llama desde su onclick.
   Si la pagina ya traia sus propias funciones del desplegable antiguo,
   estas las pisan y el boton funciona igual.
   ============================================================= */
(function (global) {
  'use strict';

  var ANCHO_BREAKPOINT = 1000;

  var pastilla = document.querySelector('.nav-pill');
  var nav = document.querySelector('nav.nav-bar');
  if (!pastilla || !nav) return;

  var enlaces = Array.prototype.slice.call(pastilla.querySelectorAll('.nav-pill__link'));
  if (!enlaces.length) return;

  var panel = null;
  var abierto = false;

  /* El panel se crea la primera vez que hace falta y se reutiliza. */
  function construir() {
    if (panel) return panel;

    panel = document.createElement('div');
    /* Id propio. El antiguo "menuDropdown" tiene un monton de reglas viejas
       en dala.css (opacity 0, z-index, transiciones con .menu-open) que
       se le aplicarian a este panel y lo dejarian invisible. Con otro id
       no se mezclan. */
    panel.id = 'navMenuPanel';
    /* Clase propia, no .menu-panel: las reglas viejas de ese selector
       son para el desplegable antiguo (negro translucido sin posicion) y
       se mezclarian con estas. */
    panel.className = 'nav-menu-panel hidden';

    var lista = document.createElement('div');
    lista.className = 'menu-panel__list';

    enlaces.forEach(function (a) {
      /* cloneNode copia el href y el data-i18n, asi que la traduccion
         sigue funcionando en los dos sitios. */
      var copia = a.cloneNode(true);
      copia.className = 'nav-pill__link';
      copia.removeAttribute('aria-current');
      lista.appendChild(copia);
    });

    panel.appendChild(lista);

    /* Se cuelga del nav, no de la fila: asi el panel queda debajo de
       toda la barra, igual que el desplegable antiguo. */
    var fila = nav.querySelector('.nav-inner');
    if (fila && fila.parentNode) fila.parentNode.insertBefore(panel, fila.nextSibling);
    else nav.appendChild(panel);

    return panel;
  }

  function abrir() {
    if (global.innerWidth > ANCHO_BREAKPOINT) return;
    var p = construir();
    p.classList.remove('hidden');
    abierto = true;
    var b = document.getElementById('menuBtn');
    if (b) {
      b.setAttribute('aria-expanded', 'true');
      b.classList.add('is-open');
    }
  }

  function cerrar() {
    if (!panel) { abierto = false; return; }
    panel.classList.add('hidden');
    abierto = false;
    var b = document.getElementById('menuBtn');
    if (b) {
      b.setAttribute('aria-expanded', 'false');
      b.classList.remove('is-open');
    }
  }

  function alternar() {
    if (abierto) cerrar(); else abrir();
  }

  /* El boton lleva onclick="toggleMenu()", asi que se resuelve por el
     nombre global. Se definen aqui, y con ello quedan anuladas las
     funciones del desplegable viejo si la pagina las trae. */
  global.toggleMenu = alternar;
  global.closeMenu = cerrar;

  /* Pulsar fuera del panel lo cierra. */
  document.addEventListener('click', function (e) {
    if (!abierto) return;
    var destino = e.target;
    if (panel && panel.contains(destino)) return;
    if (destino && destino.closest && destino.closest('#menuBtn')) return;
    cerrar();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && abierto) cerrar();
  });

  /* Al ensanchar la ventana el panel sobra: se cierra para que no se
     quede colgado en el sitio equivocado. */
  global.addEventListener('resize', function () {
    if (global.innerWidth > ANCHO_BREAKPOINT) cerrar();
  });

})(window);