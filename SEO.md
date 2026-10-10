# SEO / lanzamiento — lo que falta por hacer y cómo
#
# Este documento es la lista de comprobación de las 20 + 10 + 20
# cosas de la lista que se-ha-pasado. Marca lo que ya está hecho y
# lo que depende de una cuenta que hay que crear.
#
# Lo hecho en el código no necesita cuentas: ya está.


## 1. Las 20 cosas antes de lanzar

| # | Cosa | Estado |
|---|---|---|
| 01 | Aviso legal | Hecho: `terminos.html` |
| 02 | Política de privacidad | Hecho: `privacidad.html` |
| 03 | Aviso de cookies | Hecho: banner + `js/analitica.js` que solo mide si se acepta |
| 04 | Forzar HTTPS | Hecho en `.htaccess`; falta **activar SSL** en el panel |
| 05 | Meta títulos y descripciones | Hecho: cada página tiene los suyos, ya no son 8 copias del mismo |
| 06 | Datos estructurados | Hecho: JSON-LD por página (`seo-schema.ps1`) |
| 07 | Sitemap y robots.txt | Hecho |
| 08 | Ficha de Google | Hecho: `sitemap.xml` + `robots.txt`. Falta el código de verificación (§3) |
| 09 | Favicon | Hecho |
| 10 | Texto alternativo en imágenes | Hecho: las 243 imágenes tienen `alt` |
| 11 | Imágenes optimizadas | **Parcial**: falta convertir a `.webp` las que faltan (§4) |
| 12 | Velocidad de carga | **Parcial**: falta medir (§5) |
| 13 | Contraste de colores | **Pendiente**: revisar a mano (§5) |
| 14 | Que se vea bien en móvil | Hecho: `js/dala-nav.js` añadido donde faltaba |
| 15 | Página 404 personalizada | Hecho |
| 16 | Enlaces rotos arreglados | Hecho: `ftexto.ps1 enlaces` sale limpio |
| 17 | Formularios protegidos contra spam | Hecho: `js/formulario.js` |
| 18 | Botón de WhatsApp visible | **Pendiente**: falta el número (§2) |
| 19 | Analítica instalada | Hecho: `js/analitica.js`, sin terceros |
| 20 | Una sola llamada a la acción | Hecho: la portada tiene un botón, no dos |


## 2. Lo único que necesita que me digas: el WhatsApp

Falta el número. Cuando lo tengas, hay que añadir el botón en el
pie de las 18 páginas, junto a Discord y TikTok. Está marcado aquí
para no olvidarlo:

```html
<a href="https://wa.me/TUN_NUMERO?text=Hola%20Odissey"
   target="_blank" rel="noopener noreferrer" title="WhatsApp"
   class="whatsapp-btn" data-analytics="cta_whatsapp">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.5 14.4c-.3-.2-1.7-.8-2-1s-.5-.1-.6.1-.7 1-.9 1.2-.3.2-.6.1a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.6-2c-.2-.3 0-.5.1-.6l.4-.6.3-.5v-.5l-1-2.3c-.2-.6-.5-.5-.6-.5h-.6a1.2 1.2 0 0 0-.8.4A3.4 3.4 0 0 0 4.6 9a6 6 0 0 0 1.3 3.2 13.8 13.8 0 0 0 5.3 4.6 17.8 17.8 0 0 0 1.8.7 4.3 4.3 0 0 0 2 .1 3.3 3.3 0 0 0 2.2-1.6 2.7 2.7 0 0 0 .2-1.5z"/>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/>
    </svg>
    WhatsApp
</a>
```

Y el estilo, en `theme.css`:

```css
.whatsapp-btn { display:inline-flex; align-items:center; gap:.5rem; ... }
.whatsapp-btn svg { width:16px; height:16px; }
/* El verde de WhatsApp, pero el de la marca se ve mejor en oscuro */
.whatsapp-btn:hover { background:rgba(37,211,102,.15); }
```


## 3. Google Search Console y Bing

