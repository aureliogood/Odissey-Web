#!/usr/bin/env node
/* =============================================================
   sync-tops.cjs — BK-Tops (MySQL) -> Supabase (server_tops)

   QUÉ HACE
   -------------------------------------------------------------
   Lee las tablas que crea el plugin BK-Tops en MySQL
   (top_<id>, con columnas identifier, display_name, top_value)
   y copia el ranking a la tabla server_tops de Supabase, que es
   la que lee la web en /api/tops.

   Se puede ejecutar a mano o cada X minutos con el Programador
   de tareas de Windows / cron. Cada ejecución reemplaza el top
   completo, así que no se acumulan filas viejas.

   USO
   -------------------------------------------------------------
     cd scripts
     npm install
     node sync-tops.cjs

   La configuración va en scripts/.env (ver .env.example).
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/*  Carga de .env sin dependencias                                     */
/* ------------------------------------------------------------------ */
function cargarEnv(archivo) {
  if (!fs.existsSync(archivo)) return;
  const texto = fs.readFileSync(archivo, 'utf8');
  texto.split(/\r?\n/).forEach(function (linea) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) return;
    const igual = limpia.indexOf('=');
    if (igual < 1) return;
    const clave = limpia.slice(0, igual).trim();
    let valor = limpia.slice(igual + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (process.env[clave] === undefined) process.env[clave] = valor;
  });
}

cargarEnv(path.join(__dirname, '.env'));

/* ------------------------------------------------------------------ */
/*  Configuración                                                      */
/* ------------------------------------------------------------------ */
const config = {
  db: {
    host: process.env.BKTOPS_DB_HOST || '127.0.0.1',
    port: Number(process.env.BKTOPS_DB_PORT || 3306),
    user: process.env.BKTOPS_DB_USER || '',
    password: process.env.BKTOPS_DB_PASSWORD || '',
    database: process.env.BKTOPS_DB_NAME || 'bktops',
  },
  supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  limite: Math.max(1, Math.min(100, Number(process.env.TOPS_LIMIT || 10))),
  tops: String(process.env.TOPS || 'kills,money,time_played')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean),
  dryRun: String(process.env.DRY_RUN || '').toLowerCase() === 'true',
};

function error(mensaje) {
  console.error('[tops] ' + mensaje);
  process.exit(1);
}

if (!config.db.user) error('Falta BKTOPS_DB_USER en scripts/.env');
if (!config.supabaseUrl) error('Falta SUPABASE_URL en scripts/.env');
if (!config.serviceKey) error('Falta SUPABASE_SERVICE_ROLE_KEY en scripts/.env');
if (!config.tops.length) error('La variable TOPS no contiene ningún id');

let mysql;
try {
  mysql = require('mysql2/promise');
} catch (err) {
  error('Falta el paquete mysql2. Ejecuta "npm install" dentro de scripts/.');
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
/* Mismo saneado que usa BK-Tops para nombrar sus tablas. */
function tablaDe(topId) {
  return 'top_' + String(topId)
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/ /g, '_')
    .replace(/\./g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

async function peticionSupabase(ruta, opciones) {
  const opcionesFinales = Object.assign({}, opciones);
  opcionesFinales.headers = Object.assign({
    apikey: config.serviceKey,
    Authorization: 'Bearer ' + config.serviceKey,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }, (opciones && opciones.headers) || {});

  const res = await fetch(config.supabaseUrl + '/rest/v1/' + ruta, opcionesFinales);
  if (!res.ok) {
    const cuerpo = await res.text().catch(function () { return ''; });
    throw new Error('Supabase respondió ' + res.status + ': ' + cuerpo.slice(0, 300));
  }
}

/* ------------------------------------------------------------------ */
/*  Sincronización                                                     */
/* ------------------------------------------------------------------ */
async function main() {
  console.log('[tops] Conectando a MySQL ' + config.db.host + ':' + config.db.port + '/' + config.db.database);
  const conexion = await mysql.createConnection(config.db);

  try {
    for (const topId of config.tops) {
      const tabla = tablaDe(topId);

      let filas;
      try {
        const resultado = await conexion.query(
          'SELECT identifier, display_name, top_value FROM `' + tabla + '` ' +
          'ORDER BY top_value DESC, last_updated ASC, identifier ASC LIMIT ?',
          [config.limite]
        );
        filas = resultado[0] || [];
      } catch (err) {
        console.warn('[tops] ' + topId + ': no se pudo leer ' + tabla + ' (' + err.code + '). ¿Existe ese top en BK-Tops?');
        continue;
      }

      const ahora = new Date().toISOString();
      const registros = filas.map(function (fila, indice) {
        return {
          top_id: topId,
          position: indice + 1,
          player_name: String(fila.display_name || 'Desconocido'),
          player_uuid: fila.identifier ? String(fila.identifier) : null,
          value: Number(fila.top_value) || 0,
          updated_at: ahora,
        };
      });

      if (config.dryRun) {
        console.log('[tops] ' + topId + ': ' + registros.length + ' entradas (dry-run, no se escribe nada)');
        registros.slice(0, 3).forEach(function (r) {
          console.log('        #' + r.position + ' ' + r.player_name + ' = ' + r.value);
        });
        continue;
      }

      /* Primero se borra el top anterior y después se inserta el nuevo.
         Si el top quedó vacío, basta con el borrado. */
      await peticionSupabase('server_tops?top_id=eq.' + encodeURIComponent(topId), { method: 'DELETE' });

      if (registros.length) {
        await peticionSupabase('server_tops', {
          method: 'POST',
          body: JSON.stringify(registros),
        });
      }

      console.log('[tops] ' + topId + ': ' + registros.length + ' entradas sincronizadas');
    }
  } finally {
    await conexion.end();
  }
}

main().catch(function (err) {
  console.error('[tops] Error: ' + (err && err.message ? err.message : err));
  process.exit(1);
});
