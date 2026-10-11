/* ============================================================================
   ODISSEY — La isla del hero
   ----------------------------------------------------------------------------
   Isla flotante en isometrico con Steve encima, un arbol, una antorcha que
   parpadea y unas luciernagas. Todo con los sprites que ya habia en
   js/dala-art.js: no se anade ninguna imagen ni ninguna fuente.

   POR QUE EXISTE
   El <canvas id="dalaConstellation"> estaba en el HTML desde el principio,
   con su CSS y su espacio reservado... y sin una linea de codigo que lo
   pintara. La columna derecha se quedaba en negro.
   ============================================================================ */
(function (global) {
  'use strict';

  var lienzo = document.getElementById('dalaConstellation');
  if (!lienzo) return;

  var ctx = lienzo.getContext('2d');
  if (!ctx) return;

  function arte() { return global.DalaArt; }

  /* Antorcha: poste de madera con la punta encendida. Se pinta aqui con la
     MISMA paleta que exporta el motor, para que el color sea exactamente
     el de los bloques de al lado. */
  var ANTORCHA = [
    '...yyy...',
    '..yfyfy..',
    '..yfyfy..',
    '...fFf...',
    '....b....',
    '....b....',
    '....b....',
    '....b....',
    '....B....',
    '...BBB...',
  ];

  /* Steve sin las cuatro filas de suelo.
     El sprite de dala-art.js acaba con cuatro filas de hierba y tierra:
     estaba pensado para un dibujo donde el personaje salia sobre un bloque
     y asi no hacia falta sombra. Aqui, con el bloque ya dibujado debajo,
     esas filas salian como una barra oscura bajo los pies y parecian que
     Steve flotaba. Se quitan y se le pone su propia sombra. */
  var STEVE = [
    '....jjjjjjjj....', '....jJJJJJJj....', '....jjjjjjjj....', '....qqqqqqqq....',
    '....qVVvVVVq....', '....qVVvVVVq....', '....qNNNNNNq....', '....qqqqqqqq....',
    'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz',
    'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz',
    'AAAAAAAAAAAAaaAA', 'aaaaAAAAaaaaaaAA', 'aaaaAAAAaaaaaaAA', 'aaaaAAAAaaaaaaAA',
    'aaaaaAAaaaaaAAa', 'aaaaaAAaaaaaAAa', 'aaaaaAAaaaaaAAa', 'aaaaaAAaaaaaAAa',
  ];

  function pintarSprite(cnv, filas, x, y, px) {
    var PAL = arte().PAL;
    var ancho = filas[0].length;
    var x0 = Math.round(x - (ancho * px) / 2);
    var y0 = Math.round(y - (filas.length * px) / 2);
    for (var f = 0; f < filas.length; f++) {
      var fila = filas[f];
      for (var c = 0; c < ancho; c++) {
        var ch = fila.charAt(c);
        if (ch === '.' || !PAL[ch]) continue;
        cnv.fillStyle = PAL[ch];
        cnv.fillRect(x0 + c * px, y0 + f * px, px, px);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Medidas                                                             */
  /* ------------------------------------------------------------------ */

  var e = null;
  var RADIO = 4.6;

  function medir() {
    var caja = lienzo.parentElement;
    var ancho = caja ? caja.clientWidth : 0;
    var alto = caja ? caja.clientHeight : 0;
    if (!ancho || !alto) return false;

    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* La isla ocupa de lado a lado 4 * RADIO * hw. Se elige hw para que
       entre con aire: si se pasa de ancho, la isla toca los bordes y
       parece una plancha recortada en vez de una isla. */
    var hw = Math.max(8, Math.min(ancho, alto) / (RADIO * 4 + 1));

    e = {
      ancho: ancho,
      alto: alto,
      hw: hw,
      hh: hw / 2,
      /* Canto del bloque. Un poco MAS que la mitad del ancho del rombo,
         que es lo que hace que un bloque parezca un cubo y no una
         lamina. Con 0,42 (lo que habia) las capas de abajo se metian
         debajo de las de arriba y la isla salia sin fondo. */
      hgt: Math.round(hw * 0.50),
      cx: ancho / 2,
      cy: alto * 0.46,
    };
    /* Steve mide casi dos bloques de alto. Es la mascara de la pagina:
       un poco mas grande de lo real, para que se lea desde el movil. */
    e.pxSteve = Math.max(3, Math.round(hw / 7));
    return true;
  }

  /* Posicion de la cara superior del bloque (gx, gy).
       nivel  = por debajo de la superficie (positivo = mas abajo)
       altura = por encima (un arbol, una antorcha) */
  function casilla(gx, gy, nivel, altura) {
    return {
      x: e.cx + (gx - gy) * e.hw,
      y: e.cy + (gx + gy) * e.hh + (nivel || 0) * e.hgt - (altura || 0) * e.hgt,
    };
  }

  /* La superficie, que es donde se pisan las cosas. */
  function suelo(gx, gy, altura) {
    var p = casilla(gx, gy, 0, altura);
    return { x: p.x, y: p.y + e.hgt };
  }

  /* ------------------------------------------------------------------ */
  /* La isla                                                              */
  /* ------------------------------------------------------------------ */

  /* Casillas de un circulo, no de un rombo. Un rombo con los mismos lados
     es una plancha de esquinas: es lo que parecia la primera version. */
  function circulo(r) {
    var out = [];
    var n = Math.ceil(r);
    for (var gx = -n; gx <= n; gx++) {
      for (var gy = -n; gy <= n; gy++) {
        if (gx * gx + gy * gy <= r * r) out.push([gx, gy]);
      }
    }
    return out;
  }

/* La segunda capa mantiene el MISMO radio que la primera, y por eso se ve
     entera: al no estrecharse, su cara de delante cae justo debajo de la
     de arriba y no queda tapada. Si se estrecha desde el primer nivel, la
     roca se mete por dentro de la tierra y la isla sale como un disco
     verde con un filo. A partir de la segunda ya se va encogiendo, que
     es lo que le da la forma de isla flotante. */
  var CAPAS = [
    { r: RADIO, nivel: 0, tex: { top: 'cesped_top', left: 'cesped_lado', right: 'cesped_lado' } },
    { r: RADIO, nivel: 1, tex: { top: 'dirt', side: 'dirt' } },
    { r: RADIO - 1.0, nivel: 2, tex: { top: 'dirt', side: 'dirt' } },
    { r: RADIO - 1.7, nivel: 3, tex: { top: 'piedra', side: 'piedra' } },
    { r: RADIO - 2.3, nivel: 4, tex: { top: 'piedra', side: 'piedra' } },
    { r: RADIO - 2.9, nivel: 5, tex: { top: 'piedra', side: 'piedra' } },
  ];

  /* Un arbol: tronco de dos bloques y copa de hojas. */
  var ARBOL = { gx: -2, gy: -1 };
  var MONTANA = { gx: 2, gy: -2, altura: [1, 2] };

  function bloques() {
    var lista = [];
    CAPAS.forEach(function (capa) {
      circulo(capa.r).forEach(function (g) {
        lista.push({ gx: g[0], gy: g[1], nivel: capa.nivel, altura: 0, tex: capa.tex });
      });
    });

/* El arbol va ENCIMA de la superficie, asi que altura > 0.
       Tronco de dos bloques y copa de cuatro, en cruz, como en el juego. */
    lista.push({ gx: ARBOL.gx, gy: ARBOL.gy, nivel: 0, altura: 0, tex: { top: 'tronco', side: 'tronco' } });
    lista.push({ gx: ARBOL.gx, gy: ARBOL.gy, nivel: 0, altura: 1, tex: { top: 'tronco', side: 'tronco' } });
    lista.push({ gx: ARBOL.gx, gy: ARBOL.gy, nivel: 0, altura: 2, tex: { top: 'tronco', side: 'tronco' } });
    [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      lista.push({
        gx: ARBOL.gx + d[0], gy: ARBOL.gy + d[1], nivel: 0, altura: 3,
        tex: { top: 'hojas', side: 'hojas' },
      });
    });
lista.push({ gx: ARBOL.gx, gy: ARBOL.gy, nivel: 0, altura: 4, tex: { top: 'hojas', side: 'hojas' } });

    /* Orden del pintor: primero lo de atras (gx+gy pequeno), y a igual
       profundidad primero lo de mas abajo. Si se hace al reves se ven las
       caras a traves de las de delante. */
    lista.sort(function (a, b) {
      if (a.gx + a.gy !== b.gx + b.gy) return (a.gx + a.gy) - (b.gx + b.gy);
      if (a.nivel !== b.nivel) return b.nivel - a.nivel;
      return a.altura - b.altura;
    });
    return lista;
  }

  function dibujarIsla(desplaz) {
    var A = arte();
    bloques().forEach(function (b) {
      var p = casilla(b.gx, b.gy, b.nivel, b.altura);
      A.cube(ctx, p.x, p.y + desplaz, e.hw, e.hh, e.hgt, b.tex);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Steve                                                                */
  /* ------------------------------------------------------------------ */

function dibujarSteve(t, des) {
    var px = e.pxSteve;
    var altoSprite = STEVE.length * px;
    var pie = suelo(2, 1, 0);
    pie.y += des;

    ctx.save();
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(pie.x, pie.y - 1, px * 0.85, px * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var bamboleo = Math.sin(t / 1500) * (e.hgt * 0.15);
    pintarSprite(ctx, STEVE, pie.x, pie.y - altoSprite / 2 + bamboleo, px);
  }

  /* ------------------------------------------------------------------ */
  /* Antorcha                                                             */
  /* ------------------------------------------------------------------ */

  function dibujarAntorcha(t, des) {
    var px = Math.max(3, Math.round(e.hw / 5));
    var altoSprite = ANTORCHA.length * px;
    var base = suelo(-1, 2, 0);
    base.y += des;
    var luzY = base.y - altoSprite;

    /* No hay sprite de fuego. Se hace con un halo: un fuego dibujado con
       caracteres de la paleta quedaria mas falso que una luz que late. */
    var latido = 0.86 + Math.sin(t / 170) * 0.09 + Math.sin(t / 60) * 0.05;
    var r = px * 11 * latido;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(base.x, luzY, 0, base.x, luzY, r);
    halo.addColorStop(0, 'rgba(255,200,110,' + (0.40 * latido).toFixed(3) + ')');
    halo.addColorStop(0.35, 'rgba(255,145,45,0.14)');
    halo.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(base.x, luzY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    pintarSprite(ctx, ANTORCHA, base.x, base.y - altoSprite / 2, px);
  }

  /* ------------------------------------------------------------------ */
  /* Luciernagas                                                          */
  /* ------------------------------------------------------------------ */

  var chispas = [];
  function sembrar(n) {
    chispas = [];
    for (var i = 0; i < n; i++) {
      chispas.push({
        x: Math.random(), y: Math.random(),
        v: 0.00012 + Math.random() * 0.00030,
        f: 0.0015 + Math.random() * 0.003,
        fase: Math.random() * Math.PI * 2,
      });
    }
  }

  function dibujarChispas(t, dt) {
    for (var i = 0; i < chispas.length; i++) {
      var c = chispas[i];
      c.y -= c.v * dt;
      if (c.y < -0.05) { c.y = 1.05; c.x = Math.random(); }
      var x = c.x * e.ancho + Math.sin(t * c.f + c.fase) * 22;
      var y = c.y * e.alto;
      var brillo = 0.32 + 0.44 * Math.sin(t * c.f * 1.7 + c.fase);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,214,120,' + brillo.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Bucle                                                                */
  /* ------------------------------------------------------------------ */

  var raf = null;
  var t0 = 0;
  var ultimo = 0;

  function sinMovimiento() {
    try {
      return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (x) { return false; }
  }

function pintar(t) {
    ctx.clearRect(0, 0, e.ancho, e.alto);
    /* El vaiven. Lo que esta SOBRE la isla tiene que moverse con ella:
       si Steve se queda quieto, cuando la isla sube le come las piernas
       y parece que se hunde. */
    var des = Math.sin(t / 2300) * (e.hgt * 0.35);
    dibujarIsla(des);
    dibujarAntorcha(t, des);
    dibujarSteve(t, des);
  }

  function paso(ahora) {
    raf = global.requestAnimationFrame(paso);
    if (!t0) { t0 = ahora; ultimo = ahora; }
    var dt = Math.min(ahora - ultimo, 64);
    ultimo = ahora;
    pintar(ahora - t0);
    dibujarChispas(ahora - t0, dt);
  }

  function arrancar() {
    if (!medir()) return;
    if (raf) global.cancelAnimationFrame(raf);
    raf = null;
    t0 = 0;
    raf = global.requestAnimationFrame(paso);
  }

  /* Con "reducir movimiento" se pinta UN fotograma y se para. */
  function pintarQuieto() {
    if (!medir()) return;
    ctx.clearRect(0, 0, e.ancho, e.alto);
    pintar(0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,214,120,0.5)';
    for (var i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * e.ancho, Math.random() * e.alto, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function iniciar() {
    sembrar(26);
    if (sinMovimiento()) { pintarQuieto(); return; }

    /* Fuera de pantalla no se dibuja. */
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
      }, 160);
    });

    arrancar();
  }

  if (global.DalaArt) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (global.DalaArt) iniciar();
    });
  }
})(window);