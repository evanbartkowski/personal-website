import * as THREE from 'three';

// An original, self-contained gyroscopic reactor. Nothing in this scene is a
// downloaded model or a texture request; even the glow is generated locally.
export function mountReactor(container, { onStatus } = {}) {
  if (!container) return { setPaused() {}, setMode() {}, dispose() {} };

  const fallback = () => {
    container.innerHTML = `<svg viewBox="0 0 640 600" width="100%" height="100%" role="img" aria-label="An illustrated atomic reactor with luminous green orbital rings">
      <defs>
        <radialGradient id="reactor-aura"><stop stop-color="#a8ff60" stop-opacity=".19"/><stop offset="1" stop-color="#a8ff60" stop-opacity="0"/></radialGradient>
        <radialGradient id="reactor-core"><stop stop-color="#e1ffad"/><stop offset=".25" stop-color="#91db50"/><stop offset=".8" stop-color="#183721"/><stop offset="1" stop-color="#0d1c12"/></radialGradient>
        <linearGradient id="reactor-metal" x2="1" y2="1"><stop stop-color="#eeeacb"/><stop offset=".45" stop-color="#a19669"/><stop offset="1" stop-color="#3b4129"/></linearGradient>
      </defs>
      <circle cx="320" cy="285" r="270" fill="url(#reactor-aura)"/>
      <g fill="none" stroke="#6d8557" stroke-opacity=".22"><circle cx="320" cy="285" r="242" stroke-dasharray="2 8"/><path d="M50 285h540M320 15v540"/><circle cx="320" cy="285" r="216"/></g>
      <g transform="translate(320 285) rotate(-27)">
        <ellipse rx="202" ry="164" fill="none" stroke="#172618" stroke-width="29"/>
        <ellipse rx="202" ry="164" fill="none" stroke="url(#reactor-metal)" stroke-width="17" stroke-dasharray="130 24 70 24"/>
        <ellipse rx="202" ry="164" fill="none" stroke="#b5ef7b" stroke-width="2"/>
        <ellipse rx="84" ry="209" fill="none" stroke="#9caa79" stroke-width="8" transform="rotate(25)"/>
        <ellipse rx="84" ry="209" fill="none" stroke="#b5ef7b" stroke-width="2" transform="rotate(25)"/>
        <circle r="91" fill="url(#reactor-core)" stroke="#b5ef7b" stroke-width="1.5"/>
        <g fill="none" stroke="#b4fb7a" stroke-opacity=".55"><ellipse rx="48" ry="91"/><ellipse rx="77" ry="91"/><ellipse rx="91" ry="32"/><ellipse rx="91" ry="66"/><path d="M-91 0H91M0-91V91"/></g>
        <ellipse rx="211" ry="59" fill="none" stroke="#c8c69f" stroke-width="6" transform="rotate(-28)"/>
        <circle cx="186" cy="-69" r="12" fill="#d8d4ac"/><circle cx="-141" cy="-117" r="9" fill="#bdff7d"/>
      </g>
      <g fill="#a6bd8d" font-family="monospace" font-size="9" letter-spacing="2"><text x="55" y="542">CORE / 001</text><text x="445" y="542">PASSIVE DISPLAY</text></g>
    </svg>`;
    onStatus?.('fallback');
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    fallback();
    return { setPaused() {}, setMode() {}, dispose() { container.replaceChildren(); } };
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab';
  canvas.setAttribute('aria-hidden', 'true');
  container.replaceChildren(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.3, 10.8);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xb6cf99, 0.8));
  const key = new THREE.DirectionalLight(0xf0f5d4, 4.5);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8dff64, 4.5);
  rim.position.set(3, 1, -3);
  scene.add(rim);
  const warm = new THREE.DirectionalLight(0xcaa36a, 2.4);
  warm.position.set(4, -2, 4);
  scene.add(warm);
  const internalLight = new THREE.PointLight(0xb3ff69, 8, 5, 2);
  scene.add(internalLight);

  const body = new THREE.Group();
  scene.add(body);
  const hardware = [];
  const metal = new THREE.MeshStandardMaterial({ color: 0x696e4c, metalness: 0.88, roughness: 0.33 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xa8a07a, metalness: 0.78, roughness: 0.26 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xcecfad, metalness: 0.52, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15221a, metalness: 0.85, roughness: 0.38 });
  const green = new THREE.MeshStandardMaterial({ color: 0x9cdf62, emissive: 0x83d74d, emissiveIntensity: 2.5, metalness: 0.2, roughness: 0.3 });
  const fineGreen = new THREE.LineBasicMaterial({ color: 0xb7ff77, transparent: true, opacity: 0.66 });
  const dimGreen = new THREE.LineBasicMaterial({ color: 0x88aa68, transparent: true, opacity: 0.2 });

  const mesh = (geometry, material, parent = body, isHardware = true) => {
    const object = new THREE.Mesh(geometry, material);
    parent.add(object);
    if (isHardware) hardware.push(object);
    return object;
  };
  const torus = (radius, thickness, material, parent, arc = Math.PI * 2) =>
    mesh(new THREE.TorusGeometry(radius, thickness, 10, Math.max(28, Math.round(100 * arc / (Math.PI * 2))), arc), material, parent);

  // The equatorial ring is deliberately substantial: ceramic covers, a dark
  // mechanical chassis, copper edge rails, and individually modelled bolts.
  const outer = new THREE.Group();
  outer.rotation.set(0.34, -0.34, 0.42);
  body.add(outer);
  torus(1.91, 0.125, dark, outer);
  torus(2.025, 0.026, brass, outer);
  torus(1.795, 0.028, metal, outer);
  const rearRail = torus(1.91, 0.03, green, outer);
  rearRail.position.z = -0.105;
  const boltGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6);
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6;
    const cover = torus(1.91, 0.143, index % 3 === 0 ? brass : ivory, outer, 0.38);
    cover.rotation.z = angle + 0.06;
    for (const offset of [0.1, 0.39]) {
      const a = angle + offset;
      const bolt = mesh(boltGeometry, dark, outer);
      bolt.position.set(Math.cos(a) * 1.91, Math.sin(a) * 1.91, 0.148);
      bolt.rotation.x = Math.PI / 2;
    }
    const lug = mesh(new THREE.BoxGeometry(0.14, 0.25, 0.18), dark, outer);
    lug.position.set(Math.cos(angle) * 2.02, Math.sin(angle) * 2.02, 0);
    lug.rotation.z = angle + Math.PI / 2;
    const lamp = mesh(new THREE.BoxGeometry(0.042, 0.085, 0.022), green, lug, false);
    lamp.position.z = 0.102;
  }

  const orbitA = new THREE.Group();
  orbitA.rotation.set(1.1, 0.4, -0.5);
  body.add(orbitA);
  torus(1.66, 0.051, brass, orbitA);
  const orbitLightA = torus(1.66, 0.012, green, orbitA);
  orbitLightA.position.z = 0.047;
  const orbitB = new THREE.Group();
  orbitB.rotation.set(-0.92, -0.68, 0.5);
  body.add(orbitB);
  torus(1.53, 0.042, ivory, orbitB);
  torus(1.59, 0.011, metal, orbitB);

  for (const [parent, radius] of [[orbitA, 1.66], [orbitB, 1.53]]) {
    for (let index = 0; index < 3; index++) {
      const angle = index * Math.PI * 2 / 3;
      const node = mesh(new THREE.SphereGeometry(0.095, 16, 12), ivory, parent);
      node.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      const nodeLight = mesh(new THREE.SphereGeometry(0.033, 10, 8), green, node, false);
      nodeLight.position.z = 0.085;
    }
  }

  const globe = new THREE.Group();
  body.add(globe);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x295c28, metalness: 0.12, roughness: 0.22, transparent: true, opacity: 0.37, depthWrite: false, side: THREE.FrontSide, clearcoat: 1 });
  mesh(new THREE.SphereGeometry(0.96, 40, 28), glass, globe, false);
  const core = mesh(new THREE.IcosahedronGeometry(0.57, 0), new THREE.MeshStandardMaterial({ color: 0xd4ff9c, emissive: 0x99f351, emissiveIntensity: 2.2, metalness: 0.15, roughness: 0.25, flatShading: true }), globe, false);
  const coreCage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.73, 1)), fineGreen);
  globe.add(coreCage);

  const loop = (points, material, parent) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(geometry, material);
    parent.add(line);
    return line;
  };
  for (let longitude = 0; longitude < 12; longitude++) {
    const angle = longitude * Math.PI / 12;
    loop(Array.from({ length: 100 }, (_, index) => {
      const a = index * Math.PI * 2 / 100;
      return new THREE.Vector3(Math.cos(a) * Math.cos(angle) * 0.98, Math.sin(a) * 0.98, Math.cos(a) * Math.sin(angle) * 0.98);
    }), fineGreen, globe);
  }
  for (let latitude = -3; latitude <= 3; latitude++) {
    const y = latitude * 0.235;
    const radius = Math.sqrt(0.98 ** 2 - y ** 2);
    loop(Array.from({ length: 100 }, (_, index) => {
      const a = index * Math.PI * 2 / 100;
      return new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
    }), fineGreen, globe);
  }

  // Subtle drafting circles behind the object tie the physical model to its
  // instrument-panel setting without drawing over the rest of the website.
  const drafting = new THREE.Group();
  drafting.position.z = -1.65;
  scene.add(drafting);
  for (const radius of [2.38, 2.48, 2.8]) {
    loop(Array.from({ length: 160 }, (_, index) => {
      const a = index / 160 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }), dimGreen, drafting);
  }
  const ticks = [];
  for (let index = 0; index < 100; index++) {
    const a = index * Math.PI * 2 / 100;
    const r = index % 5 === 0 ? 2.62 : 2.54;
    ticks.push(new THREE.Vector3(Math.cos(a) * 2.49, Math.sin(a) * 2.49, 0), new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  drafting.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), dimGreen));

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = textureCanvas.height = 128;
  const textureContext = textureCanvas.getContext('2d');
  if (textureContext) {
    const gradient = textureContext.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(178,255,112,0.5)');
    gradient.addColorStop(0.17, 'rgba(148,255,90,0.15)');
    gradient.addColorStop(0.5, 'rgba(117,239,69,0.05)');
    gradient.addColorStop(1, 'rgba(117,239,69,0)');
    textureContext.fillStyle = gradient;
    textureContext.fillRect(0, 0, 128, 128);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(textureCanvas), transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(5.8, 5.8, 1);
    glow.position.z = -0.4;
    scene.add(glow);
  }

  const particlePositions = new Float32Array(155 * 3);
  let seed = 41;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let index = 0; index < particlePositions.length; index += 3) {
    particlePositions[index] = (random() - 0.5) * 8;
    particlePositions[index + 1] = (random() - 0.5) * 6.4;
    particlePositions[index + 2] = (random() - 0.5) * 4 - 1;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0xc1dd95, size: 0.018, transparent: true, opacity: 0.49, sizeAttenuation: true, depthWrite: false }));
  scene.add(particles);

  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let inView = true;
  let disposed = false;
  let lost = false;
  let animation = 0;
  let lastTime = 0;
  let elapsed = 0;
  let mode = 'orbit';
  let drag = null;
  let dragX = 0;
  let dragY = 0;

  function schedule() {
    if (!disposed && !lost && !animation) animation = requestAnimationFrame(frame);
  }
  function frame(time) {
    animation = 0;
    if (disposed || lost) return;
    const active = !paused && inView && !document.hidden;
    const delta = active && lastTime ? Math.min((time - lastTime) / 1000, 0.045) : 0;
    lastTime = active ? time : 0;
    elapsed += delta;
    body.rotation.set(-0.13 + dragY, elapsed * 0.07 + dragX, -0.08);
    body.position.y = Math.sin(elapsed * 0.65) * 0.075;
    orbitA.rotation.z = -0.5 + elapsed * 0.12;
    orbitB.rotation.z = 0.5 - elapsed * 0.09;
    globe.rotation.y = elapsed * 0.09;
    core.rotation.set(elapsed * 0.13, elapsed * -0.12, elapsed * 0.05);
    coreCage.rotation.y = elapsed * -0.1;
    particles.rotation.z = elapsed * 0.009;
    renderer.render(scene, camera);
    if (active) schedule();
  }

  const resize = () => {
    if (disposed || lost) return;
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Mobile's narrow viewing window needs a little more breathing room.
    camera.position.z = width / height < 0.8 ? 12.2 : 10.8;
    camera.updateProjectionMatrix();
    schedule();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; lastTime = 0; schedule(); }, { rootMargin: '80px' });
  intersectionObserver.observe(container);
  const visibility = () => { lastTime = 0; schedule(); };
  document.addEventListener('visibilitychange', visibility);

  const pointerDown = event => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, startX: dragX, startY: dragY };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const pointerMove = event => {
    if (!drag) return;
    dragX = drag.startX + (event.clientX - drag.x) * 0.007;
    dragY = Math.max(-0.8, Math.min(0.8, drag.startY + (event.clientY - drag.y) * 0.005));
    schedule();
  };
  const pointerUp = () => { drag = null; canvas.style.cursor = 'grab'; };
  const contextLost = event => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(animation);
    animation = 0;
    fallback();
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('lostpointercapture', pointerUp);
  canvas.addEventListener('webglcontextlost', contextLost);
  resize();
  schedule();
  onStatus?.(paused ? 'paused' : 'online');

  return {
    setPaused(value) {
      paused = Boolean(value);
      lastTime = 0;
      schedule();
      if (!lost) onStatus?.(paused ? 'paused' : 'online');
    },
    setMode(value) {
      mode = value === 'schematic' ? 'schematic' : 'orbit';
      for (const object of hardware) object.material.wireframe = mode === 'schematic';
      glass.opacity = mode === 'schematic' ? 0.1 : 0.37;
      fineGreen.opacity = mode === 'schematic' ? 0.95 : 0.66;
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animation);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('lostpointercapture', pointerUp);
      canvas.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set();
      const materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) { material.map?.dispose(); material.dispose(); }
      renderer.dispose();
      container.replaceChildren();
    }
  };
}
