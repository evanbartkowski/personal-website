// This small sky belongs to the dialog and stops completely when it closes.
export function mountTerminalVisuals(dialog) {
  if (!dialog) return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'terminal-sky';
  canvas.setAttribute('aria-hidden', 'true');
  dialog.prepend(canvas);
  const context = canvas.getContext('2d');
  if (!context) {canvas.remove(); return () => {};}
  const lifetime = new AbortController();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 1, height = 1, frame = 0, last = 0, elapsed = 0, painted = 0, disposed = false;
  let accent = '#639c47';
  const stars = Array.from({length: 65}, (_, i) => ({x: (Math.sin(i * 127.1 + 18) * 43758.5453) % 1, y: (Math.sin(i * 311.7 + 91) * 21942.51) % 1, radius: i % 9 === 0 ? 1 : .5, phase: i * 1.71}));
  const meteors = Array.from({length: 9}, (_, i) => ({phase: i * .83, speed: .11 + (i % 4) * .016, x: (i * .371) % 1, length: 38 + (i % 4) * 16}));
  const palette = () => {accent = getComputedStyle(dialog).getPropertyValue('--green').trim() || '#639c47';};
  function paint() {
    if (disposed || !dialog.open || document.hidden) return;
    context.clearRect(0, 0, width, height);
    for (const star of stars) {
      context.globalAlpha = .12 + (Math.sin(elapsed * .55 + star.phase) + 1) * .07;
      context.fillStyle = '#f5f1db';
      context.beginPath(); context.arc(Math.abs(star.x) * width, Math.abs(star.y) * height, star.radius, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    for (const meteor of meteors) {
      const phase = ((elapsed * meteor.speed + meteor.phase) % 1.5) / 1.5;
      const x = width * (1.15 - phase * 1.4) + (meteor.x - .5) * width * .5;
      const y = height * (-.2 + phase * 1.5);
      const trail = meteor.length;
      const gradient = context.createLinearGradient(x, y, x + trail, y - trail * .65);
      gradient.addColorStop(0, 'rgba(255,247,225,.95)');
      gradient.addColorStop(.16, accent);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.globalAlpha = .5 + Math.sin(phase * Math.PI) * .22;
      context.strokeStyle = gradient;
      context.lineWidth = meteor.length > 80 ? 1.15 : .75;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x + trail, y - trail * .65); context.stroke();
      context.fillStyle = '#fff4d6';
      context.shadowColor = accent; context.shadowBlur = 6;
      context.beginPath(); context.arc(x, y, .95, 0, Math.PI * 2); context.fill();
      context.shadowBlur = 0;
    }
    context.globalAlpha = 1;
    dialog.dataset.terminalSkyFrames = String(++painted);
  }
  function stop() {cancelAnimationFrame(frame); frame = 0; last = 0;}
  function animate(now) {
    frame = 0;
    if (disposed || !dialog.open || document.hidden || motion.matches) return;
    if (!last || now - last >= 32) {
      elapsed += last ? Math.min((now - last) / 1000, .08) : 0;
      last = now; paint();
    }
    frame = requestAnimationFrame(animate);
  }
  function sync() {
    stop();
    if (disposed) return;
    dialog.dataset.terminalSkyState = !dialog.open || document.hidden ? 'paused' : motion.matches ? 'still' : 'running';
    if (dialog.open && !document.hidden) {palette(); paint(); if (!motion.matches) frame = requestAnimationFrame(animate);}
  }
  function resize() {
    if (disposed || !dialog.open || document.hidden) return;
    width = Math.max(1, dialog.clientWidth); height = Math.max(1, dialog.clientHeight);
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(dialog);
  const openObserver = new MutationObserver(() => {if (dialog.open) resize(); sync();});
  openObserver.observe(dialog, {attributes: true, attributeFilter: ['open']});
  document.addEventListener('visibilitychange', sync, {signal: lifetime.signal});
  document.addEventListener('portfolio:settingschange', () => {palette(); paint();}, {signal: lifetime.signal});
  motion.addEventListener('change', sync, {signal: lifetime.signal});
  dialog.addEventListener('close', sync, {signal: lifetime.signal});
  sync();
  return () => {
    disposed = true; stop(); lifetime.abort(); resizeObserver.disconnect(); openObserver.disconnect();
    dialog.dataset.terminalSkyState = 'disposed'; canvas.remove();
  };
}
