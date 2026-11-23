# Migración a Supabase — estado actual y scripts de referencia

> **Estado a 2026-11-22: la migración YA está implementada.** La web es un
> sitio estático publicado en GitHub Pages y el bot/API en `/bot` ya no forma
> parte del despliegue: no hay backend Node que atienda peticiones.
> `js/datos.js` intercepta las llamadas de la web a su propia ruta `/api/*`
> y las responde desde Supabase, con permisos aplicados por RLS. Login,
> registro, perfil, contenido, reportes, valoraciones, pedidos y panel de
> administración funcionan contra Supabase. Las funciones que dependían de
> un proceso siempre encendido (tickets en Discord, RCON, puente de staff)
> se retiraron; no se han reimplementado.

---

## 0. Los scripts SQL: fuente de la verdad del esquema

Los SQL de `supabase/` ya están aplicados en el proyecto de Supabase y son
la referencia del esquema, las políticas y los datos iniciales: si hay que
cambiar la base de datos, primero se cambia el SQL correspondiente y luego
se ejecuta en Supabase → **SQL Editor**. No existe una copia de esta lógica
en el bot, porque el bot ya no está desplegado.

| Archivo | Para qué sirve |
|---|---|
| `supabase/01-esquema.sql` | Tablas base y estructuras compartidas |
| `supabase/02-politicas.sql` | Políticas RLS: aquí están los permisos reales |
| `supabase/03-datos.sql` | Trigger de alta de perfil, validación de nombre y comprobaciones |
| `supabase/04-comprobacion.sql` | Informe de verificación (solo lectura) |
| `supabase/05-almacen.sql` | Cubo de Storage para imágenes de perfil y políticas |
| `supabase/06-comprobar-almacen.sql` | Verificación del cubo y sus políticas (solo lectura) |
| `supabase/07-equipo.sql` | Datos iniciales de `staff_members` |
| `supabase/08-baneos.sql` | Historial público de baneos |
| `supabase/09-apelaciones-baneos.sql` | Apelaciones de baneos desde la web |

`04-comprobacion.sql` y `06-comprobar-almacen.sql` son solo `SELECT`: se
pueden ejecutar las veces que haga falta. Si `02-politicas.sql` deja alguna
tabla sin RLS o una política de escritura sin condición, hay que corregirla
en el propio SQL antes de dar nada por bueno.

### En Authentication → Providers → Email

Conviene verificar que sigue marcado **Confirm email**: es lo que hace que
Supabase envíe el correo de confirmación y frena el registro masivo de bots.

---

## 1. Lo que ya está implementado en la web

- `js/supabase.js` — cliente único (con varios, las sesiones se pisan entre
  páginas). Se carga antes que `auth.js` en las páginas que lo usan.
- `site-config.js` — URL del proyecto y publishable key. No hay URL del bot.
- `auth.js` — login y registro contra Supabase Auth; también
  `comprobarSesion()` y `salir()`.
- `js/datos.js` — interceptor de `fetch()` para las peticiones de la web a
  su propio `/api/*`. Mantiene las ~221 llamadas existentes y las resuelve
  contra Supabase: sesión, perfil, comprobación de admin, contenido,
  reportes, valoraciones, pedidos y panel de administración. Los permisos
  los aplica RLS en la base de datos, no JavaScript.
- `supabase/02-politicas.sql` — políticas RLS por rol; `supabase/*.sql` es
  la fuente de la verdad del esquema.

---

## 2. Estado de las tareas que antes estaban pendientes

| # | Tarea | Estado actual |
|---|---|---|
| 1 | Perfil: `/api/auth/profile`, `/api/auth/profile/image` | Hecho en `auth.js` + `js/datos.js` (tabla `profiles` y Storage) |
| 2 | Contenido: noticias, eventos, galería, productos, ajustes | Hecho: `js/datos.js` sirve `/api/content` desde Supabase |
| 3 | Reportes, valoraciones, pedidos | Hecho en `js/datos.js`, con RLS |
| 4 | Panel de admin (con RLS por rol) | Hecho en `admin.html` + `supabase/02-politicas.sql` |
| 5 | Tickets → Discord (Edge Function) | Retirado: no hay bot; `/api/tickets/*` responde 501 |
| 6 | Eliminar el bot y su integración | El bot está fuera del despliegue; `js/turnstile.js` sigue pidiendo el reto en cliente (ver §4) |
| 7 | Migrar los datos de `tickets.db` | No aplica: no hay backend al que migrarlos. Solo tendrían salvación desde una copia antigua, fuera de este repo |

### Funciones retiradas (sin sustituto)

- **Tickets en Discord** (`/api/tickets/*`) — creación de canales.
- **RCON de Minecraft** (`/api/mc/*`) — leía la lista de OP por TCP.
- **Puente de staff** (`/api/staff/puente*`) — intercambio de códigos en vivo.
- **Vinculación de Discord** (`/api/auth/discord/*`), `/api/guilds/*` y
  `/api/discord/stats`.

Necesitaban un proceso siempre encendido, y GitHub Pages no lo es.
`js/datos.js` responde 501 a estas rutas y oculta la interfaz que las usaba.

---

## 3. Las cuentas del bot (contexto histórico)

> Esta sección se conserva solo para explicar por qué no se intentó
> importar la antigua base de usuarios. El bot ya no está desplegado y
> las cuentas se crean directamente en Supabase Auth.

Las cuentas del bot estaban cifradas por `database.js`
(`db.hashPassword`). Supabase Auth usa **bcrypt** por su cuenta. Son
algoritmos distintos: **no se puede transferir el hash tal cual**.

Alguien con cuenta en el bot **no podrá entrar** con la misma contraseña
tras la migración. Dos caminos:

- **A. Empezar de cero.** Se vacían las cuentas y todo el mundo se registra
  otra vez. Lo normal si casi no hay usuarios.
- **B. Migrar usuarios sin contraseña.** Se dan de alta en Supabase Auth con
  una contraseña aleatoria y se marca `deben_cambiar_clave`. Nadie entra con
  la antigua, pero conserva **nombre de usuario, correo y rol** (que es lo
  que de verdad se nota perder). Requiere la `service_role key`, que es
  secreta y va solo en el servidor.

En la práctica no hay migración activa: no existe el bot del que importar
usuarios, y el alta se hace en Supabase Auth. El camino B quedaría como
referencia solo si se recuperase una copia antigua con cuentas que hubiera
que preservar.

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

La web se publica como sitio estático en GitHub Pages: el despliegue es el
push a la rama publicada, no un servidor Node. El zip sigue siendo útil
para un hosting clásico:

```powershell
node package.js          # genera web-publish.zip
```

`supabase/`, los SQL y los artefactos `_*` quedan fuera del zip a propósito.
Antes de publicar, confirma que los SQL de la tabla anterior están aplicados
en Supabase: si faltan tablas o políticas, las llamadas desde `js/datos.js`
darán error aunque el sitio estático cargue bien.
