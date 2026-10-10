#!/usr/bin/env node
/* =============================================================
   EMPAQUETADO PARA EL HOST
   -------------------------------------------------------------
   Prepara un .zip con lo unico que hay que subir al servidor, sin
   los archivos de desarrollo. No toca los originales: copia a una
   carpeta temporal, quita lo que sobra y comprime.

   Uso:
     node package.js              -> crea web-publish.zip
     node package.js --portable   -> ademas deja la carpeta suelta
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = __dirname;
const SALIDA = path.join(RAIZ, 'web-publish.zip');
const ESCENARIO = path.join(RAIZ, '.publish-tmp');
const PORTABLE = process.argv.includes('--portable');

/* Archivos que NO deben subirse al host. Son de desarrollo o
   son paneles privados que ya bloquea el .htaccess.

   OJO CON ESTA LISTA: lo que no esta aqui, se sube. Si se anade un
   script de comprobacion y no se anade aqui, acabara publicado en
   el hosting. Si dudas, anadelo: antes sobran ficheros, faltan.

   Nota: probar-login.html y limpiar.html ya NO existen (se borraron
   porque eran paginas de diagnostico publicas que confirmaban si una
   cuenta era admin). Se dejan aqui por si alguien las recupera de
   una copia antigua: si vuelven a aparecer, no se suben. */
const EXCLUIDOS = [
  '.publish-tmp',
  'web-publish.zip',
  'dev-server.js',
  'probar-login.html',
  'limpiar.html',
  'package.js',
  'package.bat',
  'package.ps1',
  'ftexto.ps1',
  'formularios.ps1',
  'antispam-conectar.ps1',
  'i18n-completar.ps1',
  'seo-schema.ps1',
  '_comprobar-visible.cjs',
  'nginx.conf.example',
'odissey-security-headers.conf',
  'SEGURIDAD.md',
  'WAF.md',
  'SEO.md',
  /* Codigo del BOT. La verificacion del captcha va en el proyecto Node
     (odisseymc.site/bot), no en la web. Este archivo se queda aqui para
     poder consultarlo y pegar el modulo, pero NO se sube. */
  'bot-turnstile.js',
  '.gitignore',
  '.git',
  'node_modules',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini'
];

/* Extensiones que se descartan por ser de desarrollo. */
const EXTENSIONES_FUERA = ['.log', '.tmp', '.bak', '.old', '.map', '.ps1d'];

function fueraDePublicacion(nombre) {
  if (EXCLUIDOS.includes(nombre)) return true;
  if (EXTENSIONES_FUERA.some(ext => nombre.toLowerCase().endsWith(ext))) return true;
  /* Scripts de comprobacion: _medir-real.cjs, _contraste-real.cjs,
     _vars.cjs, _login2.cjs, _comprobar-visible.cjs. Miden el login y
     el contraste con un navegador real. No son parte de la web y no
     tienen que estar publicados en el hosting.

     OJO: revisarPublico() solo avisa, no quita. Si un fichero asi se
     cuela, llega al zip. Por eso el filtro va aqui, en copiar(), que
     es lo que decide de verdad. */
  if (/^_.*\.cjs$/i.test(nombre)) return true;
  return false;
}

function copiar(origen, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const entrada of fs.readdirSync(origen, { withFileTypes: true })) {
    if (fueraDePublicacion(entrada.name)) continue;
    const desde = path.join(origen, entrada.name);
    const hasta = path.join(destino, entrada.name);
    if (entrada.isDirectory()) copiar(desde, hasta);
    else fs.copyFileSync(desde, hasta);
  }
}

/* Aviso de lo que se ha dejado fuera, para que nadie lo busque
   luego en el hosting y se sorprenda. */
function informe(origen) {
  const fuera = fs.readdirSync(origen, { withFileTypes: true })
    .filter(e => e.isFile() && fueraDePublicacion(e.name))
    .map(e => e.name);
  if (fuera.length) {
    console.log('\nNo incluidos a proposito:');
    fuera.forEach(n => console.log('  - ' + n));
  }
}

/* Comprobacion de que en el paquete no se ha colado nada que no
   deba estar en un servidor publico. Esta lista es la ultima linea
   de defensa: si alguien anade un fichero con un secreto y olvida
   meterlo en EXCLUIDOS, esto lo para.

   OJO: .htaccess y .well-known/security.txt empiezan por punto pero
   SI deben subirse (son configuracion del servidor y un fichero
   estandar de seguridad). Por eso no se miran los nombres ocultos en
   general, sino los ficheros de verdad secretsos. */
