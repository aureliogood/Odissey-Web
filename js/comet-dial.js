(() => {
    const dial = document.getElementById('benchmarkDial');
    if (!dial) return;

    const svg = dial.querySelector('svg');
    const arc = document.getElementById('benchmarkDialArc');
    const comet = document.getElementById('benchmarkDialComet');
    const ticks = document.getElementById('benchmarkDialTicks');
    const readout = document.getElementById('benchmarkDialPlayers');
    const min = 2;
    const max = 100;
    const startAngle = 135;
    const sweepAngle = 270;
    const radius = 88;

    if (!svg || !arc || !comet || !ticks || !readout) return;

    const ns = 'http://www.w3.org/2000/svg';
    for (let index = 0; index <= 48; index += 1) {
        const angle = (startAngle + (sweepAngle * index) / 48) * Math.PI / 180;
        const major = index % 4 === 0;
        const innerRadius = major ? 101 : 104;
        const outerRadius = 111;
        const tick = document.createElementNS(ns, 'line');
        tick.setAttribute('x1', String(120 + Math.cos(angle) * innerRadius));
        tick.setAttribute('y1', String(120 + Math.sin(angle) * innerRadius));
        tick.setAttribute('x2', String(120 + Math.cos(angle) * outerRadius));
        tick.setAttribute('y2', String(120 + Math.sin(angle) * outerRadius));
        tick.setAttribute('class', major ? 'is-major' : '');
        ticks.appendChild(tick);
    }

    const setValue = (value) => {
        const number = Math.max(min, Math.min(max, Math.round(Number(value) || min)));
        const ratio = (number - min) / (max - min);
        const angle = (startAngle + sweepAngle * ratio) * Math.PI / 180;
        arc.style.strokeDasharray = `${ratio * 75} 100`;
        comet.setAttribute('cx', String(120 + Math.cos(angle) * radius));
        comet.setAttribute('cy', String(120 + Math.sin(angle) * radius));
        readout.textContent = String(number);
        dial.dataset.value = String(number);
        dial.setAttribute('aria-valuenow', String(number));
        dial.setAttribute('aria-valuetext', `${number} jugadores`);
    };

    const valueFromPointer = (event) => {
        const box = svg.getBoundingClientRect();
        const scale = 240 / box.width;
        const x = (event.clientX - box.left) * scale - 120;
        const y = (event.clientY - box.top) * scale - 120;
        let angle = Math.atan2(y, x) * 180 / Math.PI;

        // Skip the 90 degree opening at the bottom of the dial.
        if (angle > 45 && angle < 135) angle = x >= 0 ? 45 : 135;
        if (angle < 135) angle += 360;
        angle = Math.max(startAngle, Math.min(startAngle + sweepAngle, angle));
        return min + ((angle - startAngle) / sweepAngle) * (max - min);
    };

    const applyValue = (value) => {
        const number = Math.max(min, Math.min(max, Math.round(value)));
        if (typeof window.updateBenchmarkSimulation === 'function') {
            window.updateBenchmarkSimulation(number);
        } else {
            setValue(number);
        }
    };

    dial.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        dial.setPointerCapture(event.pointerId);
        applyValue(valueFromPointer(event));
    });
    dial.addEventListener('pointermove', (event) => {
        if (dial.hasPointerCapture(event.pointerId)) applyValue(valueFromPointer(event));
    });
    dial.addEventListener('keydown', (event) => {
        const current = Number(dial.dataset.value) || min;
        const changes = {
            ArrowRight: 1,
            ArrowUp: 1,
            ArrowLeft: -1,
            ArrowDown: -1,
            PageUp: 10,
            PageDown: -10
        };

        if (event.key === 'Home') {
            event.preventDefault();
            applyValue(min);
        } else if (event.key === 'End') {
            event.preventDefault();
            applyValue(max);
        } else if (Object.prototype.hasOwnProperty.call(changes, event.key)) {
            event.preventDefault();
            applyValue(current + changes[event.key]);
        }
    });

    window.odCometDial = { setValue };
    setValue(Number(dial.dataset.value) || min);
})();
