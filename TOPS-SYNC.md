# Tops del servidor en la web (BK-Tops → Supabase)

La portada muestra **Top Kills**, **Top Dinero** y **Top Horas**. Los datos no
se escriben a mano: salen del plugin **BK-Tops** que ya tienes en el servidor.

## Cómo funciona

```
Minecraft (BK-Tops, MySQL)
        │  scripts/sync-tops.cjs lee top_kills_perma, top_money, top_play_time
        ▼
Supabase (tabla server_tops)  ← la rellena el script con la service role key
        │  la web la lee con la publishable key (solo SELECT)
        ▼
index.html  →  /api/tops  →  las tres listas de la portada
```

El script se ejecuta cada pocos minutos. La web nunca habla directamente con
MySQL ni con el servidor de Minecraft, así que no hay que abrir puertos ni
exponer la base de datos.

---

## Paso 1 · Poner BK-Tops en MySQL

Por defecto BK-Tops usa H2 (un archivo local). Para que el script pueda leer
los tops, cámbialo a MySQL:

1. Abre `plugins/BK-Tops/configuration/database.yml`.
2. Cambia `driver: h2` por `driver: mysql`.
3. Rellena `host`, `port`, `db-name`, `username` y `password` con la base de
   datos MySQL que vayas a usar.
4. Reinicia el servidor.

Al arrancar, BK-Tops crea una tabla por cada top:

| Top en `tops.yml` | Tabla en MySQL        |
| ----------------- | --------------------- |
| `kills_perma`     | `top_kills_perma`     |
| `money`           | `top_money`           |
| `play_time`       | `top_play_time`       |

> Si ya tenías tops guardados en H2, al pasar a MySQL empiezan vacíos y se
> van rellenando otra vez con el paso del tiempo (BK-Tops los recalcula desde
> PlaceholderAPI). No se pierde nada del servidor, solo el ranking histórico.

Si tus tops se llaman distinto, cambia los IDs en `site-config.js`:

```js
tops: {
    kills: 'kills_perma',
    money: 'money',
    hours: 'play_time'
},
```

---

## Paso 2 · Crear la tabla en Supabase

En **Supabase → SQL Editor**, ejecuta el archivo:

```
supabase/10-tops.sql
```

Crea `server_tops` con lectura pública y escritura reservada al servidor.

---

## Paso 3 · Copiar la service role key

En **Supabase → Project Settings → API → service_role** copia la clave.
Es **secreta**: solo se usa en el servidor, nunca en el JavaScript de la web.

---

## Paso 4 · Configurar el script

```bat
cd scripts
copy .env.example .env
notepad .env
```

Rellena:

```env
BKTOPS_DB_HOST=127.0.0.1
BKTOPS_DB_PORT=3306
BKTOPS_DB_USER=tu_usuario_mysql
BKTOPS_DB_PASSWORD=tu_contraseña_mysql
BKTOPS_DB_NAME=bktops

SUPABASE_URL=https://cffpnxmtwfaublkvrobt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=la_service_role_key

TOPS=kills_perma,money,play_time
TOPS_LIMIT=10
```

> `scripts/.env` está en `.gitignore`: no se sube a GitHub.

---

## Paso 5 · Instalar y probar

Necesitas **Node.js 18 o superior**.

```bat
cd scripts
npm install
node sync-tops.cjs
```

Deberías ver algo así:

```
[tops] kills_perma: 10 entradas sincronizadas
[tops] money: 10 entradas sincronizadas
[tops] play_time: 10 entradas sincronizadas
```

Abre la web y recarga la portada. Si aún no hay datos, verás
«Sin datos todavía»; en cuanto el script termine, aparecen las listas.

Para probar sin escribir nada en Supabase:

```bat
set DRY_RUN=true
node sync-tops.cjs
```

---

## Paso 6 · Automatizarlo

### Windows (Programador de tareas)

1. Abre **Programador de tareas → Crear tarea básica**.
2. Repetir cada **5 minutos**.
3. Acción: **Iniciar un programa** →
   `D:\OdisseyMC\Odissey-Web\scripts\sincronizar-tops.bat`.

### Linux (cron)

```cron
*/5 * * * * cd /ruta/Odissey-Web/scripts && /usr/bin/node sync-tops.cjs >> tops.log 2>&1
```

---

## Comprobar que llega a la web

Abre en el navegador:

```
https://odisseymc.site/api/tops
```

Debe devolver algo como:

```json
{
  "ok": true,
  "tops": {
    "kills_perma": [{ "position": 1, "name": "Jugador", "value": 1234 }],
    "money": [],
    "play_time": []
  },
  "updatedAt": "2026-11-26T18:00:00+00:00"
}
```

Ese JSON lo genera `js/datos.js` leyendo `server_tops`.

---

## Problemas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| `no se pudo leer top_kills_perma` | El top no existe en `tops.yml` o MySQL no está activo. |
| `Falta el paquete mysql2` | No ejecutaste `npm install` dentro de `scripts`. |
| `Supabase respondió 401` | La service role key es incorrecta. |
| `Supabase respondió 404` | No ejecutaste `supabase/10-tops.sql`. |
| La web dice «Sin datos todavía» | El script aún no se ha ejecutado o no hay jugadores en ese top. |
| Los nombres salen mal | Revisa que el top use `display_name` correcto en BK-Tops. |

---

## Nota sobre el formato

BK-Tops guarda el valor en bruto:

- **Kills**: número entero.
- **Dinero**: número decimal (se muestra compacto: `1,25M`).
- **Horas**: segundos (se muestra como `12d 4h`).

La web da formato a esos valores; no hace falta tocar `tops.yml` para eso.