const NUNCA_PUBLICO = [
  /\.ps1$/i,
  /\.example$/i,
  /\.md$/i,
  /* Scripts de comprobacion. Empiezan por guion bajo y no son parte de
     la web: miden el login, el contraste y las variables CSS. Subirlos
     no rompe nada, pero publica en el hosting las pruebas y deja a
     cualquiera ver como esta hecho. */
  /^_.*\.cjs$/i,
  /^\.env/i,
  /^\.git\//,
  /^\.git$/,
  /secrets?/i,
  /credencial/i,
  /apikey/i,
  /^\.ssh/i,
  /^\.aws/i,
  /package\.js$/i,
  /dev-server\.js$/i,
  /* Codigo del BOT. Va en el proyecto Node, no en la web. Subirlo
     publica la logica de verificacion del captcha. */
  /bot-turnstile\.js$/i,
];

const PERMITIDOS_AUN_EMPEZANDO_PUNTO = ['.htaccess', 'security.txt'];

function revisarPublico(carpeta) {
  const malos = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(ruta); continue; }
      const relativo = path.relative(carpeta, ruta);
      // Los ficheros que si deben ir y empiezan por punto.
      if (PERMITIDOS_AUN_EMPEZANDO_PUNTO.some(p => relativo === p)) continue;
      if (NUNCA_PUBLICO.some(re => re.test(e.name) || re.test(relativo))) malos.push(relativo);
    }
  })(carpeta);

if (malos.length) {
    console.error('\nERROR: hay ficheros que no deberian subirse al hosting:');
    malos.forEach(m => console.error('  - ' + m));
    console.error('\nAnadelos a la lista EXCLUIDOS de package.js y vuelve a ejecutar.');
    /* Si esto falla, el web-publish.zip que hay en disco es el del
       empaquetado ANTERIOR, no el de ahora. Sin este aviso, el zip viejo
       se queda ahi con fecha de seemingly reciente y alguien lo sube
       creyendo que es el actual. Pasó de verdad: se añadieron
       js/turnstile.js y css/turnstile.css, el empaquetado empezó a
       fallar, y el zip se produjo sin ellos. */
    if (fs.existsSync(SALIDA)) {
      const cuando = fs.statSync(SALIDA).mtime.toLocaleString('es-ES');
      console.error('\nAVISO: ' + path.basename(SALIDA) + ' sigue siendo el del empaquetado');
      console.error('       anterior (creado ' + cuando + '). NO lo subas: no incluye');
      console.error('       los cambios de ahora.');
    }
    process.exit(1);
  }
  console.log('  revisado: ningun fichero prohibido en el paquete');
}

function comprimir(carpeta, zip) {
  if (fs.existsSync(zip)) fs.unlinkSync(zip);
  /* -r recursivo, -q solo lo que importa. El zip guarda las rutas
     relativas a la carpeta padre, que es lo que espera el hosting. */
  execFileSync('powershell', [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${carpeta}\\*' -DestinationPath '${zip}' -Force`
  ], { stdio: 'inherit' });
}

function tamano(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

console.log('Empaquetando para el host...');
console.log('  origen: ' + RAIZ);

if (fs.existsSync(ESCENARIO)) fs.rmSync(ESCENARIO, { recursive: true, force: true });
copiar(RAIZ, ESCENARIO);
informe(RAIZ);

/* Antes de comprimir: que no se cuele nada prohibido. */
revisarPublico(ESCENARIO);

comprimir(ESCENARIO, SALIDA);
console.log('\n  ' + path.basename(SALIDA) + '  ' + tamano(fs.statSync(SALIDA).size));

if (PORTABLE) {
  console.log('  carpeta suelta: .publish-tmp/');
} else {
  fs.rmSync(ESCENARIO, { recursive: true, force: true });
}

/* Recordatorio de los pasos que no se pueden automatizar. */
console.log('\nPara subirlo:');
console.log('  1. Abre el hosting y sube el CONTENIDO del zip en la carpeta');
console.log('     publica (htdocs / public_html / www), no el zip entero.');
console.log('  2. El .htaccess va dentro: sin el, las rutas limpias');
console.log('     (/tienda, /staff...) no funcionaran.');
console.log('  3. La API del bot (odisseymc.site/bot) tiene que estar');
console.log('     levantada, si no el estado del servidor sale a 0.');