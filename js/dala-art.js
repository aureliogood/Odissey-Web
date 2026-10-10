/* ============================================================================
   ODISSEY · Arte pixelado de Minecraft
   ----------------------------------------------------------------------------
   Sprites dibujados a mano en rejillas (un caracter = un pixel) y un motor
   isometrico para construir bloques. Los colores son los del juego: hierba
   #7CBD6B, tierra #8B6141, piedra #7F7F7F, roble #6B4F2A, hojas #4A7C2F.
   ============================================================================ */
(function (global) {
    'use strict';

    var PAL = {
        /* bloques */
        g: '#7cbd6b', G: '#6aa35c',          /* hierba */
        d: '#8b6141', D: '#6b4a2f',          /* tierra */
        s: '#8a8a8a', S: '#737373',          /* piedra */
        w: '#d9d9d9', W: '#bcbcbc',          /* madera clara / hierro */
        b: '#6b4f2a', B: '#4e3a1e',          /* roble */
        e: '#4a7c2f', E: '#3b6526',          /* hojas */
        n: '#dbd3a0', N: '#c2b98a',          /* arena */
        u: '#3b6fd4', U: '#2a5bb5',          /* agua */
        f: '#e86a17', F: '#c24e0f',          /* lava */
        t: '#8b6a3f', T: '#5c4326',          /* mesa de trabajo */
        o: '#6e6e6e', O: '#4a4a4a',          /* horno */
        x: '#b87f3e', X: '#7d5324',          /* cofre */
        /* recursos */
        c: '#4ed7c4', C: '#22a893',          /* diamante */
        y: '#f2c744', Y: '#b8891a',          /* oro */
        l: '#5aa832', L: '#3d7a1c',          /* creeper */
        k: '#2b2b2b',                        /* carbon */
        r: '#c8402f', R: '#8d2718',          /* manzana */
        p: '#2b6f63',                        /* perla de ender */
        /* piel y ropa de Steve, con los tonos de la skin original */
        q: '#c99b6a', Q: '#a97a4c',          /* piel clara / sombra */
        j: '#5b3d24', J: '#72502f',          /* pelo */
        V: '#f2f2f2', v: '#4a4aa8',          /* blanco del ojo / iris */
        z: '#31b0a6', Z: '#21897f',          /* camiseta */
        A: '#4f4f9e', a: '#3a3a77',          /* pantalon */
        M: '#4a3524'                         /* zapatos */
    };

    function rep(f, n) { return new Array(n + 1).join(f); }

    /* Mineral: base de piedra con un veta central en forma de rombo. */
    function mineral(ch) {
        var g = [];
        for (var y = 0; y < 16; y++) {
            var fila = '';
            for (var x = 0; x < 16; x++) {
                var d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
                if (d <= 4.2) fila += ch;
                else fila += ((x + y * 2) % 5 === 0) ? 'S' : 's';
            }
            g.push(fila);
        }
        return g;
    }

    /* Mesa de trabajo: madera con la cuadricula. */
    function mesa() {
        var g = [];
        for (var y = 0; y < 16; y++) {
            var fila = '';
            for (var x = 0; x < 16; x++) {
                var borde = (x === 0 || x === 15 || y === 0 || y === 15);
                var linea = (x === 5 || x === 10 || y === 5 || y === 10);
                fila += (borde || linea) ? 'T' : 't';
            }
            g.push(fila);
        }
        return g;
    }

    /* Horno: piedra con la boca oscura y el fuego. */
    function horno() {
        var g = [];
        for (var y = 0; y < 16; y++) {
            var fila = '';
            for (var x = 0; x < 16; x++) {
                if (x === 0 || x === 15 || y === 15) fila += 'O';
                else if (y >= 6 && y <= 11 && x >= 4 && x <= 11) fila += (y >= 8 && y <= 10) ? 'f' : 'k';
                else fila += ((x + y) % 4 === 0) ? 'S' : 's';
            }
            g.push(fila);
        }
        return g;
    }

    /* Cesped: la cara de arriba va toda verde y los laterales son tierra con
       la franja verde. Es como esta en el juego, y con una sola textura el
       bloque parecia un borde verde con tierra en medio. */
    function cespedTop() {
        var g = [];
        for (var y = 0; y < 16; y++) {
            var f = '';
            for (var x = 0; x < 16; x++) f += ((x * 3 + y * 5) % 9 === 0) ? 'G' : 'g';
            g.push(f);
        }
        return g;
    }
    function cespedLado() {
        var g = [];
        for (var y = 0; y < 16; y++) {
            var f = '';
            for (var x = 0; x < 16; x++) {
                /* la franja verde baja y sube, como el borde del cesped */
                var borde = y < 4 + (x % 3 === 0 ? 1 : 0) + (x % 5 === 0 ? 1 : 0);
                if (borde) f += ((x + y) % 3 === 0) ? 'G' : 'g';
                else f += ((x * 3 + y * 5) % 7 === 0) ? 'D' : 'd';
            }
            g.push(f);
        }
        return g;
    }

    var RAW = {
        /* --------- bloques --------- */
        cesped_top: cespedTop(),
        cesped_lado: cespedLado(),
        grass: (function () {
            var g = [];
            for (var y = 0; y < 16; y++) {
                var fila = '';
                for (var x = 0; x < 16; x++) {
                    if (y < 3) fila += ((x + y) % 4 === 0) ? 'G' : 'g';
                    else fila += ((x * 3 + y * 5) % 7 === 0) ? 'D' : 'd';
                }
                g.push(fila);
            }
            return g;
        })(),
        dirt: (function () {
            var g = [];
            for (var y = 0; y < 16; y++) {
                var fila = '';
                for (var x = 0; x < 16; x++) fila += ((x * 3 + y * 5) % 7 === 0) ? 'D' : 'd';
                g.push(fila);
            }
            return g;
        })(),
        piedra: (function () {
            var g = [];
            for (var y = 0; y < 16; y++) {
                var fila = '';
                for (var x = 0; x < 16; x++) fila += ((x + y * 2) % 5 === 0) ? 'S' : 's';
                g.push(fila);
            }
            return g;
        })(),
        arena: (function () {
            var g = [];
            for (var y = 0; y < 16; y++) {
                var fila = '';
                for (var x = 0; x < 16; x++) fila += ((x * 2 + y) % 5 === 0) ? 'N' : 'n';
                g.push(fila);
            }
            return g;
        })(),
        tronco: (function () {
            var g = [];
            for (var y = 0; y < 16; y++) {
                var fila = '';
                for (var x = 0; x < 16; x++) fila += (x % 4 === 0 || x % 7 === 1) ? 'B' : 'b';
                g.push(fila);
            }
            return g;
        })(),
        hojas: (function () {
            var g = [];
            for (var y = 0; y < 16; y++) {
                var fila = '';
                for (var x = 0; x < 16; x++) fila += ((x * 5 + y * 3) % 7 === 0) ? 'E' : 'e';
                g.push(fila);
            }
            return g;
        })(),
        agua: (function () {
            var g = [];
            for (var y = 0; y < 16; y++) {
                var fila = '';
                for (var x = 0; x < 16; x++) fila += ((x + y) % 6 === 0) ? 'U' : 'u';
                g.push(fila);
            }
            return g;
        })(),
        /* --------- minerales --------- */
        mineral_diamante: mineral('c'),
        mineral_oro: mineral('y'),
        mineral_hierro: mineral('w'),
        mineral_carbon: mineral('k'),
        /* --------- objetos --------- */
        mesa: mesa(),
        horno: horno(),
        cofre: (function () {
            var g = [];
            for (var y = 0; y < 16; y++) {
                var fila = '';
                for (var x = 0; x < 16; x++) {
                    var borde = (x === 0 || x === 15 || y === 0 || y === 7);
                    var cierre = (x === 7 || x === 8) && y >= 7 && y <= 10;
                    fila += borde ? 'X' : (cierre ? 'k' : 'x');
                }
                g.push(fila);
            }
            return g;
        })(),
        diamante: [
            '................', '................', '......cccc......', '.....cccccc.....',
            '....ccCcccCcc...', '...ccCccccCccc..', '...cCccccccCcc..', '..ccCcccccccCcc.',
            '..cCcccCcccCcc..', '..cCcccCcccCcc..', '..ccCccccccCcc..', '...ccccccccccc..',
            '....ccccccccc...', '.....ccccccc....', '......ccccc.....', '................'
        ],
        lingote: [
            '................', '................', '.....yyyyyy.....', '....yYYYYYYy....',
            '...yyYYYYYYyy...', '..yyyYYYYYYyyy..', '.yyyyYYYYYYyyyy.', 'YYYYYYYYYYYYYYYY',
            'YYYYYYYYYYYYYYYY', '.YYYYYYYYYYYYYY.', '..YYYYYYYYYYYY..', '...YYYYYYYYYY...',
            '....YYYYYYYY....', '.....YYYYYY.....', '......YYYY......', '................'
        ],
        hierro: [
            '................', '................', '.....wwwwww.....', '....wWWwwwwWw....',
            '...wwWWwwWWww...', '..wwwWWwwWWwww..', '.wwwwWWwwWWwwww.', 'WWWWWWWWWWWWWWWW',
            'WWWWWWWWWWWWWWWW', '.WWWWWWWWWWWWWW.', '..WWWWWWWWWWWW..', '...WWWWWWWWWW...',
            '....WWWWWWWW....', '.....WWWWWW.....', '......WWWW......', '................'
        ],
        carbon: [
            '................', '................', '......kkkk......', '.....kkkkkk.....',
            '....kkkKkkkk...', '...kkKKkkkkkk...', '..kkkKKkkkkkkk..', '..kkKKkkkkkkkk..',
            '..kkkkKKkkkkkk..', '..kkkkkKKkkkkk..', '..kkkkKKkkkkkk..', '...kkKKkkkkkk...',
            '....kkkKkkkk...', '.....kkkkkk.....', '......kkkk......', '................'
        ],
        manzana: [
            '................', '......b.........', '.....bb...rr....', '....eb...rrrr...',
            '...ee..rrrrrrr..', '...ee.rrrRrrrr..', '..ee..rrrRrrrrr.', '..e..rrrRrrrrrr.',
            '..e..rrrrrrrrrrr', '..e..rrrrrrrrrrr', '..e...rrrrrrrrrr', '...e...rrrrrrrrr',
            '....e...rrrrrrr.', '.....e....rrrr..', '......e.........', '................'
        ],
        pan: [
            '................', '................', '...tttttttttt...', '..tTTttttttTTt..',
            '.tTTTttttttTTTt.', '.tTTt.tttt.tTTt.', '.tTTTttttttTTTt.', '.tTTttttttttTTt.',
            '.tTTt.tttttTTt.', '.tTTt.ttttttTTt.', '.tTTTttttTTTTt.', '..tTTTTTTTTTTt..',
            '...tttttttttt...', '................', '................', '................'
        ],
        /* --------- creatures --------- */
        creeper_cara: [
            '................', '....kkkkkk......', '...kkkkkkkk.....', '...kkkkkkkk.....',
            '...kkk..kkkk....', '...kkk..kkkk....', '..kkkkkkkkkkk...', '..kkkkkkkkkkk...',
            '...kkkkkkkkk....', '....kkkkkkk.....', '..kkk.kkkk.kkk..', '.kkkk.kkkk.kkkk.',
            '.kkkk.kkkk.kkkk.', '.kkk...kk...kk..', '................', '................'
        ],
        creeper: [
            '................', '..llllllllllll..', '.llllllllllllll.', '.lllLLLLLLLLlll.',
            'llLlLLLLLLLLlLll', 'llLlLLLLLLLLlLll', 'llLLLLLLLLLLLLll', 'llLLLLLLLLLLLLll',
            'llLLLLLLLLLLLLll', 'llLllLLLLLLlLLll', 'llLllLLLLLLlLLll', 'llLllLLLLLLlLLll',
            '.llLllLLllLll...', '..llllllllllll..', '................', '................'
        ],
        pico: [
            '................', '.........ccc....', '........ccccc...', '.......ccccC....',
            '......ccccC.....', '.....ccccC......', '....ccccC.......', '...ccccC........',
            '..ccC...........', '..cC............', '.cc......bbb....', '.c......b..bb...',
            '.c.....b...bb...', '.c....bb...bb...', '.c....bb...bb...', '.c.....bb..bb...'
        ],
        /* Hacha de hierro, con el mango de roble y el contorno oscuro que
           llevan los objetos del juego. */
        hacha: [
            '................',
            '......kkkk......',
            '.....kwwwwk.....',
            '....kwwwwwwk....',
            '...kwwWWwwwwk...',
            '..kwwWWwwwwwWk..',
            '..kwWWWwwwwwWWk.',
            '...kWWWWWWWWWk..',
            '.....ktttk......',
            '......kttk......',
            '......kttk......',
            '......kttk......',
            '......kttk......',
            '......kttk......',
            '......kttk......',
            '................'
        ],
        antorcha: [
            '.......f........', '......fff.......', '.....fFFfF......', '.....fFFyf......',
            '......fFf.......', '......fyf.......', '......fyf.......', '......fyf.......',
            '......fyf.......', '.....fFFyf......', '......fyf.......', '......fyf.......',
            '......fyf.......', '.....bbbby......', '.....bbbb.......', '.....bbbb.......'
        ],
        /* --------- Steve: piezas del modelo, con medidas reales ---------
           Cabeza 8x8x8, torso 8x12x4, brazos y piernas 4x12x4. */
        cabeza_cara: [
            'jjjjjjjj', 'jJJJJJJj', 'jjjjjjjj', 'qqqqqqqq',
            'qVVvVVVq', 'qVVvVVVq', 'qNNNNNNq', 'qQQQQQQq'
        ],
        /* la cara de atras: todo pelo, sin ojos */
        cabeza_atras: [
            'jjjjjjjj', 'jJJJJJJj', 'jjjjjjjj', 'jjjjjjjj',
            'jjjjjjjj', 'jjjjjjjj', 'jjjjjjjj', 'jjjjjjjj'
        ],
        /* piel lisa, para las caras que no llevan el rostro */
        piel: [
            'qqqqqqqq', 'qQQQQQQq', 'qqqqqqqq', 'qqqqqqqq',
            'qqqqqqqq', 'qqqqqqqq', 'qqqqqqqq', 'qqqqqqqq'
        ],
        /* la oreja / lateral: pelo arriba, piel y barba abajo */
        cabeza_lat: [
            'jjjjjjjj', 'jJJJJJJj', 'jjjjjjjj', 'qqqqqqqq',
            'qqqqQQqN', 'qqQQQQqN', 'qqQQQQqq', 'qqqqQQqq'
        ],
        cabeza_pelo: [
            'jjjjjjjj', 'jJJJJJJj', 'jjjjjjjj', 'jjjjjjjj',
            'jjjjjjjj', 'jjjjjjjj', 'jjjjjjjj', 'jjjjjjjj'
        ],
        /* Torso 8 x 12. La camiseta de Steve es turquesa apagado y
           lleva cinturilla; el cuello va en piel. */
        torso_j: [
            'qqqqqqqq', 'zZZZZZZz', 'zzzzzzzz', 'zzzzzzzz',
            'zzzzzzzz', 'zzzzzzzz', 'zzzzzzzz', 'zzQQQQzz',
            'zzzzzzzz', 'zzzzzzzz', 'zzzzzzzz', 'zzzzzzzz'
        ],
        /* Brazo 4 x 12: manga arriba, mano en piel abajo. */
        brazo_j: [
            'zzzz', 'zzzz', 'zzzz', 'zzzz',
            'zzzz', 'zzzz', 'zzzz', 'zzQQ',
            'qqQQ', 'qqQQ', 'qqQQ', 'qqQQ'
        ],
        /* Pierna 4 x 12: pantalon y zapato. */
        pierna_j: [
            'aaaa', 'aAAa', 'aAAa', 'aAAa',
            'aAAa', 'aAAa', 'aAAa', 'aAAa',
            'aaaa', 'aaaa', 'MMMM', 'MMMM'
        ],
        /* --------- Steve en miniature, 16 x 32 --------- */
        steve: [
            '....jjjjjjjj....', '....jJJJJJJj....', '....jjjjjjjj....', '....qqqqqqqq....',
            '....qVVvVVVq....', '....qVVvVVVq....', '....qNNNNNNq....', '....qqqqqqqq....',
            'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz',
            'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz', 'zzzzZZZZZZZZzzzz',
            'AAAAAAAAAAAAaaAA', 'aaaaAAAAaaaaaaAA', 'aaaaAAAAaaaaaaAA', 'aaaaAAAAaaaaaaAA',
            'aaaaaAAaaaaaAAa', 'aaaaaAAaaaaaAAa', 'aaaaaAAaaaaaAAa', 'aaaaaAAaaaaaAAa',
            '....llllllll....', '....DDDDDDDD....', '....DDDDDDDD....', '....DDDDDDDD....'
        ]
    };

    var SPRITES = {};
    Object.keys(RAW).forEach(function (k) { SPRITES[k] = { rows: RAW[k], size: RAW[k].length }; });

    /* Cache de sprites ya escalados: dibujar uno es un solo drawImage. */
    var cache = {};
    function bake(name, px) {
        var key = name + '@' + px;
        if (cache[key]) return cache[key];
        var sp = SPRITES[name];
        if (!sp) return null;
        var ancho = sp.rows[0].length;
        var cv = document.createElement('canvas');
        cv.width = ancho * px;
        cv.height = sp.size * px;
        var c = cv.getContext('2d');
        for (var y = 0; y < sp.rows.length; y++) {
            var fila = sp.rows[y];
            for (var x = 0; x < ancho; x++) {
                var ch = fila.charAt(x);
                if (ch === '.' || ch === '#' || !PAL[ch]) continue;
                c.fillStyle = PAL[ch];
                c.fillRect(x * px, y * px, px, px);
            }
        }
        cache[key] = cv;
        return cv;
    }

    function draw(ctx, name, x, y, px, alpha) {
        var cv = bake(name, px);
        if (!cv) return;
        if (alpha !== undefined) ctx.globalAlpha = alpha;
        ctx.drawImage(cv, Math.round(x - cv.width / 2), Math.round(y - cv.height / 2));
    }

    function anchoDe(name, px) { return SPRITES[name].rows[0].length * px; }
    function altoDe(name, px) { return SPRITES[name].size * px; }

    function shade(hex, f) {
        var n = parseInt(hex.slice(1), 16);
        return 'rgb(' +
            Math.min(255, Math.round(((n >> 16) & 255) * f)) + ',' +
            Math.min(255, Math.round(((n >> 8) & 255) * f)) + ',' +
            Math.min(255, Math.round((n & 255) * f)) + ')';
    }

    /* Textura ya sombreada, cacheada por factor. */
    var sombreador = {};
    function caraSombreada(tex, factor) {
        var key = tex + '@' + factor;
        if (sombreador[key]) return sombreador[key];
        var base = bake(tex, 4);
        if (!base) return null;
        var cv = document.createElement('canvas');
        cv.width = base.width;
        cv.height = base.height;
        var c = cv.getContext('2d');
        c.drawImage(base, 0, 0);
        if (factor !== 1) {
            c.globalCompositeOperation = 'source-atop';
            c.fillStyle = 'rgba(0,0,0,' + (1 - factor).toFixed(3) + ')';
            c.fillRect(0, 0, cv.width, cv.height);
            c.globalCompositeOperation = 'source-over';
        }
        sombreador[key] = cv;
        return cv;
    }

    /* ------------------------------------------------------------------
       Bloque isometrico. Cada cara es un cuadrilatero y la textura se
       coloca con una transformacion afin, no con triangulos: asi el bloque
       conserva los pixeles nítidos del sprite.
       ------------------------------------------------------------------ */
    function cube(ctx, x, y, hw, hh, hgt, tex, alpha) {
        /* tex puede ser un nombre o un objeto para cuando las caras no son
           iguales: {top, side} para el cesped, o {top, left, right} para
           la cabeza de Steve, que solo lleva rostro en un lado. */
        var t = tex;
        if (typeof tex === 'string') t = { top: tex, side: tex };
        if (!t.side) t.side = t.left || t.right || t.top;

        var sup = caraSombreada(t.top, 1.12);
        var izq = caraSombreada(t.left || t.side, 0.70);
        var der = caraSombreada(t.right || t.side, 0.46);
        if (!sup) return;

        if (alpha !== undefined) ctx.globalAlpha = alpha;
        var prev = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;

        /* cara superior: rombo (x-hw,y) -> (x,y-hh) -> (x+hw,y) -> (x,y+hh) */
        ctx.save();
        ctx.transform(hw, -hh, hw, hh, x - hw, y);
        ctx.drawImage(sup, 0, 0, 1, 1);
        ctx.restore();

        /* cara izquierda */
        ctx.save();
        ctx.transform(hw, hh, 0, hgt, x - hw, y);
        ctx.drawImage(izq, 0, 0, 1, 1);
        ctx.restore();

        /* cara derecha */
        ctx.save();
        ctx.transform(-hw, hh, 0, hgt, x + hw, y);
        ctx.drawImage(der, 0, 0, 1, 1);
        ctx.restore();

        ctx.imageSmoothingEnabled = prev;
        ctx.globalAlpha = 1;
    }

global.DalaArt = {
    PAL: PAL, SPRITES: SPRITES, draw: draw,
    anchoDe: anchoDe, altoDe: altoDe, shade: shade, cube: cube,
    /* Expuestos para el cubo 3D del hero, que necesita el lienzo ya
       horneado de una textura y la version sombreada de una cara. Sin
       esto tendria que duplicar la paleta aqui. */
    bake: bake, caraSombreada: caraSombreada
    };
})(window);