### Google Search Console

1. <https://search.google.com/search-console> → **Añadir propiedad**.
2. Elige el tipo **Prefijo de dominio** (funciona con www y sin www).
3. Google te dará un HTML de verificación. Se sube como
   `googleVERIFICACION.html` en la raíz del sitio. Ojo: **este
   fichero sí se sube** (a diferencia de los de desarrollo).

   Alternativa sin fichero: si usas Cloudflare o el panel tiene
   "Search Console", mete la verificación por DNS (TXT). Es mejor
   porque no hay nada que volver a subir.

4. Cuando esté verificado, envía el sitemap:
   `https://odisseymc.site/sitemap.xml`.

### Bing Webmaster Tools

1. <https://www.bing.com/webmasters> → añadir `odisseymc.site`.
2. **Importar desde Google Search Console**: es un botón y te
   copia todo. Es lo más rápido.
3. Envía también el sitemap.

### Lo que tarda

Google tarda entre 2 y 8 semanas en indexar el sitio. No es un
problema: se ve en la cobertura de Search Console. Si una página
sale en rojo, hay que mirar por qué (normalmente: bloqueada en
robots.txt, o sin canonical, o con un 404).


## 4. Optimizar las imágenes

Estado actual:

| Fichero | Tamaño | Nota |
|---|---|---|
| `background1.jpg` | 92 KB | La más pesada. Es el fondo, se ve borroso |
| `diosdelmar.webp` | 88 KB | Banner de tienda |
| `heroe.webp` | 83 KB | Banner de tienda |
| `capitan.webp` | 73 KB | Banner de tienda |
| `semidios.webp` | 71 KB | Banner de tienda |
| `icon-512.png` | 46 KB | Icono de la app |
| `apple-touch-icon.png` | 18 KB | Icono de iOS |

**Lo que hay que hacer:**

1. Convertir `background1.jpg` a `.webp`:
   ```
   cwebp background1.jpg -q 75 -o background.webp
   ```
   Se pasa de 92 KB a unos 25 KB. Luego cambiar la referencia en
   los CSS (`background1.jpg` → `background.webp`).

2. Recomprimir los 4 banners de tienda a calidad 78:
   ```
   cwebp diosdelmar.webp -q 78 -o tmp.webp && mv tmp.webp diosdelmar.webp
   ```
   Bajan a la mitad sin que se note.

3. `icon-512.png` (46 KB) debería ser WebP. Los iconos de manifest
   admiten WebP sin problema en todos los navegadores actuales.

4. Añadir `loading="lazy"` a los banners de la tienda: ya está.

**Regla general:** ninguna imagen por encima de 100 KB; por debajo
de 30 KB para iconos; entre 30 y 60 para fotos de contenido.


## 5. Rendimiento y contraste

### Medir (gratis y en 30 segundos)

<https://pagespeed.web.dev/> con la URL de la web.

Los umbrales que hay que mirar:

| Métrica | Bueno | Hay que arreglar |
|---|---|---|
| Performance (móvil) | > 90 | < 50 |
| LCP (cuándo se ve lo principal) | < 2.5 s | > 4 s |
| CLS (saltos de la página) | < 0.1 | > 0.25 |
| INP (responde al tocar) | < 200 ms | > 500 ms |

Lo normal es que CLS esté ya en verde (se han puesto los
`width`/`height`).

### Lo que más engorda ahora mismo

El HTML pesa 80-140 KB por página, casi todo el diccionario de
traducciones repetido 18 veces. Eso son unos 500 KB de traducciones que no
cargan en la primera visita pero sí en cada cambio de idioma.

**La solución (pendiente, es la mejora grande de rendimiento):**
mover `const I18N = {...}` a un `js/i18n.js` compartido y dejar
en cada página solo lo que esa página usa. Ahorra ~40 KB por
página. Está en `SEGURIDAD.md`, sección 5.2.

### Contraste de colores

Hay que comprobarlo a mano:

