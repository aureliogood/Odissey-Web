/* ============================================================================
   ODISSEY · Animacion del menu desplegable
   ----------------------------------------------------------------------------
   Cada pagina define toggleMenu() / closeMenu() por su cuenta y solo quita o
   pone la clase "hidden" del panel. Este script NO cambia esa logica: observa
   el panel y choregrafia el estado visual.

   El truco esta en el orden. Si al abrir quitamos "hidden" y anadimos
   ".menu-open" en el mismo instante, el navegador nunca pinta el estado
   inicial (opacity 0) y la transicion se pierde. Por eso forzamos un reflow
   y anadimos la clase en el siguiente fotograma. Al cerrar hacemos lo
   contrario: quitamos la clase, esperamos a que termine la transicion y solo
   entonces voltamos a poner "hidden".
   ============================================================================ */
(function () {
    'use strict';
    if (window.__odisseyMenu) return;
    window.__odisseyMenu = true;

    var CLOSED_MS = 300;   /* debe coincidir con la duracion del CSS */

    function boot() {
        var panel = document.getElementById('menuDropdown');
        if (!panel) return;

        var btn = document.getElementById('menuBtn');
        var isOpen = false;
        var closeTimer = 0;

        function paintState(open) {
            document.body.classList.toggle('menu-open', open);
            if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function open() {
            window.clearTimeout(closeTimer);
            if (isOpen) return;
            isOpen = true;

            /* 1) mostrarlo, pero todavia en su estado inicial */
            panel.classList.remove('hidden');
            void panel.offsetWidth;          /* reflow: fija opacity 0 / translateY */

            /* 2) siguiente fotograma -> arranca la transicion */
            window.requestAnimationFrame(function () {
                panel.classList.add('menu-open');
            });
            paintState(true);
        }

        function close() {
            if (!isOpen) return;
            isOpen = false;

            panel.classList.remove('menu-open');
            paintState(false);

            /* 3) esperamos a que termine de recogerse para ocultar */
            window.clearTimeout(closeTimer);
            closeTimer = window.setTimeout(function () {
                if (!isOpen) panel.classList.add('hidden');
            }, CLOSED_MS);
        }

        /* Reacciona a la logica de la pagina sin duplicarla. */
        if (window.MutationObserver) {
            new MutationObserver(function () {
                var hiddenNow = panel.classList.contains('hidden');
                if (hiddenNow && isOpen) {
                    /* la pagina lo ocultó de golpe: respetamos, sin animar */
                    isOpen = false;
                    panel.classList.remove('menu-open');
                    paintState(false);
                }
            }).observe(panel, { attributes: true, attributeFilter: ['class'] });
        }

        /* boton de menu: animamos, y la pagina sigue mandando con toggleMenu() */
        if (btn) {
            btn.addEventListener('click', function () {
                setTimeout(function () {
                    if (panel.classList.contains('hidden')) close();
                    else open();
                }, 0);
            });
        }

        /* clic fuera y Escape: la pagina ya cierra, aqui solo sincroniza */
        document.addEventListener('click', function () { setTimeout(function () {
            if (panel.classList.contains('hidden')) { if (isOpen) { isOpen = false; paintState(false); } }
        }, 0); });

        /* al abrir en movil, el panel no debe quedar pegado al borde */
        window.addEventListener('resize', function () {
            if (window.innerWidth >= 1024 && isOpen) { /* en escritorio se comporta igual */ }
        }, { passive: true });

        /* estado inicial: cerrado */
        panel.classList.remove('menu-open');
        paintState(false);
        void panel.offsetWidth;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
