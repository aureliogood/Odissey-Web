/* ============================================================
   site-data.js — Capa compartida de datos del sitio.
   Lee el contenido web (noticias, tienda, staff, reportes...)
   desde Supabase, a traves de js/datos.js.

   QUE CAMBIO
   Antes estas llamadas iban a la mini API del bot:
       fetch(API_BASE + '/api/content')
   El bot ya no existe y esa URL devolvia 404 en silencio. Ahora se pide
   a la ruta /api/content del propio dominio, que es la misma llamada de
   siempre, pero js/datos.js la intercepta y la responde leyendo de
   Supabase. Por eso el codigo de abajo sigue igual de arriba abajo.
   ============================================================ */
(function () {
  'use strict';

  /* API_BASE ya no existe: no hay servidor propio al que apuntar. La web
     es estatica y todo se resuelve contra Supabase desde el navegador. */
  const API_BASE = '';

  const SiteData = {
    data: {
      news: [], events: [], gallery: [], products: [], staff: [], ratings: [],
      reports: [], orders: [], settings: null, maintenance: null, log: []
    },
    configured: { products: false, productsEmpty: false, staff: false, staffEmpty: false },
    publicLoaded: false,
    myLoaded: false,
    adminLoaded: false,

    loadPublic() {
      return esperarCapa().then(function () {
      return fetch(API_BASE + '/api/content')
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json && json.ok) {
            SiteData.data.news = json.news || [];
            SiteData.data.events = json.events || [];
            SiteData.data.gallery = json.gallery || [];
            SiteData.data.products = json.products || [];
            SiteData.data.staff = json.staff || [];
            SiteData.data.ratings = json.ratings || [];
            SiteData.data.settings = json.settings || null;
            SiteData.data.maintenance = json.maintenance || null;
            SiteData.configured.products = !!json.productsConfigured;
            SiteData.configured.productsEmpty = !!json.productsEmpty;
            SiteData.configured.staff = !!json.staffConfigured;
            SiteData.configured.staffEmpty = !!json.staffEmpty;
            SiteData.publicLoaded = true;
            SiteData.dispatch();
          }
          return SiteData.data;
        })
        .catch(function () { return SiteData.data; });
      });
    },

    loadMy(token) {
      if (!token) return Promise.resolve(SiteData.data);
      return esperarCapa().then(function () {
      return fetch(API_BASE + '/api/my/data?token=' + encodeURIComponent(token))
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json && json.ok) {
            SiteData.data.reports = json.reports || [];
            SiteData.data.orders = json.orders || [];
            SiteData.myLoaded = true;
            SiteData.dispatch();
          }
          return SiteData.data;
        })
        .catch(function () { return SiteData.data; });
      });
    },

    loadAdmin(token) {
      return esperarCapa().then(function () {
      return fetch(API_BASE + '/api/admin/data?token=' + encodeURIComponent(token))
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (!json || !json.ok) return false;
          // El panel carga el contenido dos veces: primero desde /api/content y
          // luego desde /api/admin/data. Si la segunda viene con alguna lista
          // vacia, antes se perdia la que ya estaba bien cargada y el panel
          // ENSENABA "no hay noticias" con las noticias a la vista en la web.
          // Ahora, una lista vacia en la respuesta del panel no pisa la que
          // trajo la carga publica: se espera que la respuesta vacia signifique
          // de verdad que no hay contenido.
          var previo = SiteData.data || {};
          function lista(clave) {
            var deAdmin = json[clave];
            if (Array.isArray(deAdmin) && deAdmin.length) return deAdmin;
            if (Array.isArray(previo[clave])) return previo[clave];
            return Array.isArray(deAdmin) ? deAdmin : [];
          }
          SiteData.data = {
            news: lista('news'),
            events: lista('events'),
            gallery: lista('gallery'),
            products: lista('products'),
            staff: lista('staff'),
            ratings: lista('ratings'),
            reports: lista('reports'),
            orders: lista('orders'),
            settings: json.settings || previo.settings || null,
            maintenance: json.maintenance || previo.maintenance || null,
            log: lista('log')
          };
          SiteData.adminLoaded = true;
          SiteData.dispatch();
          return true;
        })
        .catch(function () { return false; });
      });
    },

    get(key) { return SiteData.data[key]; },

    post(url, body) {
      return fetch(API_BASE + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.json().then(function (json) {
          return { res: res, ok: res.ok, status: res.status, json: json };
        });
      }).catch(function () {
        return { res: null, ok: false, status: 0, json: {} };
      });
    },

    del(url) {
      return fetch(API_BASE + url, { method: 'DELETE' }).then(function (res) {
        return res.json().then(function (json) {
          return { res: res, ok: res.ok, status: res.status, json: json };
        });
      }).catch(function () {
        return { res: null, ok: false, status: 0, json: {} };
      });
    },

    reloadPublic() { return SiteData.loadPublic(); },
    reloadMy(token) { return SiteData.loadMy(token); },
    // El panel recarga esto tras cada cambio. Primero la carga publica, para
    // tener siempre la lista de contenido correcta como respaldo, y despues la
    // del panel, que es la que manda en reportes, pedidos, ajustes y registro.
    reloadAdmin(token) {
      SiteData.adminLoaded = false;
      return SiteData.loadPublic().then(function () {
        return SiteData.loadAdmin(token);
      });
    },

    dispatch() {
      if (typeof window.SiteDataDispatch === 'function') {
        try { window.SiteDataDispatch(SiteData.data); } catch (err) {}
      }
    }
  };

  if (typeof window !== 'undefined') window.SiteData = SiteData;
  if (typeof module !== 'undefined' && module.exports) module.exports = SiteData;
})();