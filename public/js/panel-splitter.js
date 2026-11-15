(() => {
  const panel = document.getElementById('right-panel');
  const top = document.getElementById('crop-recommendations');
  const handle = document.getElementById('right-panel-splitter');
  if (!panel || !top || !handle) return;
  let ratio = 40;
  function apply(value) {
    ratio = Math.max(15, Math.min(80, value));
    top.style.height = `${panel.clientHeight * ratio / 100}px`;
    handle.setAttribute('aria-valuenow', String(Math.round(ratio)));
  }
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    top.open = true;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    apply((event.clientY - top.getBoundingClientRect().top) / panel.clientHeight * 100);
  });
  const release = event => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);
  handle.addEventListener('keydown', event => {
    if (!['ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault(); top.open = true;
    apply(ratio + (event.key === 'ArrowUp' ? -5 : 5));
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => apply(ratio)).observe(panel);
  apply(ratio);
})();
