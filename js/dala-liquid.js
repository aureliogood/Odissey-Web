/* =============================================================
   ORBE LÍQUIDO DEL LOGIN
   -------------------------------------------------------------
   Hay dos cosas que se mueven aquí:

   1. Las metaballs de dentro. Se empujan entre sí y rebotan contra
      los bordes, y cada una lleva su propio estilo con WAAPI. Es la
      parte barata: solo transform, sin tocar el layout.

   2. El filtro SVG de turbulencia, que es lo que deforma el
      contorno del orbe. Va por requestAnimationFrame porque el
      feDisplacementMap no se puede animar con CSS.

   El paso 2 es el que hace que el aspecto cambie cada frame, asi
   que si se pide menos movimiento se baja a 30fps para no castigar
   el movil.
   ============================================================= */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var raiz = null;
  var orbe = null;
  var bolas = [];
  var disp = null;
  var turb = null;
  var filtro = 'dala-liquid-distort';
  var anims = [];
  var vivo = false;
  var reduce = false;
  var fase = 0;

  /* El filtro. stdDeviation es lo que hace que el liquido se mueva:
     mas alto = mas borrosa la deformacion; fluctuando, el contorno
     respira. */
  function crearFiltro() {
    /* Si el filtro ya esta en la pagina, se reutiliza en vez de crear
       otro. Antes se anadía uno nuevo cada vez que se montaba el orbe,
       y acababan coexistiendo varios <svg> con el mismo id. El
       document.querySelector del tick cogia siempre el primero (el
       viejo), que ya no receive nada, mientras el bucle animaba el
       ultimo: la burbuja se quedaba congelada al cambiar de pestana. */
    var previo = document.getElementById('dala-liquid-svg');
    if (previo) {
      disp = previo.querySelector('#' + filtro + ' feDisplacementMap');
      turb = previo.querySelector('#' + filtro + ' feTurbulence');
      if (disp && turb) return;
      previo.parentNode.removeChild(previo);
    }

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'dala-liquid-svg');
    svg.setAttribute('aria-hidden', 'true');

    var defs = document.createElementNS(NS, 'defs');
    var f = document.createElementNS(NS, 'filter');
    f.setAttribute('id', filtro);
    f.setAttribute('x', '-60%');
    f.setAttribute('y', '-60%');
    f.setAttribute('width', '220%');
    f.setAttribute('height', '220%');

    turb = document.createElementNS(NS, 'feTurbulence');
    turb.setAttribute('type', 'fractalNoise');
    turb.setAttribute('baseFrequency', '0.021 0.037');
    turb.setAttribute('numOctaves', '2');
    turb.setAttribute('seed', '7');

    disp = document.createElementNS(NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic');
    disp.setAttribute('scale', '0');
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'G');

    f.appendChild(turb);
    f.appendChild(disp);
    defs.appendChild(f);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  /* Las metaballs. Cada una lleva su propio keyframe distinto para que
     no se muevan al unisono; si fueran iguales se veria un pulso raro. */
  var DURACIONES = [3400, 4100, 2900, 5200];

  function crearBolas() {
    var cuerpo = orbe.querySelector('.dala-liquid__body');
    if (!cuerpo) return;

    for (var i = 0; i < 4; i++) {
      var b = document.createElement('span');
      b.className = 'dala-liquid__ball';
      /* cada bola nace en un punto distinto del orbe */
      var ang = (i / 4) * Math.PI * 2 + 0.6;
      var rad = 12 + (i % 2) * 8;
      b.style.left = (50 + Math.cos(ang) * rad) + '%';
      b.style.top = (50 + Math.sin(ang) * rad) + '%';
      b.style.marginLeft = '-23px';
      b.style.marginTop = '-23px';
      b.style.opacity = String(0.55 + (i % 3) * 0.14);
      cuerpo.appendChild(b);
      bolas.push(b);
    }
  }

  function animarBolas() {
    var i, b;
    /* Element.animate() es la Web Animations API. No esta en todos los
       navegadores, y donde falta esta llamada revienta el script entero:
       el login se queda sin burbuja liquid a medio montar.
       Si no esta, se hace una animacion con CSS: el orbe se ve menos
       vivo, pero funciona. */
    var hayApi = !!(bolas[0] && typeof bolas[0].animate === 'function');
    var animsCss = hayApi ? null : document.createElement('style');
    if (!hayApi && animsCss) {
      animsCss.textContent = '.dala-liquid__body{animation:dala-liquid-vaiven 7s ease-in-out infinite}@keyframes dala-liquid-vaiven{0%,100%{transform:translate3d(0,0,0) scale(1)}33%{transform:translate3d(12px,-9px,0) scale(1.15)}66%{transform:translate3d(-8px,7px,0) scale(0.94)}}';
      document.head.appendChild(animsCss);
    }
    for (i = 0; i < bolas.length; i++) {
      b = bolas[i];
      /* Cada bola recorre un vaiven distinto, dentro del orbe. Las
         amplitudes y fases se sacan del indice para que no coincidan. */
      var dx = (i % 2 ? 1 : -1) * (14 + i * 7);
      var dy = (i < 2 ? 1 : -1) * (10 + i * 6);
      var dur = DURACIONES[i % DURACIONES.length];
      if (!hayApi) continue;
      anims[i] = b.animate([
        { transform: 'translate3d(0,0,0) scale(1)' },
        { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(1.18)' },
        { transform: 'translate3d(' + (-dx * 0.6) + 'px,' + (-dy * 0.8) + 'px,0) scale(0.92)' },
        { transform: 'translate3d(0,0,0) scale(1)' }
      ], {
        duration: dur,
        iterations: Infinity,
        easing: 'cubic-bezier(.45,.05,.55,.95)',
        delay: -dur * (i / bolas.length)
      });
    }
  }

  /* El vaiven del filtro. Se sube y baja la deformacion y la frecuencia
     del ruido: eso es lo que hace que el liquido parezca vivo. */
  var ultimo = 0;
  var intervalo = 16;

  function tick(ahora) {
    if (!vivo) return;
    requestAnimationFrame(tick);
    if (ahora - ultimo < intervalo) return;
    /* El intervalo se calcula aqui y no al cargar el archivo: reduce solo
       se sabe al montar, y antes de eso valia false, asi que pedir menos
       movimiento no Bajaba la burbuja a 30fps como decia el comentario de
       arriba. */
    intervalo = reduce ? 66 : 16;
    ultimo = ahora;

    /* El SVG del filtro puede haberse reescrito por completo (al
       cambiar de pestana del login se rehace el formulario). Si las
       referencias que guardamos ya no estan en la pagina, se buscan
       otra vez: si no, se seguiria escribiendo sobre nodos sueltos y
       la burbuja pareceria congelada. */
    if (!disp || !disp.isConnected) {
      disp = document.querySelector('#' + filtro + ' feDisplacementMap');
      turb = document.querySelector('#' + filtro + ' feTurbulence');
    }
    if (!disp) return;

    fase += 0.016;
    var t = fase;

    /* Dos senos que no van al mismo ritmo: la suma nunca se repite
       del todo, que es justo lo que se busca. */
    var a = Math.sin(t * 0.9);
    var b = Math.sin(t * 1.37 + 1.1);
    var c = Math.cos(t * 0.63);

    /* Poco deformacion: si se pasa de ~14 el contorno se abre tanto que el
       orbe deja de parecer una gota y se ve como una mancha. */
    var escala = 7 + a * 3.4 + b * 2.1;
    var fx = (0.021 + b * 0.006).toFixed(4);
    var fy = (0.037 + c * 0.009).toFixed(4);

    if (disp) disp.setAttribute('scale', escala.toFixed(2));
    if (turb) {
      turb.setAttribute('baseFrequency', fx + ' ' + fy);
      /* la semilla se mueve un poco para que el ruido no se repita */
      turb.setAttribute('seed', String(3 + Math.floor((t * 0.35) % 6)));
    }
  }

  /* Esta True mientras el orbe siga siendo el mismo nodo del DOM.
     Al cambiar de pestana (entrar / crear cuenta) el formulario se
     reescribe entero, asi que el nodo viejo desaparece y hay que
     volver a construirlo. */
  function montadoEnVivo() {
    return !!(raiz && raiz.isConnected && document.contains(raiz) &&
              raiz.querySelector('.dala-liquid__orb'));
  }

  function montar() {
    /* Si ya esta montado y vivo, no se toca nada. */
    if (montadoEnVivo() && vivo) return;

    /* Si el nodo anterior ya no esta en la pagina, se limpian las
       referencias y las bolas viejas antes de empezar de cero. */
    if (raiz && !montadoEnVivo()) {
      pararBolas();
      bolas = [];
      orbe = null;
      raiz = null;
    }

    /* El nodo sigue en la pagina pero vivo es false porque el modal se
       cerro con desmontar(). Antes aqui soloacia "return" y la burbuja se
       quedaba congelada para el resto de la sesion en cuanto se abria y
       cerraba el login una vez. */
    if (raiz && !vivo) {
      vivo = true;
      ultimo = 0;
      requestAnimationFrame(tick);
      return;
    }

    raiz = document.querySelector('[data-liquid-root]');
    if (!raiz) return;

    orbe = raiz.querySelector('.dala-liquid__orb');
    if (!orbe) return;

    reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    intervalo = reduce ? 66 : 16;

    crearFiltro();
    crearBolas();
    if (!reduce) animarBolas();

    vivo = true;
    ultimo = 0;
    requestAnimationFrame(tick);
  }

  function pararBolas() {
    for (var i = 0; i < anims.length; i++) {
      if (anims[i] && anims[i].cancel) anims[i].cancel();
    }
    anims = [];
  }

  function desmontar() {
    vivo = false;
    pararBolas();
  }

  /* El orbe se monta cuando aparece el modal y se desmonta al cerrarse,
     para no dejar un rAF corriendo en una pagina que ya no lo ensea. */
  document.addEventListener('DOMContentLoaded', montar);
  window.addEventListener('pageshow', function () { setTimeout(montar, 0); });

  global.DalaLiquid = {
    montar: montar,
    desmontar: desmontar
  };
})(window);