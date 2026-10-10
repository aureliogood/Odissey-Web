/* ============================================================
   foro.js — Rellena los contadores y la fecha de la ultima
   actualizacion de cada tablero del Foro.

   Los tableros de noticias, eventos y galeria se alimentan de la
   API (/api/content, via site-data.js), igual que sus paginas. Los
   tableros de reglas y wiki son estaticos, asi que su numero y su
   fecha van puestos directamente en foro.html y este script no los
   toca: si la API falla, la pagina sigue viéndose correcta.
   ============================================================ */
(function () {
  'use strict';

  const CAMPOS = {
    news: { total: 'news', titulo: 'news_titulo' },
    events: { total: 'events', titulo: 'events_titulo' },
    gallery: { total: 'gallery', titulo: 'gallery_titulo' }
  };

  function textos(key) {
    const lang = (typeof getLang === 'function') ? getLang() : 'es';
    const dic = (typeof I18N !== 'undefined' && I18N && I18N[lang]) || {};
    return (dic && dic[key]) || '';
  }

  function lista(name) {
    if (!window.SiteData) return [];
    const v = SiteData.get(name);
    return Array.isArray(v) ? v : [];
  }

  // Fecha legible: si el dato no es una fecha real, se devuelve texto tal cual.
  function fechaBonita(valor) {
    if (!valor) return '';
    const d = new Date(valor.length === 10 ? valor + 'T12:00:00' : valor);
    if (isNaN(d.getTime())) return '';
    const hoy = new Date();
    const dias = Math.floor((hoy - d) / 86400000);
    if (dias <= 0) return textos('foro_hoy');
    if (dias === 1) return textos('foro_ayer');
    if (dias < 7) return textos('foro_hace').replace('{n}', dias);
    return d.toLocaleDateString((typeof getLang === 'function' ? getLang() : 'es'), {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function escribe(selector, valor) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.textContent = valor;
    });
  }

  function pintaTablero(clave, filas, fechaDe, tituloDe) {
    const conf = CAMPOS[clave];
    if (!conf) return;

    // Contador + unidad. Se escribe siempre, incluso cuando vale 0: antes,
    // sin contenido, cada fila mostraba dos guiones sueltos flotando en el
    // sitio y parecia que la pagina estaba rota. "0 noticias" si es verdad.
    escribe('[data-foro-total="' + conf.total + '"]', String(filas.length));
    escribe('[data-foro-unit="' + conf.total + '"]', textos(conf.total + '_label'));

    escribe('[data-foro-last="' + conf.total + '"]', fechaBonita(fechaDe(filas)));
    escribe('[data-foro-last-title="' + conf.total + '"]', tituloDe(filas) || '');
  }

  function pinta() {
    pintaTablero('news', lista('news'),
      function (f) {
        const copia = f.slice().slice().sort(function (a, b) {
            return new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0);
        });
        const n = copia[0];
        return n ? (n.date || n.created_at || '') : '';
      },
      function (f) {
        const copia = f.slice().sort(function (a, b) {
            return new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0);
        });
        return copia[0] ? (copia[0].title || '') : '';
      });

    pintaTablero('events', lista('events'),
      function (f) {
        const copia = f.slice().sort(function (a, b) {
            return new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0);
        });
        const e = copia[0];
        return e ? (e.date || e.created_at || '') : '';
      },
      function (f) {
        const copia = f.slice().sort(function (a, b) {
            return new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0);
        });
        return copia[0] ? (copia[0].title || '') : '';
      });

    pintaTablero('gallery', lista('gallery'),
      function (f) {
        const copia = f.slice().sort(function (a, b) {
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
        const g = copia[0];
        return g ? (g.created_at || '') : '';
      },
      function (f) {
        const copia = f.slice().sort(function (a, b) {
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
        const g = copia[0];
        return g ? (g.caption || '') : '';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pinta);
  } else {
    pinta();
  }

  // Cuando la API termine de responder, se repinta con los datos reales.
  document.addEventListener('siteconfig-loaded', pinta);
  if (window.SiteData) {
    SiteData.loadPublic().then(function () { pinta(); }).catch(function () { });
  }

  // Al cambiar de idioma se reescriben los textos corto (etiquetas y fechas).
  if (typeof toggleLang === 'function') {
    const langAntes = toggleLang;
    window.toggleLang = function () {
      langAntes.apply(this, arguments);
      pinta();
    };
  }
})();