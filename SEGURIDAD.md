# =============================================================
#  SEGURIDAD.md — el manual de seguridad de Odissey
# -------------------------------------------------------------
#  Este documento explica qué está hecho ya, qué falta por hacer en
#  el servidor, y cómo se comprueba que todo sigue en pie.
#
#  Léelo antes de tocar nada. Está en español porque el que
#  mantiene esto lo es.
# =============================================================

## 0. Resumen: qué está hecho y qué falta

| Capa | Estado | Dónde |
|---|---|---|
| HTTPS forzado + HSTS | Hecho (falta activar SSL en el panel) | `.htaccess` bloque 2 y 6 |
| Cabeceras de seguridad | Hecho | `.htaccess` bloque 6 |
| CSP | Hecho, corregida | `.htaccess` bloque 7 |
| WAF | Documentado, falta activarlo | `WAF.md` |
| Esconder la IP del servidor | Documentado, falta aplicar | `WAF.md` + `nginx.conf.example` |
| XSS en el panel | Arreglado | `admin.html`, `js/seguro.js` |
| Sesiones del panel con caducidad | Hecho | `admin.html` |
| Enfriamiento de intentos de login | Hecho (cliente) | `admin.html` |
| Reautenticación para acciones críticas | Hecho (cliente) | `admin.html` |
| Anti-spam en formularios | Hecho (cliente) | `js/formulario.js` |
| **Passwords con hash fuerte** | **PENDIENTE: es en el bot** | abajo, §4.2 |
| **2FA para administradores** | **PENDIENTE: es en el bot** | abajo, §4.3 |
| **Rate limit por IP en el servidor** | **PENDIENTE: es en el bot** | abajo, §4.1 |
| Backups automáticos | Documentado, falta configurar | abajo, §6 |
| Integridad de ficheros | Documentado, falta configurar | abajo, §6.3 |
| Escaneo de malware | Documentado, falta configurar | abajo, §6.4 |

Lo que queda pendiente es todo del lado del **bot de Node.js**, que no
está en esta carpeta. Cada punto dice exactamente dónde tocar.


## 1. Red y certificados

### 1.1 Activar el certificado (esto hay que hacerlo YA)

