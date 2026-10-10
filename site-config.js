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

    // ------------------------------------------------------
//  SUPABASE
// ------------------------------------------------------
    //  project URL (raiz del proyecto, no /rest/v1). La usan los
    //  clientes JS para talking to Auth, Postgres y Storage.
    supabaseUrl: 'https://cffpnxmtwfaublkvrobt.supabase.co',
    //  publishable key. ES PUBLICA: va en el JavaScript del navegador y
    //  cualquiera puede verla con F12. Es como una clave de mapas: no
    //  da acceso a nada por si sola, porque quien decide que se puede
    //  leer o escribir cada cosa son las politicas RLS de la base.
    //
    //  La secret key NO va aqui. Va en Supabase > Project Settings >
    //  API, en las variables de entorno del servidor, y solo se usa
    //  desde el backend o desde una Edge Function.
    supabaseKey: 'sb_publishable_BOU0olDLB4gZyp9fNr0OBw_SkIbB_w4',

    // ------------------------------------------------------
    //  CLOUDFLARE TURNSTILE (captcha)
    // ------------------------------------------------------
    //  siteKey: la clave PUBLICA del widget. Se puede poner aqui: es
    //  publica por definicion, la muestra Cloudflare en su documentacion
    //  y va dentro del HTML que se sirve.
    //
    //  Site key REAL de Odissey (widget de Cloudflare Turnstile).
    //  Es publica: va incrustada en el HTML que se sirve y no hay que
    //  esconderla de nadie.
    //
    //  OJO: la SECRET KEY no va aqui, ni en ningun fichero de esta
    //  carpeta. Va unicamente en el bot, como variable de entorno
    //  TURNSTILE_SECRET_KEY.
    turnstileSiteKey: '0x4AAAAAAFTE6vKiwo7EJnPL',
    // APAGADO a proposito, y no es un descuido.
    //
    // Ponerlo a true vuelve a pintar el widget, pero el token ya no lo
    // comprueba nadie: el backend era el bot y el bot ya no esta, y
    // supabase.auth.signInWithPassword() construye el POST sola y no
    // admite campos extra. El visitante resolveria el reto para que su
    // token se tirase a la basura.
    //
    // Mientras tanto solo estorba: en redes donde los subdominios del
    // challenge de Cloudflare no resuelven, el reto no se completa nunca
    // y el login se queda bloqueado. Asi paso al probarlo.
    //
    // Lo correcto cuando se reenganche es la captcha NATIVA de Supabase
    // (Authentication > Sign In / Providers > Bot Detection), que si
    // valida, porque va dentro del propio flujo de Supabase.
    turnstileActivo: false,
};

// La configuración se guarda ahora en la base de datos del bot
// (tabla site_settings) y se sirve por la API. Aquí cargamos lo
// guardado y lo mezclamos con los valores por defecto.
window.SITE_CONFIG = Object.assign({}, window.DEFAULT_SITE_CONFIG);

// URL de la mini API del bot de tickets (cuentas, tickets, contenido).
//
// En producción es la de siempre, pero si la web se abre desde localhost se
// usa la API del bot que tengas corriendo en tu ordenador. Sin esto, al
// probar en local la web nueva hablaba con el bot de producción: si el bot de
// producción es una versión antigua, /api/auth/register devolvía 404 y el
// registro fallaba con un error que no decía por qué.
(function () {
  var esLocal = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);
  window.API_BASE = esLocal
    ? 'http://127.0.0.1:' + (window.LOCAL_API_PORT || 3000) + '/bot'
    : 'https://odisseymc.site/bot';
})();

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