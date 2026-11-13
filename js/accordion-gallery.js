(() => {
  'use strict';

  document.querySelectorAll('[data-accordion-gallery]').forEach((gallery) => {
    const panels = Array.from(gallery.querySelectorAll('.od-accordion-gallery__panel'));
    if (!panels.length) return;

    const activate = (selected) => {
      panels.forEach((panel) => {
        const active = panel === selected;
        panel.classList.toggle('is-active', active);
        panel.setAttribute('aria-expanded', String(active));
      });
    };

    panels.forEach((panel) => {
      panel.addEventListener('mouseenter', () => activate(panel));
      panel.addEventListener('focus', () => activate(panel));
      panel.addEventListener('click', () => activate(panel));
      panel.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        const rect = panel.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        panel.style.setProperty('--gallery-shift-x', `${(-x * 14).toFixed(1)}px`);
        panel.style.setProperty('--gallery-shift-y', `${(-y * 10).toFixed(1)}px`);
      });
      panel.addEventListener('pointerleave', () => {
        panel.style.removeProperty('--gallery-shift-x');
        panel.style.removeProperty('--gallery-shift-y');
      });
    });

    gallery.addEventListener('pointerleave', () => {
      if (!gallery.contains(document.activeElement)) activate(panels[0]);
    });
  });
})();
