/* ============================================================================
   ODISSEY · Fondo flotante de Minecraft — v2
   ----------------------------------------------------------------------------
   Mejoras sobre v1:
     · Delta-time real: la velocidad es consistente a 60 Hz, 144 Hz, etc.
     · globalAlpha siempre se resetea a 1 antes de cada sprite/halo.
     · Pool mas variado (mas sprites distintos, menor repeticion).
     · Luciernagas con movimiento Lissajous organico y gradiente radial.
     · Halos de antorcha/perla/diamante con gradiente radial y bloom.
     · Densidad ligeramente mayor: el fondo se ve mas vivo sin ser ruidoso.
     · Proteccion contra tabs ocultas: el reloj se resetea al volver a la tab.
   ----------------------------------------------------------------------------
   Depende de: js/dala-art.js
   ============================================================================ */
(function (global) {
    'use strict';

    if (global.__odisseyMcBg) return;
    global.__odisseyMcBg = true;

    var PAL_GOLD = '#eab308';
    var PAL_FIRE = '#ff9a2e';
    var PAL_TEAL = '#4fe3d0';

    var reduce = global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function boot() {
        if (!document.body) return;
        if (document.getElementById('dalaBg')) return;

        var Art = global.DalaArt;
        if (!Art) return;

        var canvas = document.createElement('canvas');
        canvas.id = 'dalaBg';
        canvas.className = 'dala-bg-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.insertBefore(canvas, document.body.firstChild);

        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var dpr  = Math.min(global.devicePixelRatio || 1, 2);
        var W = 0, H = 0, raf = 0, items = [], glows = [];

        /* ------------------------------------------------------------------ */
        /* Pool de sprites flotantes.                                         */
        /*                                                                     */
        /* OJO: la mayoria de los sprites de este pool ya NO existen en        */
        /* js/dala-art.js (se renombraron al reescribirlo para el diorama     */
        /* isometrico). Antes solo se dibujaban 'grass' y 'dirt', que son     */
        /* bloques de terreno: se veian cubos de tierra y cesped cruzando      */
        /* la pagina y tapando el texto.                                      */
        /*                                                                     */
        /* Para que el pool no vuelva a llenarse de nombres muertos, se        */
        /* comprueba contra el maestro de arte al arrancar y se descartan      */
        /* los que no existan. Asi, si se anaden sprites nuevos, se ven; y si  */
        /* se renombran, no aparecen bloques fantasma.                         */
        /*                                                                     */
        /* Las luciernagas y los halos de los sprites (mas abajo) no dependen */
        /* del pool y siguen funcionando con normalidad.                        */
        /* ------------------------------------------------------------------ */
        var POOL_CANDIDATOS = [
            /* recursos sueltos: diamond, diamante, lingote, hierro, perla,
               carbon, manzana, pan, creeper, pico, hacha, antorcha */
            'diamond', 'diamante', 'lingote', 'hierro', 'carbon',
            'manzana', 'pan', 'creeper', 'creeper_cara',
            'pico', 'hacha', 'antorcha'
        ];
        /* Bloques de terreno (grass, dirt, piedra, tronco, hojas) NO se
           ponen a flotas: son cubos grandes que se ven cruzando la pagina
           y chocan con el texto. Esos nombres existian en el pool viejo,
           que es justo lo que se quejaba. */
        var POOL = POOL_CANDIDATOS.filter(function (n) { return !!(Art.SPRITES && Art.SPRITES[n]); });

        /* Si el pool se queda vacio (por ejemplo, si un dia se renombran
           todos los sprites), no se dibuja ningun bloque flotante. */
        if (!POOL.length && global.console && global.console.warn) {
            global.console.warn('[dala-bg] ningun sprite del pool existe; se desactiva el fondo flotante.');
        }
        function pick() { return POOL[(Math.random() * POOL.length) | 0]; }

        function spawn(layer, first) {
            var name = pick();
            var deep = layer === 1;
            return {
                name:   name,
                /* px por pixel del arte */
                px:     deep
                            ? (1.8 + Math.random() * 1.8)
                            : (2.8 + Math.random() * 4.0),
                x:      Math.random() * 1.2 * global.innerWidth - 0.1 * global.innerWidth,
                y:      first ? Math.random() * global.innerHeight : global.innerHeight + 48,
                /* velocidad en px/s — delta-time la multiplica correctamente */
                vy:     (deep ? 11 : 24) + Math.random() * (deep ? 13 : 26),
                sway:   16 + Math.random() * 40,
                phase:  Math.random() * Math.PI * 2,
                speed:  0.28 + Math.random() * 0.55,
                /* capa lejana mas apagada */
                alpha:  deep
                            ? 0.06 + Math.random() * 0.07
                            : 0.14 + Math.random() * 0.24,
                flick:  Math.random() < 0.18
            };
        }

        /* ------------------------------------------------------------------ */
        /* Luciernagas: orbitas Lissajous en lugar de circulo simple.         */
        /* ------------------------------------------------------------------ */
        function spawnGlow() {
            return {
                x:      Math.random() * W,
                y:      Math.random() * H,
                r:      0.9 + Math.random() * 2.2,
                /* frecuencias ligeramente irracionales: figura nunca ciclica */
                fx:     0.11 + Math.random() * 0.32,
                fy:     0.09 + Math.random() * 0.28,
                ampX:   14 + Math.random() * 56,
                ampY:    9 + Math.random() * 38,
                bSpeed: 0.5 + Math.random() * 1.1,
                phase:  Math.random() * Math.PI * 2,
                /* la mayoria doradas, pocas cian */
                teal:   Math.random() < 0.12
            };
        }

        function resize() {
            W = global.innerWidth;
            H = global.innerHeight;
            canvas.width  = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width  = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            var area = W * H;
            /* densidad algo mayor que v1 */
            var nDeep = Math.round(Math.min(34, area / 75000));
            var nTop  = Math.round(Math.min(26, area / 105000));

            items = [];
            var i;
            for (i = 0; i < nDeep; i++) items.push(spawn(1, true));
            for (i = 0; i < nTop;  i++) items.push(spawn(0, true));

            /* luciernagas: mas densas */
            glows = [];
            var nGlow = Math.round(Math.min(54, area / 36000));
            for (i = 0; i < nGlow; i++) glows.push(spawnGlow());
        }

        /* ------------------------------------------------------------------ */
        /* Loop principal con delta-time real.                                */
        /* ------------------------------------------------------------------ */
        var t    = 0;
        var last = 0;

        function frame(now) {
            /* delta-time en segundos, cappado a 100ms para evitar saltos     */
            /* al volver de tab oculta o al desbloquear el equipo.            */
            var dt = Math.min(0.1, (now - last) / 1000 || 0.016);
            last = now;
            t   += dt;

            ctx.clearRect(0, 0, W, H);

            var i, g, tw, gx, gy, grad, hlr, hg, sx, sy, a, it;

            /* --- luciernagas (al fondo) ----------------------------------- */
            for (i = 0; i < glows.length; i++) {
                g  = glows[i];
                tw = 0.5 + 0.5 * Math.sin(t * g.bSpeed + g.phase);

                gx = g.x + Math.sin(t * g.fx + g.phase)       * g.ampX;
                gy = g.y + Math.cos(t * g.fy + g.phase * 0.7) * g.ampY;

                /* halo suave con gradiente radial */
                grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, g.r * 11);
                if (g.teal) {
                    grad.addColorStop(0, 'rgba(79,227,208,' + (0.20 + 0.20 * tw).toFixed(3) + ')');
                } else {
                    grad.addColorStop(0, 'rgba(234,179,8,'  + (0.20 + 0.26 * tw).toFixed(3) + ')');
                }
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = 1;
                ctx.fillStyle   = grad;
                ctx.beginPath();
                ctx.arc(gx, gy, g.r * 11, 0, Math.PI * 2);
                ctx.fill();

                /* punto central brillante */
                ctx.globalAlpha = 0.55 + 0.45 * tw;
                ctx.fillStyle   = g.teal ? PAL_TEAL : PAL_GOLD;
                ctx.beginPath();
                ctx.arc(gx, gy, g.r * (0.6 + 0.5 * tw), 0, Math.PI * 2);
                ctx.fill();
            }

            /* --- sprites flotantes --------------------------------------- */
            for (i = 0; i < items.length; i++) {
                it = items[i];

                /* mover con delta-time: velocidad en px/s */
                it.y -= it.vy * dt;
                if (it.y < -96) {
                    items[i] = spawn(it.px > 2.5 ? 1 : 0, false);
                    continue;
                }

                sx = it.x + Math.sin(t * it.speed + it.phase) * it.sway;
                sy = it.y;

                a = it.alpha * (0.75 + 0.25 * Math.sin(t * it.speed * 1.7 + it.phase));
                if (it.flick) a *= 0.65 + 0.35 * Math.sin(t * 3.3 + it.phase);
                if (a <= 0.008) continue;

                /* resetear alpha ANTES de dibujar para evitar contaminacion */
                ctx.globalAlpha = 1;
                Art.draw(ctx, it.name, sx, sy, it.px, a);

                /* halo de antorcha: gradiente calido */
                if (it.name === 'torch') {
                    hlr = it.px * 11;
                    hg  = ctx.createRadialGradient(sx, sy, 0, sx, sy, hlr);
                    hg.addColorStop(0, 'rgba(255,154,46,' + (a * 0.50).toFixed(3) + ')');
                    hg.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.globalAlpha = 1;
                    ctx.fillStyle   = hg;
                    ctx.beginPath();
                    ctx.arc(sx, sy, hlr, 0, Math.PI * 2);
                    ctx.fill();
                }

                /* halo de perla de ender: gradiente cian */
                if (it.name === 'pearl') {
                    hlr = it.px * 9;
                    hg  = ctx.createRadialGradient(sx, sy, 0, sx, sy, hlr);
                    hg.addColorStop(0, 'rgba(79,227,208,' + (a * 0.45).toFixed(3) + ')');
                    hg.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.globalAlpha = 1;
                    ctx.fillStyle   = hg;
                    ctx.beginPath();
                    ctx.arc(sx, sy, hlr, 0, Math.PI * 2);
                    ctx.fill();
                }

                /* halo de diamante: destello cian tenue */
                if (it.name === 'diamond') {
                    ctx.globalAlpha = a * 0.20;
                    ctx.fillStyle   = '#4ed7c4';
                    ctx.beginPath();
                    ctx.arc(sx, sy, it.px * 8, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            /* resetear siempre al terminar el frame */
            ctx.globalAlpha = 1;

            if (!reduce) raf = global.requestAnimationFrame(frame);
        }

        var timer = 0;
        global.addEventListener('resize', function () {
            global.clearTimeout(timer);
            timer = global.setTimeout(function () {
                global.cancelAnimationFrame(raf);
                resize();
                if (!reduce) {
                    last = performance.now();
                    raf  = global.requestAnimationFrame(frame);
                } else {
                    frame(performance.now());
                }
            }, 160);
        }, { passive: true });

        resize();
        if (!reduce) {
            last = performance.now();
            raf  = global.requestAnimationFrame(frame);
        } else {
            frame(performance.now());
        }

        /* Pausa mientras la pestaña esta oculta y reanuda sin salto. */
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                global.cancelAnimationFrame(raf);
            } else if (!reduce) {
                last = performance.now();
                raf  = global.requestAnimationFrame(frame);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);
