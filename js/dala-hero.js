/* ============================================================================
   ODISSEY — Degradado iridiscente del hero
   ----------------------------------------------------------------------------
   Un verde salvia que se disuelve en ambar y acaba en oxblood, moviéndose
   despacio y sin parar. Es el unico color de la pagina: la interfaz es
   negra y blanca, y esto va detras, como luz.

   QUE NO ES
   No es un degradado plano. Un linear-gradient se queda quieto y se lee
   como una franja de color; esto se mueve y nunca se repite igual, que es
   lo que lo hace parecer liquido.

   COMO ESTA HECHO
   Se dibuja en un lienzo DIMINUTO (unos 100 px de lado) y luego se escala
   al tamaño real. Al ampliarlo, el navegador interpola y sale suave de
   verdad. Es el mismo truco que usan los fondos de niebla: ademas de
   quedar mejor, es muchisimo mas barato que difuminar un lienzo grande,
   que obliga a la GPU a repintar millones de pixeles por fotograma.

   Ademas lleva un grano finísimo encima. Sin el, un degradado tan grande
   en unos pocos tonos produce bandas horizontales visibles en pantallas
   normales: el "escalonado" de los colores. El grano las rompe.
   ============================================================================ */
(function (global) {
  'use strict';

  var lienzo = document.getElementById('dalaConstellation');
  if (!lienzo) return;

  var ctx = lienzo.getContext('2d');
  if (!ctx) return;

  /* Los tres colores de la referencia:
       salvia -> ambar -> oxblood, con un blanco para los brillos. */
  var SALVIA = [160, 224, 171];
  var AMBAR = [255, 172, 46];
  var OXBLOOD = [165, 45, 37];
  var HUES = [SALVIA, AMBAR, OXBLOOD, SALVIA, AMBAR, OXBLOOD, [255, 236, 210]];

  /* Lado del lienzo diminuto. 96 px da una transicion muy suave al
     ampliar y sigue siendo barato de pintar. */
  var LADO = 96;

  var chico = document.createElement('canvas');
  chico.width = LADO;
  chico.height = LADO;
  var cctx = chico.getContext('2d');

  /* Cada mancha: color, amplitud y ritmo propios. Con numeros distintos
     los periodos no coinciden nunca y el conjunto no se repite a la vista,
     aunque en realidad sea periodico. */
  var manchas = HUES.map(function (color, i) {
    var semilla = i * 2.399963; /* numero aureo: reparte bien los fases */
    return {
      color: color,
      fx: 0.10 + (i % 3) * 0.037,
      fy: 0.083 + ((i + 1) % 4) * 0.029,
      px: semilla,
      py: semilla * 1.7,
      cx: 0.5 + 0.30 * Math.sin(semilla),
      cy: 0.5 + 0.26 * Math.cos(semilla * 0.8),
      ax: 0.26 + (i % 2) * 0.11,
      ay: 0.21 + ((i + 1) % 3) * 0.08,
      r0: 0.34 + ((i * 5) % 7) * 0.035,
      rf: 0.13 + ((i * 3) % 5) * 0.028,
      rp: semilla * 2.3,
    };
  });

  /* ------------------------------------------------------------------ */
  /* El grano que rompe las bandas de color                              */
  /* ------------------------------------------------------------------ */

  var grano = null;
  function granoPatron(cnv) {
    if (grano) return grano;
    var t = document.createElement('canvas');
    t.width = 64;
    t.height = 64;
    var c = t.getContext('2d');
    var img = c.createImageData(64, 64);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      /* Ruido entre 0 y 255, pero repartido: se usa como alfa. */
      var v = 118 + Math.floor(Math.random() * 74);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 26;
    }
    c.putImageData(img, 0, 0);
    grano = cnv.createPattern(t, 'repeat');
    return grano;
  }

  /* ------------------------------------------------------------------ */
  /* Pintado                                                              */
  /* ------------------------------------------------------------------ */

  var e = null;

  function medir() {
    var caja = lienzo.parentElement;
    var ancho = caja ? caja.clientWidth : 0;
    var alto = caja ? caja.clientHeight : 0;
    if (!ancho || !alto) return false;

    var dpr = Math.min(global.devicePixelRatio || 1, 1.5);
    lienzo.width = Math.max(1, Math.round(ancho * dpr));
    lienzo.height = Math.max(1, Math.round(alto * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    e = { ancho: ancho, alto: alto };
    return true;
  }

  function pintar(t) {
    if (!e) return;

    /* --- 1. Fondo, en el lienzo diminuto --- */
    cctx.globalCompositeOperation = 'source-over';
    cctx.fillStyle = '#05060a';
    cctx.fillRect(0, 0, LADO, LADO);

    /* --- 2. Las manchas, sumandolas ('lighter') --- */
    /* 'lighter' es lo que hace que se.sumen las luces y no que se
       tapan: dos manchas de color distintas se mezclan en un tono
       nuevo en vez de que la de encima tape a la de abajo. */
    cctx.globalCompositeOperation = 'lighter';

    manchas.forEach(function (m) {
      var x = m.cx + m.ax * Math.sin(t * m.fx + m.px);
      var y = m.cy + m.ay * Math.cos(t * m.fy + m.py);
      var r = m.r0 + m.rf * Math.sin(t * m.rf + m.rp);

      var cx = x * LADO;
      var cy = y * LADO;
      var rr = r * LADO;
      var c = m.color;

      var g = cctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      /* El centro casi opaco y el borde del todo transparente: si se
         llega al final con opacidad 0 de golpe se ve un aro.

         Y los numeros son bajos a proposito. La referencia pide una luz
         fundida, no un cartel fluorescente: con estos valores se ve el
         color pero el negro de la pagina sigue mandando, que es lo que
         hace que encaje al lado de texto blanco. */
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.62)');
      g.addColorStop(0.45, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.24)');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      cctx.fillStyle = g;
      cctx.fillRect(0, 0, LADO, LADO);
    });

    /* --- 2b. Borde blando ---
       Sin esto el lienzo es un cuadrado de color con los lados rectos
       encima de una pagina negra, y se ve como una pegatina. Se borra
       hacia fuera con 'destination-in', que va dejando los pixeles
       transparentes en vez de pintarlos de negro. */
    cctx.globalCompositeOperation = 'destination-in';
    /* El radio es MENOR que la mitad del lado, para que la mascara llegue
       a cero ANTES de los bordes del cuadrado. Si llega justo al borde, en
       el centro de cada lado todavia queda algo de alpha y se ve un
       rectangulo claro alrededor de la mancha. */
    var mask = cctx.createRadialGradient(LADO / 2, LADO / 2, 0, LADO / 2, LADO / 2, LADO * 0.54);
    mask.addColorStop(0, 'rgba(0,0,0,1)');
    mask.addColorStop(0.5, 'rgba(0,0,0,0.72)');
    mask.addColorStop(0.78, 'rgba(0,0,0,0.20)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = mask;
    cctx.fillRect(0, 0, LADO, LADO);

    /* --- 3. Volcar el diminuto al grande, ampliandolo con suavizado --- */
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, e.ancho, e.alto);
    var antes = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    /* La forma "cover": el diminuto se estira hasta cubrir el lienzo, y si
       sobra se recorta por el centro. */
    ctx.drawImage(chico, 0, 0, LADO, LADO, 0, 0, e.ancho, e.alto);
    ctx.imageSmoothingEnabled = antes;

    /* --- 4. El grano, encima ---
       'source-atop' y no 'overlay': source-atop solo pinta donde YA hay
       algo dibujado. Con overlay el grano se extendia por todo el
       rectangulo del lienzo, tambien por las partes que la mascara habia
       dejado transparentes, y se veia un borde vertical claro alrededor
       de la mancha. */
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = granoPatron(ctx);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, e.ancho, e.alto);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ------------------------------------------------------------------ */
  /* Bucle                                                                */
  /* ------------------------------------------------------------------ */

  var raf = null;
  var t0 = 0;

  function sinMovimiento() {
    try {
      return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (x) { return false; }
  }

  function paso(ahora) {
    raf = global.requestAnimationFrame(paso);
    if (!t0) t0 = ahora;
    pintar((ahora - t0) / 1000);
  }

  function arrancar() {
    if (!medir()) return;
    if (raf) global.cancelAnimationFrame(raf);
    raf = null;
    t0 = 0;
    raf = global.requestAnimationFrame(paso);
  }

  /* Con "reducir movimiento" se pinta un fotograma y se para. Se ve igual
     pero quieto, que es lo que pide quien tenga esa opcion puesta. */
  function pintarQuieto() {
    if (!medir()) return;
    pintar(3.4);
  }

  function iniciar() {
    if (sinMovimiento()) { pintarQuieto(); return; }

    /* Fuera de pantalla no se dibuja: un rAF en una pestaña en segundo
       plano es bateria gastada sin que se vea nada. */
    if (global.IntersectionObserver) {
      var io = new global.IntersectionObserver(function (entradas) {
        if (entradas[0].isIntersecting) {
          if (!raf) { t0 = 0; raf = global.requestAnimationFrame(paso); }
        } else if (raf) {
          global.cancelAnimationFrame(raf);
          raf = null;
        }
      }, { threshold: 0.01 });
      io.observe(lienzo);
    }

    var esperando;
    global.addEventListener('resize', function () {
      clearTimeout(esperando);
      esperando = setTimeout(function () {
        if (sinMovimiento()) pintarQuieto(); else arrancar();
      }, 180);
    });

    arrancar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window);