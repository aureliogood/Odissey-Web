/* ============================================================================
   ODISSEY · Steve del formulario de acceso
   ----------------------------------------------------------------------------
   Steve dibujado en SVG vectorial dentro de un marco circular, con la misma
   tecnica que el login de referencia:
     - dos SVG superpuestos: la cara y las manos
     - las manos entran desde abajo con un rotateX de verdad, en 3D
     - el parpadeo se anima cambiando ry y cy del ojo (no con scale)
     - al escribir, las pupilas siguen la posicion del cursor
     - al escribir la contrasena, las manos tapan los ojos
   Se vuelve a montar solo cada vez que auth.js repinta el formulario.
   ============================================================================ */
(function (global) {
    'use strict';
    if (global.__odisseySteve) return;
    global.__odisseySteve = true;

    var AVATAR = 176;   /* lado del marco circular, en px */

    /* --------------------------------------------------------------------
       La cabeza de Steve: cubo ligeramente isometrico, pelo, cejas, ojos,
       nariz, bigote y barba. Todo vectorial, sin pixeles.
       -------------------------------------------------------------------- */
    function caraSVG() {
        return '' +
        '<svg class="as-cara" viewBox="0 0 100 100" aria-hidden="true">' +
          '<g class="as-giro">' +
            /* sombra general bajo el pelo, da profundidad */
            '<rect x="16" y="22" width="68" height="68" rx="9" fill="#b5785a"/>' +
            /* cara superior del cubo: pelo */
            '<path d="M16 24 L31 12 H98 L84 24 Z" fill="#3a2412"/>' +
            /* lateral derecho: piel en sombra */
            '<path d="M84 24 L98 12 V78 L84 90 Z" fill="#a9714b"/>' +
            '<path d="M84 24 L98 12 V33 L84 45 Z" fill="#3a2412"/>' +
            /* cara frontal */
            '<rect x="16" y="24" width="68" height="66" rx="9" fill="#c68b6b"/>' +
            /* pelo: flequillo y patillas */
            '<path d="M16 32 a9 9 0 0 1 9-9 h50 a9 9 0 0 1 9 9 v7 H16 Z" fill="#3a2412"/>' +
            '<path d="M16 30 h7 v30 a4 4 0 0 1 -7 0 Z" fill="#3a2412"/>' +
            '<path d="M84 30 h-7 v30 a4 4 0 0 0 7 0 Z" fill="#3a2412"/>' +
            /* cejas */
            '<rect x="26" y="46" width="16" height="4.4" rx="2.2" fill="#3a2412"/>' +
            '<rect x="58" y="46" width="16" height="4.4" rx="2.2" fill="#3a2412"/>' +
            /* ojos: el ry y el cy se animan para el parpadeo */
            '<ellipse class="as-ojo" cx="34" cy="58" rx="7.5" ry="5.6" fill="#f7f4ee"/>' +
            '<ellipse class="as-ojo" cx="66" cy="58" rx="7.5" ry="5.6" fill="#f7f4ee"/>' +
            /* pupilas: se mueven con el cursor */
            '<circle class="as-pupila" cx="34" cy="58" r="3.2" fill="#3a4a8c"/>' +
            '<circle class="as-pupila" cx="66" cy="58" r="3.2" fill="#3a4a8c"/>' +
            /* nariz */
            '<rect x="47" y="62" width="6" height="6" rx="2.5" fill="#b0784f"/>' +
            /* bigote y barba */
            '<path d="M32 72 q18 -5 36 0 v5.5 q-18 -4 -36 0 Z" fill="#6b4423"/>' +
            '<path d="M25 78 q25 15 50 0 v5 q-25 13 -50 0 Z" fill="#6b4423"/>' +
          '</g>' +
        '</svg>';
    }

    /* --------------------------------------------------------------------
       Las manos. Nacen debajo, fuera de la vista, y suben girandose en X.
       -------------------------------------------------------------------- */
    function manoSVG() {
        var mano =
            '<rect x="0" y="0" width="30" height="40" rx="7" fill="#c68b6b"/>' +
            '<g fill="#ab7550">' +
              '<rect x="4" y="1" width="2.4" height="19" rx="1.2"/>' +
              '<rect x="11" y="1" width="2.4" height="19" rx="1.2"/>' +
              '<rect x="18" y="1" width="2.4" height="19" rx="1.2"/>' +
              '<rect x="25" y="1" width="2.4" height="19" rx="1.2"/>' +
              '<rect x="0" y="33" width="30" height="7" rx="3.5"/>' +
            '</g>';
        return '' +
        '<svg class="as-manos" viewBox="0 0 100 100" aria-hidden="true">' +
          '<g transform="translate(9 44)">' + mano + '</g>' +
          '<g transform="translate(91 44) scale(-1 1)">' + mano + '</g>' +
        '</svg>';
    }

    function construir() {
        return '<div class="auth-steve" id="authSteveRoot">' +
            '<div class="as-marco">' + caraSVG() + manoSVG() + '</div>' +
            '</div>';
    }

    /* ---------------------------------------------------------------- */
    var raiz = null, modelo = null;
    var objetivo = { x: 0, y: 0 }, actual = { x: 0, y: 0 };
    var raf = null, reduce = false;
    var escribiendo = false, tapado = false;
    var raton = { x: 0, y: 0, dentro: false };

    function inputActivo() {
        var a = document.activeElement;
        var card = document.getElementById('loginView');
        if (!a || !card || !card.contains(a)) return null;
        return (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') ? a : null;
    }

    function esPassword(el) { return !!el && String(el.type || '').toLowerCase() === 'password'; }

    var medidor = null;
    function xDelCursor(input) {
        if (!medidor) medidor = document.createElement('canvas').getContext('2d');
        var cs = global.getComputedStyle(input);
        medidor.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        var pos = input.selectionStart;
        if (pos === null || pos === undefined) pos = (input.value || '').length;
        var x = medidor.measureText((input.value || '').slice(0, pos)).width;
        var ancho = input.clientWidth - 32;
        if (ancho <= 0) return 0;
        return Math.max(-1, Math.min(1, ((x / ancho) / 0.45 - 0.5) * 2.2));
    }

    function actualizar() {
        var el = inputActivo();

        /* estado de las manos */
        var ahoraTapado = esPassword(el);
        if (ahoraTapado !== tapado) {
            tapado = ahoraTapado;
            raiz.classList.toggle('as-tapado', tapado);
        }

        escribiendo = !!el && el.type !== 'checkbox';
        raiz.classList.toggle('as-escribiendo', escribiendo);

        /* hacia donde mira */
        if (tapado) { objetivo.x = 0; objetivo.y = 0; return; }
        if (escribiendo) { objetivo.x = xDelCursor(el); objetivo.y = 0.55; return; }
        if (raton.dentro) { objetivo.x = raton.x; objetivo.y = raton.y; }
        else { objetivo.x = 0; objetivo.y = 0; }
        if (!raf && !reduce) aplicar();
    }

    function alMover(ev) {
        var card = document.getElementById('loginView');
        if (!card) return;
        var r = card.getBoundingClientRect();
        raton.dentro = ev.clientX >= r.left && ev.clientX <= r.right &&
                       ev.clientY >= r.top && ev.clientY <= r.bottom;
        if (!raton.dentro) return;
        var marco = document.querySelector('.as-marco');
        if (!marco) return;
        var mr = marco.getBoundingClientRect();
        raton.x = Math.max(-1, Math.min(1, (ev.clientX - (mr.left + mr.width / 2)) / (mr.width * 0.45)));
        raton.y = Math.max(-1, Math.min(1, (ev.clientY - (mr.top + mr.height * 0.42)) / (mr.height * 0.42)));
        if (!inputActivo()) actualizar();
    }

    function aplicar() {
        if (!raiz) return;
        actual.x += (objetivo.x - actual.x) * 0.14;
        actual.y += (objetivo.y - actual.y) * 0.14;

        /* las pupilas se desplazan dentro del blanco del ojo */
        var px = (actual.x * 3.4).toFixed(2) + 'px';
        var py = (actual.y * 1.7).toFixed(2) + 'px';
        raiz.style.setProperty('--px', px);
        raiz.style.setProperty('--py', py);

        /* la cabeza entera se vuelve un poco hacia donde mira */
        var giro = (actual.x * 9).toFixed(2) + 'deg';
        raiz.style.setProperty('--giro', giro);

        raf = 0;
        /* sigue suave mientras siga moviendose el objetivo */
        if (Math.abs(actual.x - objetivo.x) > 0.004 || Math.abs(actual.y - objetivo.y) > 0.004) {
            raf = global.requestAnimationFrame(aplicar);
        }
    }

    function empujar() {
        if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
        if (!reduce) raf = global.requestAnimationFrame(aplicar);
        else aplicar();
    }

    /* ---------------------------------------------------------------- */
    function montar(host) {
        if (host.__listo) return;
        host.__listo = true;
        if (raf) { global.cancelAnimationFrame(raf); raf = null; }

        host.innerHTML = construir();
        raiz = host.querySelector('#authSteveRoot');
        modelo = raiz;
        raiz.style.width = AVATAR + 'px';
        raiz.style.height = AVATAR + 'px';

        reduce = global.matchMedia &&
            global.matchMedia('(prefers-reduced-motion: reduce)').matches;

        var card = document.getElementById('loginView');
        if (card) {
            card.addEventListener('mousemove', alMover);
            card.addEventListener('mouseleave', function () { raton.dentro = false; actualizar(); empujar(); });
            card.addEventListener('focusin', function () { actualizar(); empujar(); });
            card.addEventListener('focusout', function () { setTimeout(function () { actualizar(); empujar(); }, 0); });
            card.addEventListener('input', function () { actualizar(); empujar(); });
            card.addEventListener('click', function () { setTimeout(function () { actualizar(); empujar(); }, 0); });
            card.addEventListener('keyup', function () { actualizar(); empujar(); });
            card.addEventListener('select', function () { actualizar(); empujar(); });
        }

        actualizar();
        empujar();
    }

    function buscar() {
        var host = document.getElementById('authSteve');
        if (host) montar(host);
    }

    function arranque() {
        buscar();
        var view = document.getElementById('loginView');
        if (view && global.MutationObserver) {
            new MutationObserver(function () { buscar(); }).observe(view, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arranque);
    } else {
        arranque();
    }
})(window);