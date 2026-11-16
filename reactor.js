import * as THREE from 'three';
import { mountDysonFallback } from './dyson-fallback.js';

// Five independently rotating orbital megastructures around a procedural star.
// Recessed collectors and flush hull panels keep the geometry detailed while
// every outer ring retains an uninterrupted, machined silhouette.
export function mountReactor(container, { onStatus } = {}) {
  const empty = { setPaused() {}, setMode() {}, dispose() {} };
  if (!container) return empty;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    } catch {
      mountDysonFallback(container);
      onStatus?.('fallback');
      return { ...empty, dispose() { container.replaceChildren(); } };
    }
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.visual = 'dyson-sphere';
  container.dataset.reactor = 'dyson-sphere';
  container.setAttribute('aria-label', 'Interactive Dyson megastructure with five interlocking collector rings around a luminous star. Drag to rotate.');
  container.replaceChildren(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
  camera.position.set(0, .22, 9.5);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0x778398, .7));
  const key = new THREE.DirectionalLight(0xe4edff, 3.1);
  key.position.set(-4, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc176, 4.3);
  rim.position.set(2, 1, -4);
  scene.add(rim);
  const goldLight = new THREE.DirectionalLight(0xffc885, 1.8);
  goldLight.position.set(4, -3, 4);
  scene.add(goldLight);
  const sunLight = new THREE.PointLight(0xffd697, 17, 6, 2);
  scene.add(sunLight);

  const machine = new THREE.Group();
  scene.add(machine);
  const hardwareMaterials = [];
  const material = (options, hardware = true) => {
    const value = new THREE.MeshStandardMaterial(options);
    if (hardware) hardwareMaterials.push(value);
    return value;
  };
  const darkMetal = material({ color: 0x293b49, metalness: .87, roughness: .3 });
  const trimMetal = material({ color: 0x708c9e, metalness: .9, roughness: .24 });
  const brass = material({ color: 0x9d7851, metalness: .88, roughness: .3 });
  const black = material({ color: 0x101c2a, metalness: .84, roughness: .36 });
  const hullInlay = material({ color: 0x26404f, emissive: 0x102637, emissiveIntensity: .2, metalness: .87, roughness: .3 });
  const navigationLight = material({ color: 0x8de9ff, emissive: 0x42c3ed, emissiveIntensity: .95, metalness: .55, roughness: .2 }, false);
  const phosphor = material({ color: 0x9edbf2, emissive: 0x4aa9ce, emissiveIntensity: .8, metalness: .45, roughness: .29 }, false);
  const mesh = (geometry, surface, parent = machine) => {
    const object = new THREE.Mesh(geometry, surface);
    parent.add(object);
    return object;
  };
  const torus = (radius, thickness, surface, parent = machine, arc = Math.PI * 2) => mesh(new THREE.TorusGeometry(radius, thickness, 6, Math.max(24, Math.ceil(112 * arc / (Math.PI * 2))), arc), surface, parent);
  const lineSegments = (points, color, opacity, parent = machine) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const object = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    parent.add(object);
    return object;
  };
  // A closed bevel profile gives each orbital a substantial, flat-sided beam,
  // rather than a round wire. Its blue collector face points inward at the sun.
  function orbitalBeam(radius, radialDepth, width, bevel = .014) {
    const d = radialDepth / 2, w = width / 2;
    const profile = [[-d + bevel,-w], [d - bevel,-w], [d,-w + bevel], [d,w - bevel], [d - bevel,w], [-d + bevel,w], [-d,w - bevel], [-d,-w + bevel]];
    const vertices = [], indices = [];
    const segments = 192;
    for (let step = 0; step <= segments; step++) {
      const angle = step / segments * Math.PI * 2;
      for (const [offset, axial] of profile) vertices.push(Math.cos(angle) * (radius + offset), Math.sin(angle) * (radius + offset), axial);
    }
    for (let step = 0; step < segments; step++) for (let face = 0; face < profile.length; face++) {
      const a = step * 8 + face, b = step * 8 + (face + 1) % 8, c = a + 8, d = b + 8;
      indices.push(a,c,b,b,c,d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  const transform = new THREE.Object3D();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const orbitals = [];
  const orbitalSpecs = [
    { radius: 1.66, width: .33, rotation: [1.18,-.22,-.17], speed: .012 },
    { radius: 1.80, width: .31, rotation: [.28,.94,.22], speed: -.009 },
    { radius: 1.94, width: .34, rotation: [.90,.35,.86], speed: .007 },
    { radius: 2.09, width: .29, rotation: [-.50,-.63,-.48], speed: -.006 },
    { radius: 2.23, width: .28, rotation: [.35,-.40,.80], speed: .0045 },
  ];
  const collectorSurface = material({ color: 0x488ca8, emissive: 0x1e5870, emissiveIntensity: .55, metalness: .7, roughness: .24 });
  const collectorGlint = material({ color: 0x98d6de, emissive: 0x246275, emissiveIntensity: .45, metalness: .62, roughness: .3 });
  let collectorCount = 0, inlayCount = 0;
  for (const [orbitalIndex, spec] of orbitalSpecs.entries()) {
    const mount = new THREE.Group();
    mount.rotation.set(...spec.rotation);
    const ring = new THREE.Group();
    mount.add(ring);
    machine.add(mount);
    mesh(orbitalBeam(spec.radius, .112, spec.width), orbitalIndex % 2 ? black : darkMetal, ring);
    // Beveled borders and inlaid circuits stay inside the hull's radial profile.
    for (const sign of [-1, 1]) {
      const lip = torus(spec.radius + .038, .008, brass, ring);
      lip.position.z = sign * (spec.width / 2 - .013);
      const innerLip = torus(spec.radius - .040, .004, trimMetal, ring);
      innerLip.position.z = sign * (spec.width / 2 - .005);
      for (let track = 0; track < 2; track++) {
        const trace = torus(spec.radius + .002, .003, navigationLight, ring, Math.PI * .23);
        trace.position.z = sign * (spec.width / 2 - .002);
        trace.rotation.z = track * Math.PI + orbitalIndex * .47 + sign * .24;
      }
    }
    const cells = 72, rows = 2;
    const collectors = new THREE.InstancedMesh(unitBox, collectorSurface, cells * rows);
    const glints = new THREE.InstancedMesh(unitBox, collectorGlint, cells);
    const inlays = new THREE.InstancedMesh(unitBox, hullInlay, cells * 2);
    const seams = [];
    for (let cell = 0; cell < cells; cell++) {
      const angle = cell / cells * Math.PI * 2;
      for (let row = 0; row < rows; row++) {
        transform.position.set(Math.cos(angle) * (spec.radius - .059), Math.sin(angle) * (spec.radius - .059), (row ? 1 : -1) * spec.width * .23);
        transform.rotation.set(0, 0, angle);
        transform.scale.set(.008, Math.PI * 2 * spec.radius / cells * .76, spec.width * .34);
        transform.updateMatrix();
        collectors.setMatrixAt(cell * rows + row, transform.matrix);
        const tint = new THREE.Color().setHSL(.53 + .045 * Math.sin(cell * 1.71 + orbitalIndex), .39, .37 + (cell % 7) * .025);
        collectors.setColorAt(cell * rows + row, tint);
      }
      transform.position.set(Math.cos(angle) * (spec.radius - .065), Math.sin(angle) * (spec.radius - .065), 0);
      transform.rotation.set(0, 0, angle);
      transform.scale.set(.009, Math.PI * 2 * spec.radius / cells * .60, .012);
      transform.updateMatrix();
      glints.setMatrixAt(cell, transform.matrix);
      for (const [side, sign] of [[0,-1],[1,1]]) {
        transform.position.set(Math.cos(angle) * spec.radius, Math.sin(angle) * spec.radius, sign * (spec.width / 2 - .004));
        transform.rotation.set(0, 0, angle);
        transform.scale.set(.058, Math.PI * 2 * spec.radius / cells * .79, .005);
        transform.updateMatrix();
        inlays.setMatrixAt(cell * 2 + side, transform.matrix);
        const tint = new THREE.Color().setHSL(.56 + (orbitalIndex % 2) * .025, .22, .21 + (cell % 5) * .021);
        inlays.setColorAt(cell * 2 + side, tint);
      }
      if (cell % 3 === 0) {
        const r = spec.radius + .055;
        seams.push(new THREE.Vector3(Math.cos(angle)*r, Math.sin(angle)*r, -spec.width*.36), new THREE.Vector3(Math.cos(angle)*r, Math.sin(angle)*r, spec.width*.36));
      }
    }
    ring.add(collectors, glints, inlays);
    lineSegments(seams, 0x80a9bb, .3, ring);
    orbitals.push({ group: ring, mount, base: spec.rotation, speed: spec.speed });
    collectorCount += cells * rows;
    inlayCount += cells * 2;
  }
  container.dataset.architecture = 'orbital-rings';
  container.dataset.orbitalBands = String(orbitals.length);
  container.dataset.collectorPanels = String(collectorCount);
  container.dataset.cityModules = '0';
  container.dataset.protrusions = '0';
  container.dataset.ringStyle = 'flush-panel';
  container.dataset.hullInlays = String(inlayCount);

  // A contained procedural photosphere, with flowing surface granulation.
  const sunUniforms = { uTime: { value: 0 }, uGlow: { value: 0 } };
  const sun = mesh(new THREE.SphereGeometry(.68, 48, 32), new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: `varying vec3 vPosition; varying vec3 vNormal; void main(){vPosition=position;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `#ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform float uTime; uniform float uGlow; varying vec3 vPosition; varying vec3 vNormal;
      float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 p=vPosition*10.;p.y+=uTime*.22;float n=noise(p)*.55+noise(p*2.7+uTime*.13)*.3+noise(p*7.)*.15;float filaments=pow(abs(sin((vPosition.y+n*.15)*38.+uTime*.24)),8.);float center=pow(max(vNormal.z,0.),.7);vec3 deep=vec3(.74,.13,.025),orange=vec3(1.,.46,.07),gold=vec3(1.,.87,.5),white=vec3(1.,.98,.88);vec3 col=mix(deep,orange,smoothstep(.12,.5,n));col=mix(col,gold,smoothstep(.4,.8,n));col=mix(col,white,center*.65+n*.23);col+=filaments*vec3(.15,.09,.025);gl_FragColor=vec4(col*(1.42+uGlow*.13),1.);}`,
    toneMapped: false,
  }));
  const prominences = new THREE.Group();
  machine.add(prominences);
  const plasmaUniforms = { uTime: { value: 0 } };
  const plasma = new THREE.ShaderMaterial({
    uniforms: plasmaUniforms, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: `uniform float uTime;attribute float aSeed;varying vec2 vUv;varying float vSeed;
      void main(){vUv=uv;vSeed=aSeed;float wave=sin(uv.x*17.-uTime*2.4+aSeed+uv.y*6.283)*sin(uv.x*7.+uTime*1.1);vec3 p=position+normal*wave*.009*(1.-uv.x);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `#ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform float uTime;varying vec2 vUv;varying float vSeed;
      float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){float t=vUv.x;float streams=.5+.5*sin(t*25.-uTime*3.8+vSeed+sin(vUv.y*12.+uTime)*1.7);float fine=.5+.5*sin(t*49.-uTime*5.+vUv.y*19.);float ridges=pow(streams,.8)*(.6+fine*.4);float cycle=fract(uTime*(.065+fract(vSeed)*.035)+vSeed*.137);float presence=smoothstep(.05,.2,cycle)*(1.-smoothstep(.43,.65,cycle));float fade=smoothstep(0.,.08,t)*(1.-smoothstep(.68,1.,t));float volume=.3+.7*abs(sin(vUv.y*6.283));vec3 orange=vec3(1.,.28,.065),pink=vec3(1.,.16,.39),hot=vec3(1.,.83,.49);vec3 col=mix(orange,pink,smoothstep(.36,1.,t));col=mix(col,hot,pow(ridges,2.)*(1.-t)*.7);float alpha=presence*fade*volume*(.1+ridges*.46);gl_FragColor=vec4(col*(.8+ridges*.55),alpha);}`,
  });
  function taperedPlume(curve, width, seed) {
    const segments = 34, sides = 7;
    const vertices = [], uvs = [], seeds = [], indices = [];
    const ref = new THREE.Vector3(0, 0, 1);
    for (let step = 0; step <= segments; step++) {
      const t = step / segments, center = curve.getPointAt(t), tangent = curve.getTangentAt(t);
      const side = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.z) > .92 ? new THREE.Vector3(0, 1, 0) : ref).normalize();
      const up = new THREE.Vector3().crossVectors(tangent, side).normalize();
      const radius = .002 + width * Math.pow(1 - t, 1.15) * (.55 + Math.sin(t * Math.PI) * .65);
      for (let edge = 0; edge <= sides; edge++) {
        const angle = edge / sides * Math.PI * 2;
        const point = center.clone().addScaledVector(side, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius);
        vertices.push(point.x, point.y, point.z);uvs.push(t, edge / sides);seeds.push(seed);
        if (step < segments && edge < sides) {const a = step * (sides + 1) + edge, b = a + sides + 1;indices.push(a,b,a+1,b,b+1,a+1);}
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    return mesh(geometry, plasma, prominences);
  }
  let wispSeed = 73421;
  const randomWisp = () => {wispSeed = wispSeed * 16807 % 2147483647;return (wispSeed - 1) / 2147483646;};
  const wispCount = 6;
  // Small, independently fading arches stay at the star's surface. No plasma
  // reaches the collector shell; height, curl, width and timing vary per wisp.
  for (let index = 0; index < wispCount; index++) {
    const angle = (index + randomWisp() * .55) * Math.PI * 2 / wispCount;
    const height = .075 + randomWisp() * .105;
    const curl = .055 + randomWisp() * .055;
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const tangent = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
    const point = (radius, sweep, z) => radial.clone().multiplyScalar(radius).addScaledVector(tangent, sweep).add(new THREE.Vector3(0,0,z));
    taperedPlume(new THREE.CatmullRomCurve3([point(.61,-curl*.5,.17),point(.7+height*.3,-curl*.7,.17),point(.68+height,curl*.35,.12),point(.66,curl,.1)]),.01+randomWisp()*.009,index*.93+randomWisp());
  }
  container.dataset.plasmaPlumes = String(wispCount);

  const glowCanvas = document.createElement('canvas');
  let corona;
  glowCanvas.width = glowCanvas.height = 128;
  const glowContext = glowCanvas.getContext('2d');
  if (glowContext) {
    const gradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,245,206,.78)');
    gradient.addColorStop(.16, 'rgba(255,210,126,.39)');
    gradient.addColorStop(.35, 'rgba(255,181,76,.13)');
    gradient.addColorStop(.66, 'rgba(255,156,53,.025)');
    gradient.addColorStop(1, 'rgba(255,156,53,0)');
    glowContext.fillStyle = gradient;
    glowContext.fillRect(0, 0, 128, 128);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, opacity: .69, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    corona.scale.set(4.8, 4.8, 1);
    machine.add(corona);
  }
  // A very short optical streak belongs to the star, and never extends across
  // the page. Its plane stays behind the foreground bands for proper occlusion.
  const flare = mesh(new THREE.PlaneGeometry(3.5, .6), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;void main(){vec2 p=vUv-.5;float ray=exp(-abs(p.y)*160.)*exp(-abs(p.x)*7.);float halo=exp(-dot(p*vec2(4.,2.),p*vec2(4.,2.))*13.);gl_FragColor=vec4(1.,.76,.36,ray*.16+halo*.045);}',
  }));
  flare.position.z = -.38;
  const outerTrack = new THREE.Group();
  outerTrack.rotation.set(.75, -.42, -.18);
  machine.add(outerTrack);

  const satellites = [];
  const foil = material({ color: 0xd4a653, metalness: .72, roughness: .47, flatShading: true });
  const solar = material({ color: 0x194bb0, emissive: 0x102c74, emissiveIntensity: .2, metalness: .62, roughness: .32 });
  const satelliteGeometry = new THREE.CylinderGeometry(.092, .08, .18, 8);
  const busEdges = new THREE.EdgesGeometry(satelliteGeometry);
  const busEdgeMaterial = new THREE.LineBasicMaterial({ color: 0xffd39b, transparent: true, opacity: .55 });
  const solarGeometry = new THREE.BoxGeometry(.3, .175, .014);
  const solarLines = [];
  for (const y of [-.0875, 0, .0875]) solarLines.push(new THREE.Vector3(-.15,y,.009),new THREE.Vector3(.15,y,.009));
  for (let cell = 0; cell <= 6; cell++) {const x = -.15 + cell * .05;solarLines.push(new THREE.Vector3(x,-.0875,.009),new THREE.Vector3(x,.0875,.009));}
  const solarGrid = new THREE.BufferGeometry().setFromPoints(solarLines);
  const cellMaterial = new THREE.LineBasicMaterial({ color: 0xc1d8ff, transparent: true, opacity: .67 });
  const dishGeometry = new THREE.LatheGeometry([new THREE.Vector2(0,-.025),new THREE.Vector2(.018,-.023),new THREE.Vector2(.037,-.014),new THREE.Vector2(.059,.003)], 16);
  const dishMaterial = material({ color: 0xc2cbd9, metalness: .9, roughness: .24, side: THREE.DoubleSide });
  const engineGeometry = new THREE.CylinderGeometry(.024,.037,.055,10,1,true);
  const enginePlumeGeometry = new THREE.ConeGeometry(.024,.2,9,1,true);
  enginePlumeGeometry.translate(0,-.1,0);
  const enginePlume = new THREE.MeshBasicMaterial({color:0x78d9ff,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  const satelliteCount = 3;
  for (let index = 0; index < satelliteCount; index++) {
    const satellite = new THREE.Group();
    satellite.scale.setScalar(.63);
    const bus = mesh(satelliteGeometry, foil, satellite);
    bus.add(new THREE.LineSegments(busEdges,busEdgeMaterial));
    const belt = mesh(new THREE.CylinderGeometry(.094,.094,.028,8), darkMetal, satellite);belt.position.y = .015;
    const panelPivots = [];
    for (const sign of [-1, 1]) {
      const hinge = new THREE.Group();hinge.position.x = sign * .105;hinge.rotation.y = sign * .16;satellite.add(hinge);
      const wing = mesh(solarGeometry, solar, hinge);wing.position.x = sign * .19;
      wing.add(new THREE.LineSegments(solarGrid,cellMaterial));
      panelPivots.push({group:hinge,sign});
    }
    const struts = [
      new THREE.Vector3(-.08,0,0),new THREE.Vector3(-.16,0,0),new THREE.Vector3(.08,0,0),new THREE.Vector3(.16,0,0),
      new THREE.Vector3(0,.08,0),new THREE.Vector3(0,.3,.025),new THREE.Vector3(0,.3,.025),new THREE.Vector3(.035,.29,.025),
      new THREE.Vector3(.055,.07,.035),new THREE.Vector3(.08,.22,.035),
      new THREE.Vector3(-.035,.1,.02),new THREE.Vector3(-.035,.16,.08),
      new THREE.Vector3(-.075,.145,.08),new THREE.Vector3(-.035,.18,.14),new THREE.Vector3(.005,.145,.08),new THREE.Vector3(-.035,.18,.14),
    ];
    lineSegments(struts,0xd9b889,.7,satellite);
    const dish = new THREE.Group();dish.position.set(-.035,.145,.08);dish.rotation.x = Math.PI / 2;satellite.add(dish);
    mesh(dishGeometry,dishMaterial,dish);
    const feed = mesh(new THREE.SphereGeometry(.009,6,4),phosphor,satellite);feed.position.set(-.035,.18,.14);
    const eye = mesh(new THREE.CylinderGeometry(.024, .024, .022, 10), phosphor, satellite);
    eye.rotation.x = Math.PI / 2;
    eye.position.set(0,-.02,.095);
    const radiator = mesh(new THREE.BoxGeometry(.075,.13,.012),black,satellite);radiator.position.z = -.095;
    const nozzle = mesh(engineGeometry,brass,satellite);nozzle.position.y = -.118;
    const plume = mesh(enginePlumeGeometry,enginePlume,satellite);plume.position.y = -.147;
    outerTrack.add(satellite);
    satellites.push({ group: satellite, phase: index * Math.PI * 2 / satelliteCount, radius: index % 3 === 0 ? 2.59 : 2.50, speed: .038 + index % 3 * .009, panelPivots, dish, plume });
  }
  container.dataset.satellites = String(satellites.length);

  const photonPositions = new Float32Array(210 * 3);
  for (let index = 0; index < 210; index++) {
    const a = index * 2.399963;
    const radius = .95 + (index * 37 % 100) / 100 * .55;
    const y = (index / 209 * 2 - 1) * radius;
    const r = Math.sqrt(Math.max(0, radius * radius - y * y));
    photonPositions.set([Math.cos(a) * r, y, Math.sin(a) * r], index * 3);
  }
  const photonGeometry = new THREE.BufferGeometry();
  photonGeometry.setAttribute('position', new THREE.BufferAttribute(photonPositions, 3));
  const photons = new THREE.Points(photonGeometry, new THREE.PointsMaterial({ color: 0xffd69a, size: .011, transparent: true, opacity: .30, depthWrite: false }));
  machine.add(photons);

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let requestedPause = false;
  let inView = true;
  let disposed = false;
  let lost = false;
  let cleaned = false;
  let animation = 0;
  let lastTime = 0;
  let elapsed = 0;
  let drag = null;
  let dragX = -.1;
  let dragY = 0;
  let pointerTiltX = 0;
  let pointerTiltY = 0;
  let glowPointer = null;
  let sunGlow = 0;
  const corePosition = new THREE.Vector3();
  const coreProjection = new THREE.Vector3();
  const coreEdge = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const isPaused = () => requestedPause || motionQuery.matches;
  const schedule = () => { if (!disposed && !lost && !animation) animation = requestAnimationFrame(frame); };
  function updateSunGlow(delta, active) {
    // Proximity is measured against the projected star rather than the panel.
    // This stays accurate after drag rotation, responsive sizing, and floating.
    machine.updateMatrixWorld(true);
    sun.getWorldPosition(corePosition);
    coreProjection.copy(corePosition).project(camera);
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(.68);
    coreEdge.copy(corePosition).add(cameraRight).project(camera);
    const cx = (coreProjection.x + 1) / 2;
    const cy = (1 - coreProjection.y) / 2;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const radius = Math.max(1, Math.abs(coreEdge.x - coreProjection.x) * width / 2);
    const distance = glowPointer ? Math.hypot((glowPointer.x - cx) * width, (glowPointer.y - cy) * height) : Infinity;
    const target = inView && !document.hidden ? 1 - THREE.MathUtils.smoothstep(distance, radius * .7, radius * 2.05) : 0;
    sunGlow = active ? THREE.MathUtils.lerp(sunGlow, target, 1 - Math.exp(-Math.max(delta, .016) * 8)) : target;
    if (Math.abs(sunGlow - target) < .001) sunGlow = target;
    sunUniforms.uGlow.value = sunGlow;
    sunLight.intensity = 17 + sunGlow * 4;
    if (corona) {
      corona.material.opacity = .69 + sunGlow * .24;
      corona.scale.set(4.8 + sunGlow * .55, 4.8 + sunGlow * .55, 1);
    }
    container.dataset.sunGlow = sunGlow.toFixed(3);
    container.dataset.sunCoreX = cx.toFixed(4);
    container.dataset.sunCoreY = cy.toFixed(4);
  }
  function isElementInViewport() {
    if (!container || !container.isConnected) return false;
    const rect = container.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 1000;
    const vw = window.innerWidth || document.documentElement.clientWidth || 1000;
    return rect.bottom >= -80 && rect.top <= vh + 80 && rect.right >= -80 && rect.left <= vw + 80;
  }
  function frame(time) {
    animation = 0;
    if (disposed || lost) return;
    const active = !isPaused() && inView && !document.hidden;
    const timestamp = typeof time === 'number' && Number.isFinite(time) ? time : performance.now();
    if (active && lastTime && timestamp - lastTime < 16) { schedule(); return; }
    const delta = active && lastTime ? Math.min((timestamp - lastTime) / 1000, .06) : 0;
    lastTime = active ? timestamp : 0;
    elapsed += delta;
    machine.rotation.set(.1 + dragY + pointerTiltY, dragX + elapsed * .012 + pointerTiltX, -.13);
    machine.position.y = Math.sin(elapsed * .4) * .045;
    sunUniforms.uTime.value = elapsed;
    plasmaUniforms.uTime.value = elapsed;
    sun.rotation.y = elapsed * .045;
    prominences.rotation.z = elapsed * .035;
    for (const orbital of orbitals) {
      orbital.group.rotation.z = elapsed * orbital.speed;
      orbital.mount.rotation.y = orbital.base[1] + Math.sin(elapsed * .016) * .035;
    }
    photons.rotation.y = -elapsed * .055;
    collectorGlint.emissiveIntensity = .42 + Math.sin(elapsed * .5) * .06;
    for (const satellite of satellites) {
      const angle = satellite.phase + elapsed * satellite.speed;
      satellite.group.position.set(Math.cos(angle) * satellite.radius, Math.sin(angle) * satellite.radius, .02);
      satellite.group.rotation.z = angle + Math.PI / 2;
      satellite.group.rotation.y = Math.sin(elapsed * .16 + satellite.phase) * .18;
      satellite.group.rotation.x = Math.cos(satellite.phase) * .12;
      for (const pivot of satellite.panelPivots) pivot.group.rotation.y = pivot.sign * (.16 + Math.sin(elapsed * .23 + satellite.phase) * .28);
      satellite.dish.rotation.x = Math.PI / 2 + Math.sin(elapsed * .19 + satellite.phase) * .16;
      satellite.plume.scale.y = .73 + Math.sin(elapsed * 2.2 + satellite.phase) * .2;
    }
    updateSunGlow(delta, active);
    renderer.render(scene, camera);
    if (active) schedule();
  }

  let cachedBounds = null;
  const resize = () => {
    if (disposed || lost) return;
    cachedBounds = container.getBoundingClientRect();
    const { width, height } = cachedBounds;
    if (!width || !height) {
      requestAnimationFrame(() => {
        if (!disposed && !lost && container.isConnected) {
          const fresh = container.getBoundingClientRect();
          if (fresh.width && fresh.height) resize();
        }
      });
      return;
    }
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = 9.7 * Math.max(1, .95 / camera.aspect);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    inView = isElementInViewport();
    schedule();
  };
  const onScroll = () => {
    cachedBounds = null;
    const visible = isElementInViewport();
    if (inView !== visible) {
      inView = visible;
      lastTime = 0;
      schedule();
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  const intersectionObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    inView = entry ? entry.isIntersecting : isElementInViewport();
    lastTime = 0;
    schedule();
  }, { rootMargin: '80px' }) : null;
  intersectionObserver?.observe(container);
  const visibility = () => {
    inView = isElementInViewport();
    lastTime = 0;
    schedule();
  };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('focus', visibility);
  window.addEventListener('pageshow', visibility);
  motionQuery.addEventListener('change', visibility);

  const pointerDown = event => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, startX: dragX, startY: dragY, touch: event.pointerType === 'touch', active: event.pointerType !== 'touch', id: event.pointerId };
    if (drag.active) { canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing'; }
  };
  const pointerMove = event => {
    if (event.pointerType !== 'touch') {
      const bounds = cachedBounds || (cachedBounds = canvas.getBoundingClientRect());
      glowPointer = {x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height};
      schedule();
      if (!drag && !isPaused()) {
        pointerTiltX = ((event.clientX - bounds.left) / bounds.width - .5) * .1;
        pointerTiltY = ((event.clientY - bounds.top) / bounds.height - .5) * .08;
      }
    }
    if (!drag) return;
    if (event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.touch && !drag.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) < 9 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      drag.active = true;
      canvas.setPointerCapture(event.pointerId);
    }
    dragX = drag.startX + dx * .006;
    dragY = Math.max(-.8, Math.min(.8, drag.startY + dy * .004));
    schedule();
  };
  const pointerUp = event => {
    if (drag && event.pointerId === drag.id && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = null;
    canvas.style.cursor = 'grab';
  };
  const pointerLeave = () => { glowPointer = null; if (!drag) pointerTiltX = pointerTiltY = 0; schedule(); };
  const contextLost = event => {
    event.preventDefault();
    if (lost || disposed) return;
    lost = true;
    cleanup();
    mountDysonFallback(container);
    onStatus?.('fallback');
  };
  const listeners = { pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp, pointercancel: pointerUp, lostpointercapture: pointerUp, pointerleave: pointerLeave, webglcontextlost: contextLost };
  for (const [event, listener] of Object.entries(listeners)) canvas.addEventListener(event, listener);

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    cancelAnimationFrame(animation);
    animation = 0;
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    window.removeEventListener('resize', resize);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('focus', visibility);
    window.removeEventListener('pageshow', visibility);
    motionQuery.removeEventListener('change', visibility);
    for (const [event, listener] of Object.entries(listeners)) canvas.removeEventListener(event, listener);
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const surface of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(surface); if (surface.map) textures.add(surface.map); }
      object.dispose?.();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const surface of materials) surface.dispose();
    renderer.dispose();
  }
  resize();
  schedule();
  onStatus?.(isPaused() ? 'paused' : 'online');
  return {
    setPaused(value) { requestedPause = Boolean(value); lastTime = 0; schedule(); if (!lost && !disposed) onStatus?.(isPaused() ? 'paused' : 'online'); },
    setMode(value) { if (disposed || lost) return; for (const surface of hardwareMaterials) surface.wireframe = value === 'schematic'; schedule(); },
    dispose() { if (disposed) return; disposed = true; cleanup(); container.replaceChildren(); }
  };
}
