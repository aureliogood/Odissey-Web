# Panel de bots

El panel está en `https://odisseymc.site/bots.html` y administra la configuración guardada en Azure.

## Acceso y seguridad

1. Inicia sesión en Odissey con una cuenta cuyo perfil tenga el rol `admin`.
2. Abre `/bots.html` y pulsa **Conectar con Azure**.
3. El navegador contacta `https://api.odisseymc.site/panel`; el proceso de administración escucha solo en `127.0.0.1:32170` detrás de Nginx y HTTPS.

El API valida el token de sesión con Supabase y comprueba el rol `admin` antes de leer o guardar. El navegador nunca recibe el token de Discord ni secretos de configuración. El puerto `32170` no debe abrirse en Azure; Nginx lo publica solo mediante `https://api.odisseymc.site/panel`.

## Ejecución en Azure

El servicio `odyssey-bot-panel.service` ejecuta `bot-manager.cjs` como el usuario del sistema `odisseybot`, con carpetas explícitas `/opt/odissey/Bot-Tickets` y `/opt/odissey/Bot-Welcome`.

Ambos bots observan `config.json` y recargan sus opciones cuando el panel guarda cambios. El panel conserva los tokens y demás claves existentes, que permanecen en Azure. Los cambios en el mensaje de bienvenida afectan a los miembros que lleguen después del cambio.

Los archivos de servicio y la ubicación de Nginx se documentan en `deploy/azure-bot-panel/`.
