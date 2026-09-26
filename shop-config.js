// =============================================================
// CONFIGURACIÓN DE LA TIENDA
// -------------------------------------------------------------
// Centraliza los productos. Edita esta lista para cambiar la tienda.
// Cada producto:
//   id        : identificador único (sin espacios)
//   name      : nombre visible
//   price     : precio BASE en USD (se convierte según la moneda)
//   image     : ruta de la imagen del banner (null si no tiene)
//   category  : sección de la tienda (Rangos / Llaves)
//   icon      : emoji que se muestra en la tarjeta
//   badge     : texto de etiqueta opcional (null si no tiene)
// NOTA: el panel de admin puede sobrescribir estos datos desde
// el navegador (se guardan en localStorage).
// =============================================================
window.SHOP_PRODUCTS = [
    { id: 'dios-del-mar', name: 'Kit Dios Del Mar', price: 9.99, image: 'img/diosdelmar.webp', category: 'Rangos', icon: '🌊', badge: 'POPULAR' },
    { id: 'semidios', name: 'Kit SemiDios', price: 7.99, image: 'img/semidios.webp', category: 'Rangos', icon: '⚡', badge: null },
    { id: 'heroe', name: 'Kit Heroe', price: 5.99, image: 'img/heroe.webp', category: 'Rangos', icon: '🦸', badge: null },
    { id: 'capitan', name: 'Kit Capitan', price: 4.99, image: 'img/capitan.webp', category: 'Rangos', icon: '⚓', badge: null },
    { id: 'llave-infernal', name: 'Llave Infernal', price: 2.99, image: null, category: 'Llaves', icon: '🔥', badge: null },
];