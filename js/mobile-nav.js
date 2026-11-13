(() => {
  const button = document.getElementById('mobileNavToggle');
  const links = document.getElementById('primaryNavLinks');
  if (!button || !links) return;

  const shell = button.closest('.hz-header, nav.nav-bar');
  if (!shell) return;

  const setOpen = (open) => {
    shell.classList.toggle('mobile-nav-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  };

  button.addEventListener('click', () => {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });

  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (button.getAttribute('aria-expanded') === 'true' && !shell.contains(event.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1000) setOpen(false);
  }, { passive: true });
})();
