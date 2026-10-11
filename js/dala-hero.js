/* ============================================================================
   ODISSEY — La isla del hero
   ----------------------------------------------------------------------------
   Isla flotante en isometrico con Steve encima, una antorcha que parpadea y
   unas luciernagas. Todo con los sprites que ya habia en js/dala-art.js: no
   se anade ninguna imagen ni ninguna fuente.

   POR QUE EXISTE
   El <canvas id="dalaConstellation"> estaba en el HTML desde el principio,
   con su CSS y su espacio reservado... y sin una linea de codigo que lo
   pintara. La columna derecha se quedaba en negro.

   Asi que en vez de tapar el hueco con un rectangulo, aqui esta la escena.
   ============================================================================ */
(function (global) {
  'use strict';

  var lienzo = document.getElementById('dalaConstellation');
  if (!lienzo) return;

  var ctx = lienzo.getContext('2d');
  if (!ctx) return;

  function arte() { return global.DalaArt; }

  /* Antorcha: poste de madera con la punta encendida. No se mete en los
     SPRITES de dala-art.js porque ese archivo lo comparten otras paginas;
     se pinta aqui con la MISMA paleta que exporta el motor, asi que el
     color es exactamente el mismo que el de los bloques de alrededor. */
  var ANTORCHA = [
    '....y....',
    '...yfy...',
    '...yfy...',
    '....F....',
    '....b....',
    '....b....',
    '....b....',
    '....B....',
    '...BBB...',
    '...BBB...',
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

  function medir() {
    var caja = lienzo.parentElement;
    var ancho = caja ? caja.clientWidth : 0;
    var alto = caja ? caja.clientHeight : 0;
    if (!ancho || !alto) return false;

    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* hw = medio ancho del rombo. hh = la mitad, porque un rombo
       isometrico es 2:1; si no, la rejilla sale chueca. */
    var hw = Math.max(10, Math.min(ancho, alto) / 15);
    var hh = hw / 2;

    e = {
      ancho: ancho,
      alto: alto,
      hw: hw,
      hh: hh,
      /* Canto del bloque. Un poco menos que hh: da volumen sin que la
         isla parezca una torre. */
      hgt: Math.round(hw * 0.40),
      cx: ancho / 2,
      /* La isla se sube un poco: abajo queda sitio para la sombra y las
         luciernagas, y la escena no queda pegada al borde. */
      cy: alto * 0.40,
    };

    /* Escala de Steve. En el juego un jugador mide 1,8 bloques, pero aqui
       es la mascara de la pagina: se deja un poco mas alto para que se lea
       de lejos sin perderse entre los bloques. */
    e.pxSteve = Math.max(3, Math.round(hw / 9));
    return true;
  }

  /* Centro de la cara SUPERIOR del bloque de la casilla (gx, gy).
     Es el punto que cube() toma como origen.

     El nivel SUMA: el nivel 1 es un bloque MAS ABAJO que el 0. Restarlo
     ponia la tierra por encima del cesped y la isla salia con el centro
     marron y el borde verde. */
  function casilla(gx, gy, nivel) {
    return {
      x: e.cx + (gx - gy) * e.hw,
      y: e.cy + (gx + gy) * e.hh + (nivel || 0) * e.hgt,
    };
  }

  /* El suelo, es decir donde se pisan las cosas: el borde de abajo del
     bloque. */
  function suelo(gx, gy, nivel) {
    var p = casilla(gx, gy, nivel);
    return { x: p.x, y: p.y + e.hgt };
  }

  /* ------------------------------------------------------------------ */
  /* La isla                                                              */
  /* ------------------------------------------------------------------ */

  /* Diamante de radio r: casillas con |gx+gy| <= r. */
  function diamante(r) {
    var out = [];
    for (var gx = -r; gx <= r; gx++) {
      for (var gy = -r; gy <= r; gy++) {
        if (Math.abs(gx + gy) <= r) out.push([gx, gy]);
      }
    }
    return out;
  }

  /* Capas de la isla flotante. Cada una es mas pequena y mas abajo, que es
     lo que hace que se vea el tierra y la piedra colgando. */
  var CAPAS = [
    { r: 3, nivel: 0, tex: { top: 'cesped_top', left: 'cesped_lado', right: 'cesped_lado' } },
    { r: 2, nivel: 1, tex: { top: 'dirt', side: 'dirt' } },
    { r: 1, nivel: 2, tex: { top: 'piedra', side: 'piedra' } },
  ];

  function dibujarIsla(desplaz) {
    var A = arte();
    var bloques = [];

    CAPAS.forEach(function (capa) {
      diamante(capa.r).forEach(function (g) {
        bloques.push({ gx: g[0], gy: g[1], nivel: capa.nivel, tex: capa.tex });
      });
    });

    /* Orden del pintor: primero lo que esta mas atras, que es lo de
       arriba de la pantalla (gx+gy pequeno) y lo que cuelga mas abajo
       (nivel grande). Si se dibuja capa por capa, los bloques de tierra
       se cuelan ENCIMA del cesped y la isla sale con el centro-brown. */
    bloques.sort(function (a, b) {
      if (a.gx + a.gy !== b.gx + b.gy) return (a.gx + a.gy) - (b.gx + b.gy);
      return b.nivel - a.nivel;
    });

    bloques.forEach(function (b) {
      var p = casilla(b.gx, b.gy, b.nivel);
      A.cube(ctx, p.x, p.y + desplaz, e.hw, e.hh, e.hgt, b.tex);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Steve                                                                */
  /* ------------------------------------------------------------------ */

  function dibujarSteve(t) {
    var A = arte();
    var px = e.pxSteve;
    var altoSprite = A.altoDe('steve', px);
    var pie = suelo(0, 0, 0);

    /* Sombra antes que Steve, para que parezca que pisa el cesped. */
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(pie.x, pie.y, px * 0.9, px * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* draw() pinta por el centro: los pies van abajo, asi que el centro
       esta a media altura del sprite. */
    var bamboleo = Math.sin(t / 1500) * (e.hgt * 0.18);
    A.draw(ctx, 'steve', pie.x, pie.y - altoSprite / 2 + bamboleo, px);
  }

  /* ------------------------------------------------------------------ */
  /* Antorcha                                                             */
  /* ------------------------------------------------------------------ */

  function dibujarAntorcha(t) {
    // Misma escala que Steve: si se mide aparte, al cambiar el tamano del
    // canvas la antorcha se descuadra del resto.
    var px = e.pxSteve;
    var altoSprite = ANTORCHA.length * px;
    var base = suelo(-1, 0, 0);
    var ySprite = base.y - altoSprite / 2;

    /* No hay sprite de fuego. Se hace con un halo: un fuego dibujado con
       caracteres de la paleta quedaria mas falso que una luz que late. */
    var latido = 0.84 + Math.sin(t / 180) * 0.10 + Math.sin(t / 65) * 0.05;
    var luzY = base.y - altoSprite - px;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var r = px * 9 * latido;
    var halo = ctx.createRadialGradient(base.x, luzY, 0, base.x, luzY, r);
    halo.addColorStop(0, 'rgba(255,190,90,' + (0.32 * latido).toFixed(3) + ')');
    halo.addColorStop(0.4, 'rgba(255,140,40,0.10)');
    halo.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(base.x, luzY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    pintarSprite(ctx, ANTORCHA, base.x, ySprite, px);
  }

  /* ------------------------------------------------------------------ */
  /* Luciernagas                                                          */
  /* ------------------------------------------------------------------ */

  var chispas = [];
  function sembrar(n) {
    chispas = [];
    for (var i = 0; i < n; i++) {
      chispas.push({
        x: Math.random(),
        y: Math.random(),
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

      var x = c.x * e.ancho + Math.sin(t * c.f + c.fase) * 20;
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
    var des = Math.sin(t / 2100) * (e.hgt * 0.32);
    dibujarIsla(des);
    dibujarAntorcha(t);
    dibujarSteve(t);
  }

  function paso(ahora) {
    raf = global.requestAnimationFrame(paso);
    if (!t0) { t0 = ahora; ultimo = ahora; }
    var dt = Math.min(ahora - ultimo, 64);
    ultimo = ahora;
    var t = ahora - t0;

    pintar(t);
    dibujarChispas(t, dt);
  }

  function arrancar() {
    if (!medir()) return;
    if (raf) global.cancelAnimationFrame(raf);
    raf = null;
    t0 = 0;
    raf = global.requestAnimationFrame(paso);
  }

  /* Con "reducir movimiento" se pinta UN fotograma y se para. Se ve igual
     pero quieto: es lo que pide quien tiene esa opcion activada. */
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
    sembrar(24);

    if (sinMovimiento()) { pintarQuieto(); return; }

    /* Fuera de pantalla no se dibuja: un rAF corriendo en una pestana en
       segundo plano es bateria gastada sin que se vea nada. */
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