**cPanel:**
1. cPanel → **SSL/TLS Status** → **Run AutoSSL** (Let's Encrypt, gratis).
2. Comprobar que sale "Run AutoSSL: Active".
3. En **Domains**, comprobar que `odisseymc.site` y `www.odisseymc.site`
   tienen el candado verde.

**Si el hosting es Nginx/VPS:**
Ver la sección SSL de `nginx.conf.example`.

### 1.2 Comprobar que funciona

```
https://www.ssllabs.com/ssltest/analyze.html?d=odisseymc.site
```

Objetivo: **A o A+**. Si sale B o menos, algo del certificado o de la
configuración se puede mejorar.

En la propia web:
```bash
# Debe devolver "Strict-Transport-Security" con max-age=63072000
curl -sI https://odisseymc.site/ | grep -i strict-transport
```

### 1.3 Forzar el HSTS en pre-carga

El `.htaccess` ya pide `preload`. Para que Chrome lo acepte de verdad:

1. Verificar que HTTPS funciona y que hay redirección de http a https.
2. Ir a <https://hstspreload.org> y meter `odisseymc.site`.
3. El botón "Submit" solo se activa si todo está bien.

Aviso: la pre-carga **no se puede quitar easily**. Una vez dentro de
la lista de Chrome, el dominio sirve solo por https durante años,
aunque el certificado caduque. Eso es lo que se quiere, pero hay que
saberlo antes de darle al botón.


## 2. Ocultar la IP del servidor

### 2.1 Por qué

Si alguien puede ver la IP del servidor, puede saltarse Cloudflare y
atacar directamente el Apache, que no tiene ni WAF ni rate limit. Con
Cloudflare delante y el firewall cerrado, esa IP no sirve para nada.

### 2.2 Cómo (pasos exactos en `WAF.md`, sección 1)

Resumen:
1. Cloudflare → SSL/TLS → Origin Server → certificado "Full (strict)".
2. Anotar la IP del servidor (la que aparece en DNS).
3. Poner el firewall para que solo acepte los rangos de Cloudflare
   (la lista está en `WAF.md`).
4. Comprobar:
```bash
# Desde otro ordenador que NO sea el servidor:
curl -sI https://odisseymc.site/ | head -1
# Debe decir HTTP/2 200

# Desde el propio servidor, la IP directa debe estar cerrada:
curl -sI http://IP_DEL_SERVIDOR/ --connect-timeout 5
# Debe fallar o dar timeout
```


## 3. Cabeceras de seguridad — dónde mirar

Después de subir el `.htaccess`, comprobar:

```bash
curl -sI https://odisseymc.site/ | grep -iE 'strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin|x-permitted'
```

Deben aparecer las siete. Comprobación rápida de que la CSP no rompe
nada: abrir la web y mirar la consola del navegador. Si hay un error
de CSP, dice exactamente qué recurso lo provocó y qué línea de la
política hay que corregir.


## 4. Autenticación — lo que falta (todo en el bot)

Esta sección es la más importante. Lo del cliente ya está; lo que
falta es lo del servidor, que es el que manda.

### 4.1 Rate limiting por IP y por cuenta

**Por qué:** sin esto, un atacante puede probar millones de
contraseñas por segundo. El enfriamiento del navegador (5 intentos)
no sirve de nada contra un script.

**Dónde:** el fichero del bot que define las rutas de login
(normalmente `web.js`).

```js
// --- al principio del fichero, al lado de los demás requires ---
const loginAttempts = new Map();   // clave -> {count, until}
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

function registrarIntento(clave) {
  const ahora = Date.now();
  const previo = loginAttempts.get(clave) || { count: 0, until: 0 };
  if (previo.until > ahora) return Math.ceil((previo.until - ahora) / 1000);
  return 0;
}

function anotarIntento(clave, fallo) {
  const ahora = Date.now();
  const previo = loginAttempts.get(clave) || { count: 0, until: 0 };
  if (previo.until <= ahora) previo.count = 0;
  if (fallo) {
    previo.count += 1;
    if (previo.count >= MAX_INTENTOS) previo.until = ahora + BLOQUEO_MS;
  } else {
    previo.count = 0;
    previo.until = 0;
  }
  loginAttempts.set(clave, previo);
  // Limpieza: cada 10 minutos se va lo que ya no sirve, para que el
  // Map no crezca sin control.
  if (loginAttempts.size > 10000) {
    for (const [k, v] of loginAttempts) if (v.until < ahora) loginAttempts.delete(k);
  }
}

// En la ruta de login, ANTES de comparar contraseñas:
//   1. La clave es IP + login en minúsculas. Asi se frena tanto el
//      ataque desde una IP (muchas cuentas) como el ataque a una
//      cuenta desde muchas IPs (un botnet).
const espera = registrarIntento(ip + '|' + login.toLowerCase());
if (espera > 0) return res.status(429).json({
  ok: false,
  message: `Demasiados intentos. Prueba en ${espera} segundos.`
});

// Y DESPUES de comparar:
//   anotarIntento(clave, fallo)   con fallo = true si no coincide
```

También en el registro (alta de cuentas nuevas): mismo esquema, con
3 intentos en 10 minutos, porque un bot puede crear miles de cuentas.

En la red, `nginx.conf.example` ya trae una capa más
(`limit_req` por IP). Las dos juntas: la de red para el volumen, la
de aplicación para el detalle.

### 4.2 Hash de contraseñas

**Por qué:** el bot guarda contraseñas para poder comprobar el login.
Si esas contraseñas se roban de la base de datos, con MD5 o SHA1
están rotas en segundos. Con bcrypt o argon2, billions de años.

**Qué usar:** `argon2id` (el más moderno) o `bcrypt` con coste 12.

```bash
npm install argon2
```

```js
const argon2 = require('argon2');

// Al guardar:
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,   // 19 MB
  timeCost: 2,
  parallelism: 1
});
await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);

// Al comprobar:
const ok = await argon2.verify(user.password_hash, password);
```

**Migración de las contraseñas que ya hay:** no se pueden convertir
porque el hash no tiene la contraseña. La forma correcta:

1. Cambiar el campo a `password_hash` (nullable).
2. Al hacer login, si el usuario tiene la contraseña antigua, se
   verifica con el método viejo y, si es correcta, se re-hashea
   con argon2 y se borra la antigua.
3. Los usuarios que no entren en 3 meses, se les pide contraseña
   nueva.

Es algo molesto pero es la única forma. Nunca re-hashear sin tener la
contraseña en la mano.

### 4.3 2FA para administradores

**Por qué:** una contraseña robada (phishing, fuerza bruta, una
contraseña reutilizada de otra web) da acceso total al panel. Con 2FA,
hace falta además el segundo factor.

**Cómo:** TOTP con una app de códigos (Google Authenticator, Aegis,
Authy). Biblioteca recomendada: `otplib`.

```bash
npm install otplib qrcode
```

```js
const otplib = require('otplib');

// Activar: generar el secreto, guardarlo cifrado en la BD y mostrar
// el QR. Guardar el "recovery code" (8 códigos de un solo uso) SÍ o SÍ:
// el 2FA sin salida de emergencia es una trampa que acaba con gente
// fuera de su propia cuenta.
const secreto = otplib.authenticator.generateSecret();
const uri = otplib.authenticator.keyuri('admin:odissey', 'Odissey', secreto);

// Verificar en cada login de admin:
const ok = otplib.authenticator.check({ token: codigo, secret: secreto });
```

**Dónde se exige:** solo en `esAdminWeb`, no para los jugadores. Un
jugador normal no debería verse obligado a tener una app de códigos
en el movil.

**La regla importante:** el 2FA se pide **después** de la contraseña,
no antes. Así un atacante solo puede probarla, no saltársela.

### 4.4 Sesiones

Ahora mismo el token va en `localStorage`, que es lo que permite
que cualquier XSS lo lea (por eso los arreglos de XSS importan
mucho). La mejora a medio plazo:

- **Cookie `HttpOnly` + `Secure` + `SameSite=Lax`**: con eso,
  aunque haya XSS, el JavaScript no puede leer la sesión.
- **Token CSRF** para las operaciones que escriben: un valor
  aleatorio que se manda en la cabecera de cada POST y que el
  servidor comprueba.

El `SameSite=Lax` ya protege bastante de CSRF, pero el token
explícito es la diferencia entre "probablemente seguro" y
"seguro por construcción".

Opciones para migrar sin romper nada: mantener el token actual en
la URL (para las partes viejas de la web que lo leen) y añadir la
cookie en paralelo. Es lo que hizo Discord y funciona.


## 5. El código de esta carpeta

### 5.1 Lo arreglado en esta revisión

| Problema | Dónde estaba | Qué se ha hecho |
|---|---|---|
| XSS: el id de un reporte entraba sin escapar en un `onclick` | `admin.html` (lista de reportes) | Se filtra con un formato cerrado; si no encaja, el botón no se pinta |
| XSS: la URL de la captura podía ser `javascript:` | `admin.html` | `urlSegura()`: solo http(s) y rutas internas |
| XSS: `escapeHtml` no escapaba la comilla simple | `admin.html` y 14 páginas | Ahora está en `js/seguro.js` y escapa los cinco caracteres |
| XSS: `accent_color` con CSS arbitrario | `admin.html` | `colorCss()`: solo colores |
| Sesión del panel sin caducidad | `admin.html` | Se revalida cada 2 min y se cierra sola |
| `_adminToken` se quedaba vivo tras cerrar sesión | `admin.html` | Se limpia |
| Login del panel sin enfriamiento | `admin.html` | 5 intentos → 15 min de bloqueo |
| Dar rol admin sin confirmación | `admin.html` | Pide confirmación |
| Cambiar la contraseña de otro sin reautenticarse | `admin.html` | Pide la contraseña del admin que opera |
| La contraseña nueva se veía en pantalla | `admin.html` | `type="password"` + política de 12 caracteres |
| Botón de tema muerto | `admin.html` | Leía un `false ? ... : ...` constante |
| `logout` llamaba a una ruta inexistente | `admin.html` | `/api/logout` → `/api/auth/logout` |
| Eventos y galería borraban sin comprobar el id | `admin.html` | Añadido `idValido()` |
| Widget de Discord bloqueado por la CSP | `.htaccess` | `frame-src` ahora lo permite |
| Avatares de Discord rotos | `.htaccess` | `cdn.discordapp.com` en `img-src` |
| Reserva de imagen de staff rota | `.htaccess` | `placehold.co` en `img-src` |
| `mc-heads.net` con permiso de script | `.htaccess` | Solo imágenes |
| Menú móvil sin hacer nada en 8 páginas | `js/dala-nav.js` faltaba | Añadido |
| `/admin` precacheado para todo el mundo | `service-worker.js` | Fuera del precache y de la caché |
| `.git`, `.env`, `.zip` descargables | `.htaccess` | Bloqueados |
| `loading="lazy"` duplicado (12 páginas) | `<img>` de la galería | Corregido + `width`/`height` |
| Perfil con canonical de la wiki | `perfil.html` | Canonical propio + `noindex` |
| `staffverificar` con OG de la wiki | `staffverificar.html` | Corregido + `noindex` |
| 8 páginas sin `<h1>` | varias | Convertido el `<h2>` de cabecera |
| Nav sin traducir en 3 páginas | `privacidad`, `terminos`, `404` | Claves añadidas |
| 1.150 claves i18n duplicadas | 18 páginas | (pendiente: mover a `js/i18n.js`) |
| PIN de admin en texto plano | `admin-config.js` | Fichero borrado (era código muerto) |
| Página de diagnóstico pública | `probar-login.html` | Borrada (decía si una cuenta era admin) |

### 5.2 El fallo que casi no se ve (y por eso hay comprobacion automatica)

El CSS del sitio pone `opacity: 0` a todo elemento con la clase
`.reveal`, y solo se ven cuando JavaScript les anade `.visible`. Es
decir: **el contenido esta oculto por defecto y lo enseña el codigo**.

El dia que se perdio la linea que hacia esa comprobacion (al mover
el observer a `js/animacion.js`), la web entero se quedo en blanco:
se veia el fondo, la barra de navegacion y los botones, pero ni una
linea de contenido. El HTML estaba perfecto, los enlaces funcionaban y
la consola no decia nada. Es el peor tipo de fallo posible, porque no
se ve hasta que ya lo ha visto todo el mundo.

Por eso `ftexto.ps1` ejecuta siempre una comprobacion que carga cada
pagina de verdad y verifica que ningun `.reveal` se queda sin ver:

```
powershell -ExecutionPolicy Bypass -File ftexto.ps1
```

Ademas hay dos redes de seguridad en `js/animacion.js`, para que esto
no vuelva a pasar aunque el observer falle:

1. Si el navegador no tiene `IntersectionObserver`, el elemento se
   marca como visible al pintarse, sin animacion.
2. A los 2,5 segundos, todo `.reveal` que siga escondido se
   enseña. Una pagina sin animaciones es mejor que una pagina en
   blanco.

### 5.3 Lo que sigue pendiente

- **1.150 claves de traducción duplicadas en 18 páginas.** Son unos
  40 KB por página. Moverse a un `js/i18n.js` compartido. Es un
  trabajo mecánico pero largo; el payoff es directo: la web pesa
  menos y las traducciones se cambian en un sitio.
- **437 manejadores `onclick` en línea.** Es lo que obliga a poner
  `'unsafe-inline'` en la CSP. Con una CSP sin `unsafe-inline`, el
  navegador bloquearía cualquier script inyectado aunque se corrigiese
  el XSS. Es la mejora de seguridad más grande que queda. Muy
  laborioso: cientos de atributos.
- **Tres pares de CSS idénticos** (`eventos`/`noticias`,
  `reportes`/`postulaciones`, y `404`/`privacidad`/`terminos`):
  ~140 KB de duplicados en disco.
- **3 pares de bloques `loading="lazy"`** ya arreglados, pero siguen
  sin `width`/`height` 170 imágenes más.


## 6. Backups y monitorización

### 6.1 Backups: la regla 3-2-1

- **3 copias** del sitio y de la base de datos.
- En **2 medios** distintos (el servidor y el ordenador o Drive).
- **1 copia fuera del servidor** (la que te salva si te hackean el
  hosting entero).

**Copias automáticas cada noche:**

Si el bot está en un VPS con systemd:
```bash
# /etc/cron.d/odissey-backup
0 4 * * * root /home/odissey/backup.sh >> /var/log/odissey-backup.log 2>&1
```

```bash
#!/bin/bash
# backup.sh — copia diaria de la web y la base de datos
set -euo pipefail
DEST="/var/backups/odissey"
FECHA=$(date +%Y-%m-%d)
mkdir -p "$DEST"

# 1. Base de datos (ajustar user y nombre)
mysqldump --single-transaction --quick -u odissey -p'SECRETO' odissey \
  | gzip > "$DEST/db-$FECHA.sql.gz"

# 2. Ficheros del sitio
tar czf "$DEST/web-$FECHA.tar.gz" -C /var/www odisseymc.site

# 3. Solo los ultimos 14 dias
find "$DEST" -type f -name "*-$(date -d '14 days ago' +%Y-%m-%d).*" -delete 2>/dev/null || true
```

**Y la copia externa** (la 3-2-1), desde tu ordenador:
```powershell
# Windows, tarea programada cada noche
$rclone sync C:\Users\TUUSUARIO\backups\odissey gdrive:odissey-backups
```

**Probar la restauración.** Una copia que nunca se ha restaurado no
es una copia, es una suposición. Cada mes, una vez:
```bash
gunzip -c db-2026-10-09.sql.gz | head -50
tar tzf web-2026-10-09.tar.gz | head
```
Si eso no funciona, la copia no sirve.

### 6.2 Registro de auditoría

Odissey ya tiene algo: `/api/admin/log` registra quién entra al
panel y qué borra. Lo que falta:

- Registrar también los **cambios de permisos** (dar admin, cambiar
  rol) y los **inicios de sesión** de los administradores con IP y
  dispositivo. El panel ya tiene esa pantalla (`/api/admin/registro`),
  pero conviene confirmar que el bot está escribiendo en ella.

- **No registrar contraseñas ni tokens** en los logs. Nunca. Si
  alguien lee el log, no debe poder entrar con lo que haya ahí.

### 6.3 Integridad de ficheros (detectar cambios no autorizados)

Si alguien entra en el hosting y cambia un `.js` para robar sesiones,
el sitio sigue funcionando pero está comprometido. Esta comprobación
lo detecta:

```bash
#!/bin/bash
# /etc/cron.d/odissey-integridad  (cada 6 horas)
0 */6 * * * root /home/odissey/integridad.sh >> /var/log/odissey-integridad.log 2>&1
```

```bash
#!/bin/bash
# integridad.sh
set -euo pipefail
RAIZ=/var/www/odisseymc.site
HASHES=/home/odissey/hashes.txt

# Referencia: la primera vez genera el fichero. DESPUES de subir una
# version nueva, hay que regenerarlo a proposito:
#   cd "$RAIZ" && find . -type f \( -name '*.js' -o -name '*.css' \) \
#     -exec sha256sum {} \; | sort > "$HASHES"
find "$RAIZ" -type f \( -name '*.js' -o -name '*.css' \) -exec sha256sum {} \; | sort > /tmp/actual.txt
if ! diff -q "$HASHES" /tmp/actual.txt > /dev/null; then
  echo "=== $(date) HAY CAMBIOS NO AUTORIZADOS ==="
  diff "$HASHES" /tmp/actual.txt || true
  # Aviso por correo
  mail -s "Odissey: cambios no autorizados" juan@odisseymc.site < /tmp/actual.txt
fi
```

### 6.4 Escaneo de malware

```bash
# Diario, ClamAV
0 5 * * * root freshclam --quiet && \
  clamscan -r --infected --remove=no /var/www/odisseymc.site \
  >> /var/log/clamscan.log 2>&1
```

En un hosting compartido sin sudo, la alternativa es un plan
gratuito que vigila por fuera: **Sucuri SiteCheck** o
**Cloudflare Security Analytics**.

### 6.5 Mantener todo actualizado

```bash
# En la carpeta del bot:
npm audit --audit-level=high
npm outdated

# En la carpeta del plugin de Minecraft, si es Java/Maven:
mvn dependency:tree | grep -i 'vulnerable\|SNYK'
```

Cada mes, y **antes** de cada despliegue.


## 7. Comprobación rápida (5 minutos, hazla cada mes)

```bash
# 1. El sitio responde y con HTTPS
curl -sI https://odisseymc.site/ | head -1

# 2. Todas las cabeceras de seguridad
curl -sI https://odisseymc.site/ | grep -iE 'strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin'

# 3. HTTP salta a HTTPS
curl -sI http://odisseymc.site/ | head -1
# Debe ser HTTP/1.1 301 (o 308)

# 4. No se descargan ficheros privados
curl -sI https://odisseymc.site/.git/config | head -1
curl -sI https://odisseymc.site/web-publish.zip | head -1
# Ambos deben ser 404

# 5. El certificado
echo | openssl s_client -connect odisseymc.site:443 2>/dev/null \
  | openssl x509 -noout -dates
```

En el navegador:
- [ ] La web carga sin errores en la consola (F12).
- [ ] El widget de Discord aparece.
- [ ] Los avatares de Discord se ven.
- [ ] Las skins del staff se ven (o sale la imagen de reserva).
- [ ] El menú móvil abre y cierra.
- [ ] Cambiar idioma cambia TODO, también la barra de navegación.
- [ ] La tienda se puede usar desde el móvil.
- [ ] `/admin` pide entrar y no deja ver nada sin sesión.


## 8. Si ocurre un incidente

1. **No borres nada todavía.** Los logs son la prueba.
2. **Cambia las contraseñas**: admin, Discord, hosting, correo.
3. **Revoca las sesiones** desde el panel (`Cerrar sus sesiones`).
4. Si hubo acceso al servidor: **cambia las claves SSH** y revisa
   `/root/.ssh/authorized_keys`.
5. **Restaura desde la copia externa** (por eso la copia está fuera).
6. Mira los accesos desde `access.log` filtrando por IP sospechosa:
   ```bash
   grep "IP_SOSPECHOSA" /var/log/nginx/odissey.access.log
   ```
7. Avisa a quien haya afectado (obligatorio con datos personales,
   en el plazo de 72 h).