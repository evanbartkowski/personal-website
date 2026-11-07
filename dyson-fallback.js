let illustrationId = 0;

// Independent of Three.js and WebGL: project and sort the geometry once.
// An unavailable GPU never starts an animation loop or hides the machine.
export function mountDysonFallback(container) {
  if (!container) return;
  const id = `dyson-${++illustrationId}`;
  const tau = Math.PI * 2;
  const faces = [];
  const counts = { collectorPanels: 0, hullInlays: 0 };
  let currentBand = 0;
  const rings = [
    { radius: 1.66, rotation: [1.18, -.22, -.17], width: .28, depth: .1 },
    { radius: 1.8, rotation: [.28, .94, .22], width: .3, depth: .1 },
    { radius: 1.94, rotation: [.9, .35, .86], width: .3, depth: .11 },
    { radius: 2.09, rotation: [-.5, -.63, -.48], width: .32, depth: .11 },
    { radius: 2.23, rotation: [.35, -.4, .8], width: .34, depth: .12 },
  ];
  const rotate = (point, [rx, ry, rz]) => {
    let { x, y, z } = point;
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
    return { x, y, z };
  };
  const pointOnRing = (ring, angle, radius, axial) => rotate(rotate({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: axial }, ring.rotation), [.1, -.1, -.13]);
  const project = point => {
    const perspective = 9.5 / (9.5 - point.z);
    return { x: 320 + point.x * 100 * perspective, y: 302 - (point.y - point.z * .023) * 100 * perspective };
  };
  const normalOf = points => {
    const a = { x: points[1].x - points[0].x, y: points[1].y - points[0].y, z: points[1].z - points[0].z };
    const b = { x: points[2].x - points[0].x, y: points[2].y - points[0].y, z: points[2].z - points[0].z };
    const n = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
    const length = Math.hypot(n.x, n.y, n.z) || 1;
    return { x: n.x / length, y: n.y / length, z: n.z / length };
  };
  const centerOf = points => points.reduce((center, p) => ({ x: center.x + p.x / points.length, y: center.y + p.y / points.length, z: center.z + p.z / points.length }), { x: 0, y: 0, z: 0 });
  const color = values => `rgb(${values.map(value => Math.max(0, Math.min(255, Math.round(value)))).join(',')})`;
  const shade = (base, normal, center, warmth = 1) => {
    const length = Math.hypot(center.x, center.y, center.z) || 1;
    const sun = Math.max(0, -(normal.x * center.x + normal.y * center.y + normal.z * center.z) / length);
    const sky = Math.max(0, normal.x * -.3 + normal.y * .4 + normal.z * .7);
    return color(base.map((value, index) => value + [26, 18, 7][index] * sun * warmth + [4, 7, 12][index] * sky));
  };
  const polygon = (points, base, { panel = false, rim = false, offset = 0, inlay = false, circuit = false } = {}) => {
    const normal = normalOf(points);
    if (normal.z < -.025) return;
    const center = centerOf(points);
    const coords = points.map(p => { const q = project(p); return `${q.x.toFixed(2)},${q.y.toFixed(2)}`; }).join(' ');
    const fill = shade(base, normal, center, panel ? .38 : 1);
    const edge = circuit ? '#98deee' : panel ? '#9cdae0' : inlay ? '#436575' : rim ? shade([66, 56, 39], normal, center, 1.3) : '#17232d';
    const panelId = panel ? ` data-collector-panel="${++counts.collectorPanels}"` : '';
    const inlayId = inlay ? ` data-hull-inlay="${++counts.hullInlays}"` : '';
    faces.push({ depth: center.z + offset, svg: `<polygon data-orbital-band="${currentBand}"${panelId}${inlayId} points="${coords}" fill="${fill}" stroke="${edge}" stroke-width="${panel ? '.23' : circuit ? '.32' : rim ? '.36' : '.21'}"${panel ? ' stroke-opacity=".32"' : ''} stroke-linejoin="round"/>` });
  };
  const surface = (ring, a, b, radius, low, high, inner, base, options) => {
    const points = [pointOnRing(ring, a, radius, low), pointOnRing(ring, a, radius, high), pointOnRing(ring, b, radius, high), pointOnRing(ring, b, radius, low)];
    polygon(inner ? points : points.reverse(), base, options);
  };
  const random = seed => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

  rings.forEach((ring, ringIndex) => {
    currentBand = ringIndex;
    const inner = ring.radius - ring.depth / 2;
    const outer = ring.radius + ring.depth / 2;
    const half = ring.width / 2;
    for (let i = 0; i < 112; i++) {
      const a = i / 112 * tau;
      const b = (i + 1) / 112 * tau;
      surface(ring, a, b, outer, -half, half, false, [17 + i % 3, 25 + i % 3, 33 + i % 3]);
      surface(ring, a, b, inner, -half, half, true, [25, 29, 31]);
      for (const edge of [-1, 1]) {
        const p = [pointOnRing(ring, a, inner, half * edge), pointOnRing(ring, a, outer, half * edge), pointOnRing(ring, b, outer, half * edge), pointOnRing(ring, b, inner, half * edge)];
        polygon(edge > 0 ? p : p.reverse(), [37, 31, 23], { rim: true });
      }
    }

    // Recessed blue collectors sit on the inner walls of substantial dark bands.
    for (let i = 0; i < 72; i++) {
      const a = (i + .12) / 72 * tau;
      const b = (i + .88) / 72 * tau;
      for (let row = 0; row < 2; row++) {
        const low = -half + .035 + row * (ring.width - .07) / 2;
        const high = low + (ring.width - .07) / 2 - .013;
        const tone = random(i + ringIndex * 78 + row * 19);
        surface(ring, a, b, inner - .002, low, high, true, tone > .83 ? [75, 111, 115] : tone > .4 ? [28, 66, 77] : [17, 43, 54], { panel: true, offset: .001 });
      }
      // Flat blue-steel side inlays and narrow circuits add surface detail
      // without extending beyond either edge of the clean orbital band.
      for (const edge of [-1, 1]) {
        const z = edge * half;
        const inlay = [pointOnRing(ring,a,inner+.014,z),pointOnRing(ring,a,outer-.014,z),pointOnRing(ring,b,outer-.014,z),pointOnRing(ring,b,inner+.014,z)];
        polygon(edge > 0 ? inlay : inlay.reverse(), [24 + i % 4 * 3,43 + i % 5 * 2,55 + i % 4 * 3], {inlay:true, offset:.001});
        if ((i + ringIndex * 5) % 36 < 9) {
          const circuit = [pointOnRing(ring,a,ring.radius-.003,z),pointOnRing(ring,a,ring.radius+.003,z),pointOnRing(ring,b,ring.radius+.003,z),pointOnRing(ring,b,ring.radius-.003,z)];
          polygon(edge > 0 ? circuit : circuit.reverse(), [88,167,192], {circuit:true, offset:.002});
        }
      }
    }
  });

  const wisps = [{ angle: 17, height: 9, opacity: .44 }, { angle: 79, height: 13, opacity: .3 }, { angle: 138, height: 10, opacity: .48 }, { angle: 212, height: 12, opacity: .32 }, { angle: 278, height: 8, opacity: .42 }, { angle: 329, height: 11, opacity: .28 }];
  const flames = wisps.map(({ angle, height, opacity }) => `<g transform="translate(320 302) rotate(${angle})" opacity="${opacity}"><path d="M65-4C70-9 ${70 + height * .35}-${9 + height * .4} ${68 + height}-${11 + height * .3}C${68 + height * .65}-7 ${73 + height * .2}-3 74 1C71 4 68 4 65 5C71 1 74-3 72-5C69-2 67-2 65-4Z" fill="url(#${id}-flame)"/><path d="M67 0Q${72 + height * .45}-5 ${68 + height * .6}-${9 + height * .2}" fill="none" stroke="#fff1c3" stroke-width=".7" stroke-linecap="round" opacity=".7"/></g>`).join('');
  const granules = Array.from({ length: 150 }, (_, i) => {
    const a = i * 2.39996323;
    const radius = Math.sqrt((i + .5) / 150) * 65;
    return `<circle cx="${320 + Math.cos(a) * radius}" cy="${302 + Math.sin(a) * radius}" r="${.45 + i % 4 * .24}" fill="${i % 3 ? '#e49c39' : '#fffef2'}" opacity="${i % 3 ? '.13' : '.4'}"/>`;
  }).join('');
  faces.push({ depth: 0, svg: `<g>${flames}<circle cx="320" cy="302" r="68" fill="url(#${id}-sun)"/><circle cx="320" cy="302" r="68" fill="none" stroke="#fff1b5" stroke-width=".8" opacity=".65"/>${granules}<path d="M222 302H418" stroke="url(#${id}-flare)" stroke-width="1" opacity=".5"/></g>` });

  const satellitePositions = [{ x: -2.36, y: .89, z: .62, angle: -28 }, { x: 2.49, y: -.74, z: .24, angle: 26 }, { x: -.62, y: -2.4, z: -.4, angle: 68 }];
  satellitePositions.forEach((position, index) => {
    const q = project(position);
    const cells = [-40, -34, -28, -22, -16, 16, 22, 28, 34, 40].map(x => `M${x}-9V9`).join('');
    faces.push({ depth: position.z, svg: `<g transform="translate(${q.x.toFixed(2)} ${q.y.toFixed(2)}) rotate(${position.angle}) scale(${index === 2 ? '.46' : '.56'})">
      <path d="M-16-4L-5-7m-11 11L-5 7M16-4L5-7m11 11L5 7M-15 0H15" fill="none" stroke="#b1bac0" stroke-width="1.4"/>
      <path d="M-46-10h33v20h-33zM13-10h33v20H13z" fill="#152d42" stroke="#80aabf" stroke-width=".9"/>
      <path d="${cells}M-46-3H-13m-33 6H-13M13-3H46M13 3H46" fill="none" stroke="#94b7c3" stroke-opacity=".52" stroke-width=".6"/>
      <path d="M-46-10h33m26 20h33" fill="none" stroke="#bca579" stroke-width="1.2"/>
      <rect x="-7" y="-10" width="14" height="20" rx="2" fill="url(#${id}-foil)" stroke="#d7c99e" stroke-width=".8"/>
      <path d="M-6-8L4-4l-8 5 10 6M6-8L-4-4l8 5-10 6" fill="none" stroke="#fff0c5" stroke-opacity=".38" stroke-width=".55"/>
      <path d="M-7-1H7v4H-7z" fill="#172334" stroke="#a9bacd" stroke-width=".5"/>
      <circle cx="0" cy="1" r="2.3" fill="#bdf5ff"/><circle cx="0" cy="1" r="1" fill="#fff"/>
      <path d="M-7-14Q0-25 7-14Q0-17-7-14Z" fill="#a5b4be" stroke="#e4edff" stroke-width=".7"/>
      <path d="M0-16V-25M-5-15L0-22l5 7M5-9V-29M4-24h3" fill="none" stroke="#b5c6dd" stroke-width=".7"/><circle cx="5" cy="-29" r="1.1" fill="#c4eaff"/>
      <path d="M-3 10L-5 17H5L3 10Z" fill="#89634a" stroke="#d4a777" stroke-width=".6"/>
      <path d="M-3 18Q-1 24 0 29Q2 24 3 18Z" fill="url(#${id}-exhaust)"/>
    </g>` });
  });

  container.dataset.reactor = 'dyson-sphere';
  container.dataset.architecture = 'orbital-rings';
  container.dataset.orbitalBands = String(rings.length);
  container.dataset.collectorPanels = String(counts.collectorPanels);
  container.dataset.cityModules = '0';
  container.dataset.protrusions = '0';
  container.dataset.ringStyle = 'flush-panel';
  container.dataset.hullInlays = String(counts.hullInlays);
  container.dataset.sunGlow = '0.000';
  container.dataset.sunCoreX = '.5';
  container.dataset.sunCoreY = String(302 / 600);
  container.dataset.satellites = String(satellitePositions.length);
  container.dataset.plasmaFlames = String(wisps.length);
  container.dataset.plasmaPlumes = String(wisps.length);
  container.setAttribute('aria-label', 'Static Dyson megastructure with five interlocking collector rings around a luminous star.');
  container.innerHTML = `<svg data-visual="dyson-sphere" viewBox="0 0 640 600" width="100%" height="100%" role="img" aria-label="Dyson sphere: five sleek interlocking dark metal orbital bands with flush blue-steel inlays and icy blue inner collectors around a brilliant golden star, with small solar wisps and three detailed satellites">
    <defs>
      <radialGradient id="${id}-halo"><stop stop-color="#ffcf66" stop-opacity=".16"/><stop offset=".45" stop-color="#e7ae4a" stop-opacity=".055"/><stop offset="1" stop-color="#d49c4c" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}-sun" cx="43%" cy="42%"><stop stop-color="#fffef2"/><stop offset=".45" stop-color="#fff7ce"/><stop offset=".76" stop-color="#ffe291"/><stop offset=".95" stop-color="#f9ba4d"/><stop offset="1" stop-color="#d1842c"/></radialGradient>
      <radialGradient id="${id}-corona"><stop offset=".28" stop-color="#fff0a4" stop-opacity=".33"/><stop offset=".53" stop-color="#ffd16c" stop-opacity=".16"/><stop offset=".76" stop-color="#f6aa3e" stop-opacity=".045"/><stop offset="1" stop-color="#d28a35" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}-flame" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff5c2" stop-opacity=".9"/><stop offset=".4" stop-color="#ffd075" stop-opacity=".7"/><stop offset="1" stop-color="#e78d31" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}-foil" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dcc58c"/><stop offset=".3" stop-color="#79603a"/><stop offset=".56" stop-color="#b9a474"/><stop offset="1" stop-color="#66553b"/></linearGradient>
      <linearGradient id="${id}-exhaust" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d8fbff" stop-opacity=".8"/><stop offset=".25" stop-color="#76d9ff" stop-opacity=".5"/><stop offset="1" stop-color="#758cf5" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}-flare"><stop stop-color="#ffdf88" stop-opacity="0"/><stop offset=".5" stop-color="#fff8d7"/><stop offset="1" stop-color="#ffdf88" stop-opacity="0"/></linearGradient>
    </defs>
    <style>[data-sun-proximity]{transition:opacity .18s ease}@media(prefers-reduced-motion:reduce){[data-sun-proximity]{transition:none}}</style>
    <circle cx="320" cy="302" r="284" fill="url(#${id}-halo)"/><circle cx="320" cy="302" r="156" fill="url(#${id}-corona)"/>
    <circle data-sun-proximity cx="320" cy="302" r="172" fill="url(#${id}-corona)" opacity="0"/>
    ${faces.sort((a, b) => a.depth - b.depth).map(face => face.svg).join('')}
  </svg>`;
  const svg = container.querySelector('svg');
  const halo = svg.querySelector('[data-sun-proximity]');
  const setGlow = value => {halo.style.opacity = String(value * .85); container.dataset.sunGlow = value.toFixed(3);};
  svg.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    const distance = Math.hypot(point.x-320,point.y-302);
    const t = Math.max(0,Math.min(1,(distance-48)/(139-48)));
    setGlow(1-t*t*(3-2*t));
  });
  svg.addEventListener('pointerleave', () => setGlow(0));
}
