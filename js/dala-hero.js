/* ============================================================================
   ODISSEY · Diorama de Minecraft para el hero
   ----------------------------------------------------------------------------
   Isla hecha bloque a bloque con las proporciones del juego:
     - cesped con la cara de arriba verde y los laterales de tierra
     - agua liquida, translucida y con la superficie moviendose
     - vetas de diamante, oro, hierro y carbon en la piedra
     - un arbol de roble que Steve tala a hachazos, con particulas de rotura
   ============================================================================ */
(function (global) {
    'use strict';

    function create(canvas) {
        if (!canvas || !canvas.getContext) return null;
        var Art = global.DalaArt;
        if (!Art) return null;
        var ctx = canvas.getContext('2d');
        if (!ctx) return null;

        var reduce = global.matchMedia &&
            global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var dpr = Math.min(global.devicePixelRatio || 1, 2);

        var W = 0, H = 0, raf = 0, t = 0, dead = false;
        var HW = 20, HH = 11, CH = 17;
        var esc = 1;

        /* ---------------- terreno ---------------- */
        function altura(x, z) {
            var m = Math.max(Math.abs(x), Math.abs(z));
            var n = Math.abs(x) + Math.abs(z);
            if (m <= 1) return 4;
            if (m <= 2 && n <= 3) return 3;
            if (m <= 3 && n <= 5) return 3;
            if (m <= 3) return 2;
            if (m <= 4 && n <= 6) return 2;
            return 0;
        }

        var AGUA = { '2,3': 1, '3,3': 1, '3,2': 1, '2,2': 1, '3,1': 1 };
        var ARENAS = { '1,3': 1, '0,3': 1, '4,2': 1, '1,-3': 1 };
        var OBJETOS = {
            '-1,-2': 'mesa', '0,-2': 'horno', '-2,-2': 'cofre',
            '2,-1': 'antorcha', '-3,1': 'antorcha'
        };

        function esAgua(x, z) { return !!AGUA[x + ',' + z]; }
        function esArena(x, z) { return !!ARENAS[x + ',' + z]; }
        function objetoEn(x, z) { return OBJETOS[x + ',' + z] || null; }

        function hash(x, y, z) {
            var n = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
            n = (n ^ (n >> 13)) >>> 0;
            return (n % 1000) / 1000;
        }
        function mineralDe(x, y, z) {
            var h = hash(x, y, z);
            if (h > 0.94) return 'mineral_diamante';
            if (h > 0.885) return 'mineral_oro';
            if (h > 0.83) return 'mineral_hierro';
            if (h > 0.77) return 'mineral_carbon';
            return 'piedra';
        }

        var ARBOL = { x: -2, z: -1 };
        var TRONCO = 4;          /* bloques de tronco */

        /* ---------------- proyeccion ---------------- */
        var cx = 0, cy = 0;
        function proj(x, y, z) {
            return { x: cx + (x - z) * HW, y: cy + (x + z) * HH - y * CH };
        }

        function layout() {
            var rect = canvas.getBoundingClientRect();
            W = Math.max(220, rect.width || 380);
            H = Math.max(220, rect.height || 380);
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            esc = Math.min(W / 300, H / 280, 1.15);
            HW = 20 * esc; HH = 11 * esc; CH = 17 * esc;
            cx = W / 2;
            cy = H / 2 + 14 * esc;
        }

        /* ---------------- dibujo ---------------- */
        function dibujarTerreno() {
            var x, z, y, h, p, i;
            for (x = -4; x <= 4; x++) {
                for (z = -4; z <= 4; z++) {
                    h = altura(x, z);
                    if (h === 0) continue;
                    var ob = objetoEn(x, z);
                    var esAg = esAgua(x, z);
                    for (y = 0; y < h; y++) {
                        p = proj(x, y, z);
                        var tex;
                        if (esAg) {
                            tex = 'agua';
                        } else if (ob && y === h - 1 && (ob === 'mesa' || ob === 'horno' || ob === 'cofre')) {
                            tex = ob;
                        } else if (y === h - 1) {
                            /* cesped: arriba verde, laterales de tierra */
                            if (esArena(x, z)) tex = 'arena';
                            else tex = { top: 'cesped_top', side: 'cesped_lado' };
                        } else if (y === h - 2) {
                            tex = 'dirt';
                        } else {
                            tex = mineralDe(x, y, z);
                        }
                        /* el agua queda mas baja que el bloque */
                        var dy = esAg ? CH * 0.14 : 0;
                        Art.cube(ctx, p.x, p.y + dy, HW, HH, CH, tex, esAg ? 0.66 : 1);
                    }
                    if (ob === 'antorcha') {
                        p = proj(x, h, z);
                        Art.draw(ctx, 'antorcha', p.x, p.y - CH * 0.5, 2.6 * esc, 1);
                    }
                }
            }
        }

        /* Superficie del agua: ondas animadas con reflejo dorado y espuma. */
        function dibujarAgua() {
            var x, z, p;
            for (x = -4; x <= 4; x++) {
                for (z = -4; z <= 4; z++) {
                    if (!esAgua(x, z)) continue;
                    p = proj(x, altura(x, z), z);
                    var yy = p.y + CH * 0.14;

                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(p.x, yy - HH);
                    ctx.lineTo(p.x + HW, yy);
                    ctx.lineTo(p.x, yy + HH);
                    ctx.lineTo(p.x - HW, yy);
                    ctx.closePath();
                    ctx.clip();

                    /* gradiente azul profundo -> cian en superficie */
                    var wg = ctx.createLinearGradient(p.x, yy - HH, p.x, yy + HH);
                    wg.addColorStop(0, 'rgba(59,111,212,0.78)');
                    wg.addColorStop(1, 'rgba(34,91,181,0.58)');
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = wg;
                    ctx.fill();

                    /* crestas que se desplazan */
                    var f = Math.sin(t * 1.6 + (x + z) * 1.4);
                    ctx.globalAlpha = 0.28 + 0.18 * f;
                    ctx.strokeStyle = '#bfe0ff';
                    ctx.lineWidth = Math.max(1, HW * 0.07);
                    for (var k = -2; k <= 2; k++) {
                        var off = ((t * HW * 0.60) % (HH * 2)) - k * HH * 1.6;
                        ctx.beginPath();
                        ctx.moveTo(p.x - HW, yy - HH + off);
                        ctx.lineTo(p.x,      yy        + off);
                        ctx.lineTo(p.x + HW, yy - HH  + off);
                        ctx.stroke();
                    }

                    /* reflejo dorado tenue (como la luz del atardecer) */
                    var rf = 0.06 + 0.05 * Math.sin(t * 2.8 + x * 0.9);
                    ctx.globalAlpha = rf;
                    ctx.fillStyle = '#eab308';
                    ctx.fillRect(p.x - HW * 0.5, yy - HH * 0.5, HW * 0.5, HH * 0.4);

                    /* brillo blanco de la superficie */
                    ctx.globalAlpha = 0.16 + 0.10 * Math.sin(t * 2.1 + x);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(p.x - HW, yy - HH, HW * 0.65, HH * 0.45);

                    ctx.restore();
                    ctx.globalAlpha = 1;
                }
            }
        }

        /* =============================================================
   STEVE TALANDO — y el árbol que responde
   -------------------------------------------------------------
   Steve no es un sprite: son cajas con las medidas del modelo del
   juego (16 unidades de alto = 1 bloque), dibujadas con la misma
   proyección que el terreno. Por eso encaja con la isla.

   Ciclo completo:

     Ir      -> camina hasta el tronco, con las piernas alternas
     Talar   -> hachazos. El hacha gira desde el hombro, el cuerpo
                se inclina al golpear y el árbol se sacude
     Volver  -> retrocede y vuelve a empezar

   Cuando un tronco se rompe, ese bloque cae de verdad: le entra
   gravedad, gira y se desvanece. Eso es lo que hace que se entienda
   que el árbol baja, en vez de encogerse solo.
   ============================================================= */

        /* ---------------- hachazo ---------------- */
        /* Un vaiven por periodo, con la curva de un golpe real: se echa
           atras despacio, baja rapido y vuelve despacio. Los tramos no
           duran lo mismo, y eso es justo lo que lo hace natural. */
        var sacudida = 0;
        /* Mas lento que antes. El ritmo apurado era lo que hacia que
           pareciera una animacion de dibujos y no un jugador talando. */
        var PERIODO = 1.9;

        function curva(p) {
            if (p < 0.32) return -0.55 * (p / 0.32);
            if (p < 0.44) return -0.55 + 1.50 * ((p - 0.32) / 0.12);
            return 0.95 - 0.95 * ((p - 0.44) / 0.56);
        }

        /* ---------------- astillas ---------------- */
        var particulas = [];

        function chispa(gx, gy, gz, n) {
            for (var i = 0; i < n; i++) {
                particulas.push({
                    x: gx + (Math.random() - 0.5) * 0.55,
                    y: gy + (Math.random() - 0.5) * 0.45,
                    z: gz + (Math.random() - 0.5) * 0.55,
                    vx: (Math.random() - 0.5) * 2.2,
                    vy: 1.1 + Math.random() * 2.0,
                    vz: (Math.random() - 0.5) * 2.2,
                    vida: 1,
                    s: 0.8 + Math.random() * 0.6
                });
            }
            if (particulas.length > 60) particulas.splice(0, particulas.length - 60);
        }

        function actualizarParticulas(dt) {
            for (var i = particulas.length - 1; i >= 0; i--) {
                var p = particulas[i];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;
                p.vy -= 6.2 * dt;
                p.vida -= dt * 1.7;
                if (p.vida <= 0) particulas.splice(i, 1);
            }
        }

        function dibujarParticulas() {
            for (var i = 0; i < particulas.length; i++) {
                var pt = particulas[i];
                var p = proj(pt.x, pt.y, pt.z);
                var sz = HW * 0.16 * pt.s * (0.45 + pt.vida * 0.55);
                Art.cube(ctx, p.x, p.y, sz, sz * 0.55, sz * 0.85,
                         pt.vida > 0.5 ? 'tronco' : 'hojas', pt.vida);
            }
        }

        /* --- donde esta el arbol y donde trabaja Steve --- */
        /* Steve tala desde la celda de al lado y a su misma altura, para
           que no quede metido entre las hojas. */
        var TALANDO = { x: -2, z: 0 };
        var LEJOS = { x: -2, z: 1 };
        var FASES = { IR: 0, TALAR: 1, VOLVER: 2 };
        var faseSteve = FASES.IR;
        var relojFase = 0;
        var T_IR = 2.0, T_TALAR = 8.0, T_VOLVER = 2.0;

        var golpesTotales = 0;
        var golpeDado = false;      /* evita contar dos veces el mismo golpe */
        var talados = 0;            /* bloques de tronco ya rotos */
        var TRONCO_MIN = 1;         /* el tocón nunca se quita */
        var esperaCrecer = 0;

        /* estado del fotograma, para poder mirarlo desde fuera */
        var prog = 0, ang = 0;

        function troncoVivo() { return TRONCO - talados; }

        /* Cuando solo queda el tocón, el árbol espera un rato y vuelve a
           crecer. Si no, se queda pelado para siempre. */
        function actualizarArbol(dt) {
            if (talados < TRONCO - TRONCO_MIN) { esperaCrecer = 0; return; }
            esperaCrecer += dt;
            if (esperaCrecer > 5) {
                talados = TRONCO - TRONCO_MIN - 1;
                esperaCrecer = 0;
            }
        }

        function suave(x) {
            /* aceleracion y frenada, sin rebote */
            return x * x * (3 - 2 * x);
        }

        /* ---------------- tronco que se cae ---------------- */
        var caidos = [];

        /* Un bloque de tronco que se acaba de romper: sale despedida y
           gira hasta desaparecer. La gravedad es la misma feel que la del
           juego: cae accelerating y al disappearance se desvanece. */
        function soltarTronco(bx, by, bz) {
            caidos.push({
                x: bx, y: by, z: bz,
                vy: 0.7,
                giro: 0,
                velGiro: (Math.random() - 0.5) * 2.6,
                vida: 1.4,
                dx: (Math.random() - 0.5) * 0.05
            });
            if (caidos.length > 8) caidos.shift();
        }

        function actualizarCaidos(dt) {
            for (var i = caidos.length - 1; i >= 0; i--) {
                var c = caidos[i];
                c.vy -= 9.4 * dt;         /* gravedad */
                c.y += c.vy * dt;
                c.x += c.dx;
                c.giro += c.velGiro * dt;
                c.vida -= dt * 0.55;
                if (c.vida <= 0 || c.y < -2) caidos.splice(i, 1);
            }
        }

        function dibujarCaidos() {
            for (var i = 0; i < caidos.length; i++) {
                var c = caidos[i];
                var p = proj(c.x, c.y, c.z);
                /* al caer se encoge un poco, como si se perdiera de vista */
                var esc = 1 - (1 - c.vida) * 0.25;
                ctx.save();
                /* el giro se nota mas cuanto mas cerca del suelo: se
                   aplana al girar, como un bloque que cae de canto */
                var a = ctx.globalAlpha;
                ctx.globalAlpha = Math.min(1, c.vida) * 0.95;
                Art.cube(ctx, p.x, p.y, HW * esc, HH * esc * (1 - c.giro * 0.12), CH * esc, 'tronco', Math.min(1, c.vida));
                ctx.restore();
            }
        }

        /* ---------------- Steve ---------------- */

        /* ---------------- el arbol ---------------- */
        /* El tronco se dibuja entero menos los bloques ya rotos, y la
           copa baja pegada a la punta que queda. Asi, al talar, el arbol
           se ve encoger de verdad. */
        function dibujarArbol() {
            var base = altura(ARBOL.x, ARBOL.z);
            var vivos = troncoVivo();
            var y, i, p;

            /* el arbol entero si no se ha talado nada, o solo el tocón */
            if (vivos > 0) {
                for (y = 0; y < vivos; y++) {
                    p = proj(ARBOL.x, base + y, ARBOL.z);
                    Art.cube(ctx, p.x + sacudida * (y + 1) * 0.1, p.y, HW, HH, CH, 'tronco');
                }
            }

            /* sin copa cuando ya no queda mas que el tocón */
            if (vivos <= 1) return;

            /* La copa pierde una capa por cada tronco que se rompe. Antes
               solo distinguia entre "arbol entero" y "casi sin copa", asi
               que el cambio se veia a saltos y parecia que no avanzaba. */
            var punta = base + vivos;
            var anillo = [[-1, -1], [0, -1], [1, -1], [-1, 0],
                          [1, 0], [-1, 1], [0, 1], [1, 1]];
            var cruz = [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]];
            var capas;
            if (vivos >= 4) {
                capas = [{ y: punta - 1, c: anillo },
                         { y: punta, c: anillo },
                         { y: punta + 1, c: cruz }];
            } else if (vivos === 3) {
                capas = [{ y: punta - 1, c: anillo },
                         { y: punta, c: cruz }];
            } else {
                capas = [{ y: punta, c: cruz }];
            }
            for (var ci = 0; ci < capas.length; ci++) {
                var cc = capas[ci].c;
                for (i = 0; i < cc.length; i++) {
                    p = proj(ARBOL.x + cc[i][0], capas[ci].y, ARBOL.z + cc[i][1]);
                    Art.cube(ctx, p.x + sacudida * 0.5, p.y, HW, HH, CH, 'hojas');
                }
            }
        }

        function dibujarSteve(dt) {
            /* --- reloj de la maquina de estados --- */
            relojFase += dt;
            if (faseSteve === FASES.IR) {
                if (relojFase >= T_IR) { faseSteve = FASES.TALAR; relojFase = 0; }
            } else if (faseSteve === FASES.TALAR) {
                if (relojFase >= T_TALAR) { faseSteve = FASES.VOLVER; relojFase = 0; }
            } else if (faseSteve === FASES.VOLVER) {
                if (relojFase >= T_VOLVER) { faseSteve = FASES.IR; relojFase = 0; }
            }

            /* --- donde esta --- */
            var andando = false;
            if (faseSteve === FASES.IR) {
                prog = suave(Math.min(1, relojFase / T_IR)); andando = true;
            } else if (faseSteve === FASES.VOLVER) {
                prog = 1 - suave(Math.min(1, relojFase / T_VOLVER)); andando = true;
            } else {
                prog = 1;
            }
            var sx = Math.round(LEJOS.x + (TALANDO.x - LEJOS.x) * prog);
            var sz = Math.round(LEJOS.z + (TALANDO.z - LEJOS.z) * prog);

            /* --- el hachazo --- */
            ang = 0;
            var golpeando = false;
            if (faseSteve === FASES.TALAR) {
                golpeando = true;
                var q = (relojFase % PERIODO) / PERIODO;
                ang = curva(q);
                /* cuando el hacha pasa por abajo, golpea */
                if (ang > 0.55 && !golpeDado) {
                    golpeDado = true;
                    golpesTotales++;
                    /* Tres golpes por tronco. Con dos caia demasiado rapido
                       y el arbol se tenia pelado en 8 segundos; con cuatro
                       parecia que no avanzaba. Tres es el punto en el que
                       se ve caer un bloque sin tener que esperar. */
                    if (golpesTotales % 3 === 0 && talados < TRONCO - TRONCO_MIN) {
                        /* se rompe un tronco: cae de verdad */
                        talados++;
                        soltarTronco(ARBOL.x, altura(ARBOL.x, ARBOL.z) + troncoVivo(), ARBOL.z);
                    }
                    /* astillas de madera en el punto de impacto */
                    chispa(ARBOL.x, altura(ARBOL.x, ARBOL.z) + Math.max(0, troncoVivo() - 1) + 0.5, ARBOL.z, 7);
                    sacudida = 1;
                } else if (ang <= 0.55) {
                    golpeDado = false;
                }
            } else {
                golpeDado = false;
            }
            sacudida *= 0.90;
            if (sacudida < 0.02) sacudida = 0;

            /* --- el cuerpo --- */
            var base = altura(sx, sz);
            if (base === 0) base = 1;
            var U = CH / 16;                       /* una unidad del modelo */
            var px = cx + (sx - sz) * HW;
            var py = cy + (sx + sz) * HH - base * CH;

            /* Bamboleo al andar. Muy contenido a proposito: en Minecraft
               el jugador no cabecea, se limita a desplazar las piernas. Un
               bamboleo estrecho y con el peso quieto es lo que separa "un
               personaje que camina" de "un dibujo que se mueve". */
            var paso = andando ? Math.sin(relojFase * 8.5) : 0;
            var peso = paso * HW * 0.035;
            var alza = andando ? Math.abs(paso) * U * 0.35 : 0;
            /* Inclinacion al golpear: leve y solo en la parte alta del
               cuerpo. Antes se inclinaba todo y parecia una mueca. */
            var lean = golpeando ? Math.max(0, ang) * 0.022 : 0;

            /* sombra */
            ctx.globalAlpha = 0.36;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(px + peso * 0.4, py + U * 0.5, HW * 0.40, HH * 0.24, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            /* Cada pieza es una caja. Las medidas son las del modelo del
               juego: cabeza 8, torso y miembros 12, todo sobre U. */
            function caja(w, h, dxU, yTop, tex) {
                var k = w / 16;
                /* dxU y el lean desplazan en horizontal, la altura yTop
                   es la cara de arriba de la pieza */
                Art.cube(ctx,
                    px + peso + dxU * U * 1.4 + lean * (yTop * U) * 1.6,
                    py - yTop * U - alza,
                    HW * k, HH * k, h * U,
                    tex);
            }

            /* --- piernas: 4 de ancho, 12 de alto, alternas al andar --- */
            var stride = andando ? paso * 3.4 : 0;
            caja(4, 12, -2 / 16 - stride * 0.04, 12, 'pierna_j');
            caja(4, 12, 2 / 16 + stride * 0.04, 12, 'pierna_j');

            /* --- torso: 8 de ancho, 12 de alto --- */
            caja(8, 12, 0, 24, 'torso_j');

            /* --- brazo izquierdo, quieto al costado --- */
            caja(4, 12, -5.5, 24, 'brazo_j');

            /* --- el brazo del hacha: pivota en el hombro --- */
            var hx = px + peso + 5.5 * U * 1.4 + lean * (24 * U) * 1.6;
            var hy = py - 24 * U - alza;
            ctx.save();
            ctx.translate(hx, hy);
            /* el hacha va atras al cargar y adelante al golpear */
            ctx.rotate(ang * 1.05);
            var aw = 4 / 16;
            var awHW = HW * aw, awHH = HH * aw;
            /* el brazo cuelga del hombro: su cara de arriba esta en el
               hombro (y=0) y baja 12 unidades hasta la mano */
            Art.cube(ctx, 0, 0, awHW, awHH, 12 * U, 'brazo_j');
            /* El hacha va agarrada en la mano, que esta al final del
               brazo. El sprite tiene la hoja arriba y el mango abajo, asi
               que se coloca con el pie del mango en la mano: la hoja asoma
               por encima del hombro, como cuando se lleva el hacha en el
               juego. */
            var pxHacha = U * 1.0;
            var altoHacha = 16 * pxHacha;
            Art.draw(ctx, 'hacha', awHW * 0.12, 12 * U - altoHacha * 0.5, pxHacha, 1);
            ctx.restore();

            /* --- cabeza: 8 de ancho, 8 de alto --- */
            /* Encima pelo siempre. El rostro va en la cara que mira al
               arbol: el tronco esta en -z respecto a Steve, y en la
               proyeccion eso cae a la derecha, asi que la cara va en la
               cara derecha. Si se pondria en la izquierda, Steve miraria
               hacia el lado contrario del arbol. */
            Art.cube(ctx,
                px + peso + lean * (32 * U) * 1.6, py - 32 * U - alza,
                HW * 0.5, HH * 0.5, 8 * U,
                { top: 'cabeza_pelo', left: 'cabeza_pelo', right: 'cabeza_cara' });
        }
function frame(dt) {
            ctx.clearRect(0, 0, W, H);

            var sg = ctx.createRadialGradient(cx, cy + 66, 6, cx, cy + 66, 128);
            sg.addColorStop(0, 'rgba(0,0,0,0.55)');
            sg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.ellipse(cx, cy + 66, 126, 26, 0, 0, Math.PI * 2);
            ctx.fill();

            dibujarTerreno();
            dibujarArbol();
            dibujarAgua();
            dibujarSteve(dt);
            dibujarCaidos();
            dibujarParticulas();
        }

        var ultimo = 0;
        function loop() {
            var ahora = performance.now();
            var dt = Math.min(0.05, (ahora - ultimo) / 1000 || 0.016);
            ultimo = ahora;
            t += dt;
            actualizarParticulas(dt);
            actualizarCaidos(dt);
            actualizarArbol(dt);
            frame(dt);
            raf = global.requestAnimationFrame(loop);
        }

        var timer = 0;
        function onResize() {
            global.clearTimeout(timer);
            timer = global.setTimeout(function () {
                if (dead) return;
                layout();
                if (!reduce) { global.cancelAnimationFrame(raf); raf = global.requestAnimationFrame(loop); }
                else frame(0.016);
            }, 150);
        }

        layout();
        if (!reduce) raf = global.requestAnimationFrame(loop);
        else frame(0.016);

        global.addEventListener('resize', onResize, { passive: true });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                global.cancelAnimationFrame(raf);
            } else if (!dead && !reduce) {
                /* resetear el reloj para evitar salto de fisica al volver */
                ultimo = performance.now();
                raf    = global.requestAnimationFrame(loop);
            }
        });

        return {
            resize: layout,
            destroy: function () {
                dead = true;
                global.cancelAnimationFrame(raf);
                global.clearTimeout(timer);
                global.removeEventListener('resize', onResize);
            }
        };
    }

    global.DalaHero = { create: create };
})(window);