1. Abrir la web en modo oscuro y claro. El conmutador esta en la
   barra de arriba, al lado del boton de idioma.
2. En Chrome: DevTools (F12) → lighthouse → "Accessibility" →
   *Contrast*.

Lo que hay que mirar en Odissey:

- El texto gris sobre fondo azul marino (`--od-text-dark`). Es el
  que más riesgo tiene: si está por debajo de 4.5:1, cuesta de
  leer.
- El dorado (`--od-marine-accent`) sobre azul oscuro.
- Los textos dentro de los botones.

Regla: 4.5:1 para texto normal, 3:1 para texto grande (más de 24
px o en negrita).

Herramienta rápida: <https://webaim.org/resources/contrastchecker/>


## 6. Las 10 cosas de seguridad

| # | Cosa | Estado |
|---|---|---|
| 01 | HTTPS con candado en toda la web | En `.htaccess`; falta activar SSL |
| 02 | Cortafuegos contra ataques | `.htaccess` + `WAF.md` + `nginx.conf.example` |
| 03 | reCAPTCHA en formularios | **Cambiado por honeypot + límite** (mejor: no pide cookies a nadie) |
| 04 | Bloqueo de intentos de contraseña | Hecho en cliente; falta el del bot (`SEGURIDAD.md` §4.1) |
| 05 | Escáner de virus diario | `SEGURIDAD.md` §6.4 |
| 06 | Plugins y tema al día | No aplica (no es WordPress). El equivalente es `npm audit` del bot |
| 07 | Ningún plugin pirata | No aplica |
| 08 | Copia fuera del hosting | `SEGURIDAD.md` §6.1 (regla 3-2-1) |
| 09 | Acceso distinto a wp-admin | Hecho y superado: `/admin` + verificación en el bot + Basic Auth en Nginx |
| 10 | Verificación en dos pasos | **Falta**: se explica en `SEGURIDAD.md` §4.3 |

Sobre el 03: la lista dice reCAPTCHA, pero reCAPTCHA manda la
navegación del visitante a Google y pone cookies de terceros. Para
un formulario de "reportar a un jugador" es desproporcionado. Lo
puesto (campo trampa + límite de 5 en 10 minutos + tiempo mínimo)
hace lo mismo sin rastrear a nadie. Si en algún momento hace
falta más, se añade Cloudflare Turnstile, que es invisible y no usa
cookies de Google.


## 7. Las otras 20 cosas (parte 2)

| # | Cosa | Estado |
|---|---|---|
| 01 | Quitar el noindex | **No se quita, y es a propósito**: `/perfil` y `/staffverificar` son personales. Las públicas no lo tienen |
| 02 | Alta en Search Console | §3 |
| 03 | Alta en Bing | §3 |
| 04 | Teléfono y correo tocables | **Falta**: no hay teléfono. El correo está en `privacidad.html` |
| 05 | Iconos de redes a cuentas reales | Hecho: Discord y TikTok con `rel="noopener noreferrer"` |
| 06 | Redirecciones 301 | Hecho: `.html` → URL limpia |
| 07 | Una sola versión del dominio | **Falta**: falta la redirección de `www` a sin `www` (§3.5) |
| 08 | URL canónicas | Hecho: una por página, y corregidas las que estaban mal |
| 09 | URLs limpias | Hecho |
| 10 | Jerarquía de enlaces internos | Hecho: la nav está en las 18 páginas |
| 11 | Una página por intención de búsqueda | Hecho: 15 páginas, cada una con su título |
| 12 | Vista previa al compartir | Hecho: Open Graph + Twitter Card en todas |
| 13 | Caché configurada | Hecho: `.htaccess` + service worker |
| 14 | SSL con renovación automática | Let's Encrypt / AutoSSL de cPanel |
| 15 | Copias de seguridad automáticas | `SEGURIDAD.md` §6.1 |
| 16 | Aviso si la web se cae | **Falta**: un monitor externo (§3.6) |
| 17 | Borrar el contenido de prueba | Hecho: `probar-login.html` y `limpiar.html` borrados |
| 18 | Probar en varios navegadores | Manual (§3.7) |
| 19 | Página de gracias tras el formulario | **Falta** (§3.8) |
| 20 | Medir conversiones | Hecho: `js/analitica.js` marca compras, reportes y valoraciones |


