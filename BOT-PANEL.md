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

El panel también permite guardar borradores, publicar o programar anuncios y eventos, adjuntar hasta tres imágenes PNG, JPG, GIF o WebP (5 MB cada una), añadir un botón HTTPS y elegir repetición semanal o cada 30 días. Las publicaciones se guardan como trabajos individuales en `Bot-Welcome/announcements/`; el bot de bienvenida los procesa y el panel muestra si quedaron publicados o fallaron. Los borradores se pueden publicar o eliminar y las publicaciones pendientes se pueden cancelar. El bot nunca activa menciones de `@everyone` ni de roles en esas publicaciones.

El panel consulta canales y roles y comprueba permisos efectivos de Discord antes de guardar la configuración. También permite buscar tickets abiertos o cerrados y cerrarlos o reabrirlos; el bot de tickets guarda el transcript al cerrar. La pestaña Actividad reúne métricas de 30 días, señales y alertas, historial de configuración con restauración y un registro de cambios para administradores. El acceso Staff se puede limitar por permiso desde el panel. Las alertas de caída de bots y fallos de anuncios o acciones de tickets también se envían al canal privado configurado.

La automoderación está apagada al instalar la actualización. Se puede activar desde la pestaña **Bienvenida** y configurar filtros para invitaciones de Discord, ráfagas de mensajes y exceso de menciones. Tres infracciones en un minuto pueden aplicar un timeout si el tiempo configurado es mayor que cero. Los roles exentos se pueden configurar desde el mismo panel. La actividad de miembros se registra en `Bot-Welcome/activity-log.json` para formar las métricas diarias.

## Actualizar los archivos en Azure

Después de subir los archivos actualizados, instala `Bot-Tickets/index.js` y `Bot-Welcome/index.js` en sus carpetas bajo `/opt/odissey/` y `bot-manager.cjs` en `/opt/odissey/bot-panel/`. Reinicia `odyssey-tickets`, `odyssey-welcome` y `odyssey-bot-panel`. El panel web se publica desde GitHub; la API de Azure se actualiza aparte.

Los archivos de servicio y la ubicación de Nginx se documentan en `deploy/azure-bot-panel/`.
