// =============================================================
// CONFIGURACIÓN GENERAL DEL SITIO
// -------------------------------------------------------------
//   serverIp           : IP del servidor de Minecraft
//   serverPort         : Puerto por defecto de Minecraft Java (25565)
//   gamemode           : Modalidad principal del servidor
//   discordInvite      : Enlace de invitación al Discord
//   discordServerId    : ID del servidor de Discord para el widget
//                        (déjalo vacío "" para ocultar el widget)
//                        Cómo verlo: Discord > Ajustes del servidor
//                        > Widget > activar y copiar el ID.
// =============================================================
window.DEFAULT_SITE_CONFIG = {
    serverIp: '38.58.179.117:25569',
    serverPort: '25569',
    version: '1.20 - 1.21',
    gamemode: 'Survival Custom',
    discordInvite: 'https://dc.gg/odisseymc',
    discordServerId: '1542393721318940782',
};

// La configuración se guarda ahora en la base de datos del bot
// (tabla site_settings) y se sirve por la API. Aquí cargamos lo
// guardado y lo mezclamos con los valores por defecto.
window.SITE_CONFIG = Object.assign({}, window.DEFAULT_SITE_CONFIG);

// URL de la mini API del bot de tickets (login con Discord, tickets, contenido)
window.API_BASE = 'https://odisseymc.site/bot';

(function () {
    function mergeAndApply(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        window.SITE_CONFIG = Object.assign({}, window.DEFAULT_SITE_CONFIG, cfg);
        try {
            document.dispatchEvent(new CustomEvent('siteconfig-loaded'));
        } catch (err) {}
    }
    if (window.SiteData && window.SiteData.publicLoaded && window.SiteData.get('settings')) {
        mergeAndApply(window.SiteData.get('settings'));
        return;
    }
    fetch(window.API_BASE + '/api/content')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.ok && data.settings) mergeAndApply(data.settings);
        })
        .catch(function () {});
})();