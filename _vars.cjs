// Busca var(--algo) que no exista en ninguna hoja. Una variable mal
// escrita no da error: el navegador la descarta y deja la propiedad sin
// valor. Por eso el boton dorado desaparecio sin quejarse nadie.
var fs = require('fs'), path = require('path');
var RAIZ = process.cwd();

var hojas = [];
(function recorrer(dir, pre) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === 'node_modules' || e.name === '.git') return;
    var p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, pre);
    else if (e.name.endsWith('.css')) hojas.push(p);
  });
})(RAIZ, '');

var definidas = new Set();
hojas.forEach(function (h) {
  var c = fs.readFileSync(h, 'utf8');
  var re = /(--[a-zA-Z0-9_-]+)\s*:/g, m;
  while ((m = re.exec(c))) definidas.add(m[1]);
});
console.log('Hojas revisadas: ' + hojas.length);
console.log('Variables definidas: ' + definidas.size);

// Los nombres que vienen del tema claro tambien se declaran aparte.
var usas = new Map();
hojas.concat(fs.readdirSync(RAIZ).filter(function (f) { return f.endsWith('.js') || f.endsWith('.html'); })
  .map(function (f) { return path.join(RAIZ, f); })).forEach(function (h) {
  var c = fs.readFileSync(h, 'utf8');
  var re = /var\(\s*(--[a-zA-Z0-9_-]+)/g, m;
  while ((m = re.exec(c))) {
    var rel = path.relative(RAIZ, h);
    if (!usas.has(m[1])) usas.set(m[1], []);
    usas.get(m[1]).push(rel + ':' + (c.slice(0, m.index).split('\n').length));
  }
});

var malas = [];
usas.forEach(function (sitios, varName) {
  // Las que define el navegador o el sistema no estan en el CSS.
  if (/^--(webkit|moz|ms)-/.test(varName)) return;
  if (!definidas.has(varName)) malas.push({ v: varName, n: sitios.length, d: sitios.slice(0, 3) });
});

console.log('');
if (!malas.length) {
  console.log('Todas las variables var(--...) estan definidas en alguna hoja.');
} else {
  console.log('VARIABLES QUE NO EXISTEN (el navegador las ignora en silencio):');
  malas.forEach(function (m) {
    console.log('  ' + m.v + '   usada ' + m.n + ' veces, en ' + m.d.join(', '));
  });
}
process.exit(malas.length ? 1 : 0);