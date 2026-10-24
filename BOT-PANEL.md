# Panel local de bots

El panel está en `https://odisseymc.site/bots.html`. El conector de este equipo debe estar encendido para leer o guardar configuraciones.

## Primer uso

1. Inicia sesión en Odissey con una cuenta cuyo perfil tenga el rol `admin`.
2. Si el conector no está activo, en este PC abre `iniciar-bots-panel.bat` y deja esa ventana abierta mientras uses el panel.
3. Abre `/bots.html`, pulsa **Conectar con este PC** y permite el acceso local si el navegador lo solicita.
4. Si todavía no hay un panel de tickets en Discord, usa `/setup` una vez en el canal deseado. Después, el mensaje guardado se actualizará al guardar desde la web.

El conector escucha solo en `127.0.0.1:32170`. Valida el token de sesión contra Supabase y comprueba el rol `admin` antes de leer o escribir. El navegador nunca recibe el token del bot ni secretos de configuración. La página solo permite los orígenes de producción y el servidor local de desarrollo.

## Ejecución y carpetas

Por defecto, las carpetas se resuelven como `../Bot-Tickets` y `../Bot-Welcome`, junto a esta carpeta `web`. Si están en otra ubicación, define `ODISSEY_TICKETS_DIR` y `ODISSEY_WELCOME_DIR` antes de ejecutar `node bot-manager.cjs`.

Ambos bots observan `config.json` y recargan sus opciones cuando el conector guarda cambios. Los tokens y las demás claves existentes se conservan en los archivos locales. El mensaje de bienvenida personalizado afecta a los miembros que lleguen después del cambio.

Reinicia una vez cada bot para que el proceso que ya está ejecutándose cargue el observador nuevo. Después de ese reinicio inicial, los cambios del panel se aplican sin reiniciar.

La configuración de Apache usa una excepción CSP limitada a `bots.html` en `.htaccess`. En Nginx, instala `odissey-bot-panel-security-headers.conf` en `/etc/nginx/snippets/`; `nginx.conf.example` muestra el bloque de ubicación exacto. La excepción permite que esa página llegue a `127.0.0.1:32170`; el navegador puede pedir permiso local la primera vez.