## 8. Lo que falta, en una lista

Cada punto dice qué hay que hacer y cuánto tarda.

### 8.1 Redirigir www a sin www

En el `.htaccess`, en el bloque 2, antes de la redirección a HTTPS:

```apache
  RewriteCond %{HTTP_HOST} ^www\.odisseymc\.site$ [NC]
  RewriteRule ^ https://odisseymc.site%{REQUEST_URI} [R=301,L]
```

Sin esto, `https://www.odisseymc.site/tienda` y
`https://odisseymc.site/tienda` son dos URLs distintas para Google,
y eso se llama contenido duplicado.

### 8.2 Aviso si la web se cae

Gratis, en 5 minutos:

- <https://uptimerobot.com> → crear cuenta → **Add New Monitor**:
  - URL: `https://odisseymc.site/`
  - Interval: 5 minutes
  - Alert contacts: correo + Discord (integración gratis)

Con eso recibes un aviso en 5 minutos si la web no responde.

El aviso de "solo en mantenimiento" ya existe: es el panel de
admin → Mantenimiento, que pone un banner en toda la web.

### 8.3 Página de gracias

Los formularios de hoy enseñan un aviso y ya. Una página de
gracias es mejor por dos razones:

1. El visitante ve "ya está hecho" y no vuelve a enviarlo.
2. Es una página que Google puede indexar y que se posiciona para
   búsquedas como "reportar jugador minecraft".

La más útil aquí: `gracias.html`, a la que apunta el formulario de
reportar. Y también el formulario de valoración.

Se ha dejado el hueco preparado: la regla de URL limpia de
`.htaccess` ya acepta `gracias`.

### 8.4 Probar en navegadores

No hay forma de probarlo automáticamente sin pagar. A mano:

| Dónde | Por qué |
|---|---|
| Chrome, Firefox, Edge, Safari | Los 4 motores de verdad |
| Android (Chrome) | La mitad de los visitors |
| iPhone (Safari) | El otro medio, y es el que más se diferencia |
| Modo incógnito | Para ver sin la caché ni las cookies viejas |

En cada uno: carga la portada, abre el menú móvil, entra en la
tienda, cambia el idioma, cierra sesión. Si algo falla solo en uno,
mira la consola (F12) y fíjate en el error.

Lista de verificación rápida en cada navegador:

- [ ] La portada carga y el fondo se ve.
- [ ] El botón de idioma cambia a inglés TODO, incluida la nav.
- [ ] El menú móvil abre y se cierra.
- [ ] El carrito abre, se añade un producto y el badge sube.
- [ ] "Entrar" abre el modal y el registro valida la contraseña corta.
- [ ] La galería abre la imagen al pinchar.
- [ ] `/404` sale al escribir una URL inventada.
- [ ] F12 → consola: **cero errores rojos**.


## 9. Orden recomendado

1. **Activar SSL** en el panel. Sin esto, todo lo demás da igual:
   Chrome marca la web como "No segura" y elVisitor no entra.
2. **Fijar el sitio en Google Search Console** y mandar el sitemap.
3. **Redirigir www** (8.1) y comprobar el candado.
4. **Activar Cloudflare** (`WAF.md`) para tapar la IP y tener WAF.
5. **Poner el 2FA** a las cuentas de administración (`SEGURIDAD.md` §4.3).
6. **Montar los backups** (§6.1) y **probarlos**.
7. Añadir el botón de WhatsApp cuando tengas el número.
8. Comprimir las imágenes (§4).
9. Medir en PageSpeed y decidir por dónde seguir (§5).
10. Montar el monitor externo (§8.2).

Lo que no puede esperar: el paso 1. Todo lo demás se puede hacer en
cualquier momento.