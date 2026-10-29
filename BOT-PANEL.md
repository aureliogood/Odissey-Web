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

El panel también permite publicar o programar anuncios y eventos. Se puede adjuntar una imagen PNG, JPG, GIF o WebP de hasta 5 MB; el archivo se guarda junto al trabajo de la cola y se adjunta al embed debajo del texto. Las publicaciones se guardan como trabajos individuales en `Bot-Welcome/announcements/`; el bot de bienvenida los procesa y el panel muestra si quedaron publicados o fallaron. El bot nunca activa menciones de `@everyone` ni de roles en esas publicaciones.

El panel consulta los canales y roles del servidor desde la API de Discord sin exponer el token al navegador. También muestra señales periódicas de los dos bots, las acciones recientes de automoderación y tickets abiertos. Al cerrar un ticket desde la web, se envía una orden local al bot de tickets; este guarda el transcript y aplica el cierre en Discord. El bot global puede enviar mensajes de salida y usar una imagen pública HTTPS en las bienvenidas. Los anuncios admiten una miniatura HTTPS, texto al pie y un botón con enlace HTTPS.

La automoderación está apagada al instalar la actualización. Se puede activar desde la pestaña **Bienvenida** y configurar filtros para invitaciones de Discord, ráfagas de mensajes y exceso de menciones. Tres infracciones en un minuto pueden aplicar un timeout si el tiempo configurado es mayor que cero. Los roles exentos se pueden configurar desde el mismo panel.

## Actualizar los archivos en Azure

Después de subir los archivos actualizados, instala `Bot-Tickets/index.js` y `Bot-Welcome/index.js` en sus carpetas bajo `/opt/odissey/` y `bot-manager.cjs` en `/opt/odissey/bot-panel/`. Reinicia `odyssey-tickets`, `odyssey-welcome` y `odyssey-bot-panel`. El panel web se publica desde GitHub; la API de Azure se actualiza aparte.

Los archivos de servicio y la ubicación de Nginx se documentan en `deploy/azure-bot-panel/`.
