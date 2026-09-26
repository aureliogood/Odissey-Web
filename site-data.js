/* ============================================================
   site-data.js — Capa compartida de datos del sitio.
   Lee el contenido web (noticias, tienda, staff, reportes...)
   desde la API del bot (API_BASE) en vez de localStorage.
   ============================================================ */
(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || 'https://odisseymc.site/bot';

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
    },

    loadMy(token) {
      if (!token) return Promise.resolve(SiteData.data);
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
    },

    loadAdmin(token) {
      return fetch(API_BASE + '/api/admin/data?token=' + encodeURIComponent(token))
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (!json || !json.ok) return false;
          SiteData.data = {
            news: json.news || [], events: json.events || [], gallery: json.gallery || [],
            products: json.products || [], staff: json.staff || [], ratings: json.ratings || [],
            reports: json.reports || [], orders: json.orders || [],
            settings: json.settings || null, maintenance: json.maintenance || null,
            log: json.log || []
          };
          SiteData.adminLoaded = true;
          SiteData.dispatch();
          return true;
        })
        .catch(function () { return false; });
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
    reloadAdmin(token) { SiteData.adminLoaded = false; return SiteData.loadAdmin(token); },

    dispatch() {
      if (typeof window.SiteDataDispatch === 'function') {
        try { window.SiteDataDispatch(SiteData.data); } catch (err) {}
      }
    }
  };

  if (typeof window !== 'undefined') window.SiteData = SiteData;
  if (typeof module !== 'undefined' && module.exports) module.exports = SiteData;
})();