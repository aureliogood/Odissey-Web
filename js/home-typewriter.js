(function () {
  'use strict';

  function startTypewriter() {
    var heading = document.querySelector('[data-typewriter]');
    if (!heading) return;

    var lines = Array.from(heading.querySelectorAll('.hero-typewriter__line'));
    var reducedMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !lines.length) return;

    var phrases = lines.map(function (line) {
      return Array.from(line.textContent.trim());
    });

    heading.classList.add('is-typing');
    lines.forEach(function (line) { line.textContent = ''; });

    var lineIndex = 0;
    var characterIndex = 0;

    function typeNext() {
      var line = lines[lineIndex];
      line.classList.add('is-active');

      if (characterIndex < phrases[lineIndex].length) {
        line.textContent += phrases[lineIndex][characterIndex];
        characterIndex += 1;
        window.setTimeout(typeNext, 54);
        return;
      }

      line.classList.remove('is-active');
      lineIndex += 1;
      characterIndex = 0;
      if (lineIndex >= lines.length) {
        heading.classList.remove('is-typing');
        return;
      }
      window.setTimeout(typeNext, 140);
    }

    window.setTimeout(typeNext, 220);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTypewriter, { once: true });
  } else {
    startTypewriter();
  }
})();
