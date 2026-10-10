# Migración a Supabase — qué hacer y en qué orden

> Estado a 2026-10-10. La web ya está en GitHub Pages y **el backend
> (el bot) ya no es accesible**: `odisseymc.site/bot` devuelve 404 porque
> ese dominio lo sirve GitHub Pages, que solo da archivos estáticos. O sea
> que login, registro, tickets, reportes y panel de admin **ahora mismo no
> funcionan**. Esto no es una mejora: es recuperar esa parte.

---

## 0. Lo que hay que ejecutar en Supabase (tú, 5 minutos)

En el panel de Supabase → **SQL Editor** → New query. Ejecuta los tres
archivos **por este orden**, porque el segundo usa funciones del primero:

| Orden | Archivo | Qué crea |
|---|---|---|
| 1º | `supabase/01-esquema.sql` | Tablas y funciones base |
| 2º | `supabase/02-politicas.sql` | Políticas RLS |
| 3º | `supabase/03-datos.sql` | Triggers, función de login, comprobaciones |

**El paso 3 termina con dos consultas de comprobación.** Ambas deben
devolver **cero filas**:

- `SIN RLS: …` — si sale alguna tabla, esa tabla está abierta para todo el
  mundo. Es el fallo más grave posible y no avisa por sí solo.
- `POLIZA ABIERTA: …` — policies de escritura sin condición.

Si alguna sale, no sigas: mándame lo que devuelven.

### Después, en Authentication → Providers → Email

Deja marcado **Confirm email**. Está así a propósito: es lo que permite
que Supabase envíe el "confirma tu correo" y que bloquee los bots que se
registran en lote.

---

## 1. Lo que ya está hecho en la web

- `js/supabase.js` — cliente único (uno solo para toda la web: con varios,
  las sesiones se pisan entre páginas).
- `site-config.js` — URL y publishable key.
- `auth.js` — login y registro contra Supabase Auth; también
  `comprobarSesion()` y `salir()`.
- `auth.js` enlazado en 14 páginas, antes de `auth.js` (que lo necesita).
- Verificado en Chrome real: la librería carga, el cliente se crea, el login
  llega a Supabase y responde "credenciales incorrectas". **Cero llamadas
  al bot.**

---

## 2. Lo que falta

Nada de esto está hecho todavía:

| # | Tarea | Dónde |
|---|---|---|
| 1 | Perfil: `/api/auth/profile`, `/api/auth/profile/image` | `auth.js`, `perfil.js` |
| 2 | Contenido: noticias, eventos, galería, productos, ajustes | `site-data.js`, `site-config.js` |
| 3 | Reportes, valoraciones, pedidos | 6 páginas |
| 4 | Panel de admin (con RLS por rol) | `admin.html` |
| 5 | Tickets → Discord (Edge Function) | `web.js`, `js/foro.js` |
| 6 | **Eliminar el bot** y la integración de Turnstile | `Bot-Tickets/` |
| 7 | Migrar los datos de `tickets.db` | `Bot-Tickets/tickets.db` |

### Funciones del bot que desaparecen

Decidido por ti:

- **RCON de Minecraft** (`/api/mc/*`) — leía la lista de OP por TCP.
- **Puente de staff** (`/api/staff/puente*`) — intercambio de códigos en vivo.

Necesitaban un proceso siempre encendido, y GitHub Pages no lo es.

---

## 3. La trampa de las cuentas existentes

Las cuentas del bot están con contraseñas cifradas por `database.js`
(`db.hashPassword`). Supabase Auth usa **bcrypt** por su cuenta. Son
algoritmos distintos: **no se puede transferring el hash tal cual**.

Alguien con cuenta en el bot **no podrá entrar** con la misma contraseña
tras la migración. Dos caminos:

- **A. Empezar de cero.** Se vacían las cuentas y todo el mundo se registra
  otra vez. Lo normal si casi no hay usuarios.
- **B. Migrar usuarios sin contraseña.** Se dan de alta en Supabase Auth con
  una contraseña aleatoria y se marca `deben_cambiar_clave`. Nadie entra con
  la antigua, pero conserva **nombre de usuario, correo y rol** (que es lo
  que de verdad se nota perder). Requiere la `service_role key`, que es
  secreta y va solo en el servidor.

Dime cuál cuando lleguemos a ese punto.

---

## 4. Turnstile: qué cambia

Se montó captcha en el login y el registro, pero **el backend ya no es el
bot**, y `supabase.auth.signInWithPassword()` llama directo al servidor de
Supabase sin dejar meter campos extra.

Lo que hace ahora el código:
- sigue pidiendo el reto al visitante,
- comprueba que haya token antes de enviar (así no se gastan intentos de
  autenticación de Supabase, que son limitados),
- pero **nadie valida ese token**.

La solución correcta es la **captcha nativa de Supabase**
(*Authentication → Sign In / Providers → Bot Detection* o el hook
`validateCaptcha`), o el de hCaptcha. Es el Turnstile de antes pero
validado dentro del flujo de Supabase.

Mientras tanto, el registro tiene el límite de Supabase por defecto, así
que no está abierto: no es una puerta sin protección, es una puerta con
una cerradura provisional.

---

## 5. Publicar

Todo esto **está en tu disco, no subido**. La web en producción sigue igual
(con el login roto) hasta que subas.

```powershell
node package.js          # genera web-publish.zip
```

`supabase/` y los scripts `_*.cjs` quedan fuera del zip a propósito.

**No subas todavía** hasta tener las tablas creadas en Supabase: si subes
antes, el login dá error contra tablas inexistentes.