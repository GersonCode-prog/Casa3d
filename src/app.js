import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ITEMS, ITEM_MAP, CATS, buildItem, lampMats, FURN_SWATCHES, footprint } from './catalog.js';
import {
  buildWall, buildFloor, buildGround, floorRect, floorPreview, FLOOR_MATS, OPENINGS, WALL_SWATCHES, wallInfo,
} from './build.js';
import { exampleHouse } from './example.js';

const $ = (s) => document.querySelector(s);
const V3 = THREE.Vector3;
const app = $('#app'), vp = $('#viewport'), canvas = $('#c');
const snap = (v, s) => Math.round(v / s) * s;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v, d = 2) => v.toFixed(d).replace(/\.?0+$/, '') || '0';

let idc = 0;
const nid = (p) => `${p}${Date.now().toString(36)}${(idc++).toString(36)}`;

// ================================================================ estado
const STORE = 'casa3d:v1';
function load() {
  try {
    const j = JSON.parse(localStorage.getItem(STORE));
    if (j && Array.isArray(j.walls) && Array.isArray(j.items) && Array.isArray(j.floors)) return j;
  } catch { /* sin almacenamiento */ }
  return null;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* sin almacenamiento */ }
}
let S = load() || exampleHouse(nid);

const undoS = [], redoS = [];
function pushUndo(snapshot) {
  undoS.push(snapshot);
  if (undoS.length > 150) undoS.shift();
  redoS.length = 0;
}
function commit(fn) {
  pushUndo(JSON.stringify(S));
  fn();
  changed();
}
function changed() {
  rebuild();
  save();
  refreshProps();
  refreshStats();
}
function undo() {
  if (!undoS.length) return toast('Nada que deshacer');
  redoS.push(JSON.stringify(S));
  S = JSON.parse(undoS.pop());
  validateSel();
  changed();
}
function redo() {
  if (!redoS.length) return toast('Nada que rehacer');
  undoS.push(JSON.stringify(S));
  S = JSON.parse(redoS.pop());
  validateSel();
  changed();
}

const findItem = (id) => S.items.find((i) => i.id === id);
const findWall = (id) => S.walls.find((w) => w.id === id);
const findFloor = (id) => S.floors.find((f) => f.id === id);
function findOpening(id) {
  for (const wall of S.walls) {
    const op = (wall.openings || []).find((o) => o.id === id);
    if (op) return { wall, op };
  }
  return null;
}

let EMBED = false;
try { EMBED = window.self !== window.top; } catch { EMBED = true; }

const ui = {
  view: '3d', tool: 'select', cut: true, grid: true, day: true,
  sel: null, draft: null, place: null, placeRot: 0,
  wallTh: 0.15, wallH: 2.7, floorMat: 'madera', opening: 'door', winKind: 'window',
  cat: 'Todos', q: '',
};

// ================================================================ escena
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const labelR = new CSS2DRenderer({ element: $('#labels') });

const scene = new THREE.Scene();
{
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pm.dispose();
}
const skyU = { uTop: { value: new THREE.Color('#6fa6dc') }, uBot: { value: new THREE.Color('#eaf2f7') } };
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(450, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uBot; varying vec3 vP;
      void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(uBot, uTop, smoothstep(-0.02, 0.45, h)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  })
));
scene.fog = new THREE.Fog('#dde8f0', 70, 300);

const hemi = new THREE.HemisphereLight('#dbeeff', '#7a6a55', 1.1);
const sun = new THREE.DirectionalLight('#fff1dd', 2.7);
sun.position.set(14, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 80 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);
const lampLights = Array.from({ length: 10 }, () => {
  const l = new THREE.PointLight('#ffc77a', 0, 7, 1.6);
  scene.add(l);
  return l;
});

scene.add(buildGround());

const grid = new THREE.Group();
for (const [div, op] of [[160, 0.08], [80, 0.18]]) {
  const gh = new THREE.GridHelper(80, div, 0x5b6b7d, 0x5b6b7d);
  gh.material.transparent = true;
  gh.material.opacity = op;
  gh.material.depthWrite = false;
  grid.add(gh);
}
grid.position.y = 0.025;
scene.add(grid);

const G = {
  floors: new THREE.Group(), walls: new THREE.Group(), items: new THREE.Group(),
  labels: new THREE.Group(), draft: new THREE.Group(),
};
Object.values(G).forEach((g) => scene.add(g));

const cursorDot = new THREE.Mesh(
  new THREE.RingGeometry(0.07, 0.12, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#2f6df6', depthTest: false, transparent: true })
);
cursorDot.renderOrder = 1000;
cursorDot.visible = false;
scene.add(cursorDot);

const ghostOpening = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.45, depthTest: false })
);
ghostOpening.renderOrder = 1000;
ghostOpening.visible = false;
scene.add(ghostOpening);
const ghostMat = new THREE.MeshStandardMaterial({ color: '#3b82f6', transparent: true, opacity: 0.5, depthWrite: false });
let ghost = null;

// ================================================================ cámaras
const persp = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
persp.position.set(11, 13, 15);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
ortho.position.set(0, 80, 0.001);
const walkCam = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);
const ORTHO_V = 12;
const cam = () => (ui.view === 'plan' ? ortho : ui.view === 'walk' ? walkCam : persp);

// El listener propio se registra ANTES que OrbitControls para poder "consumir" el clic
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onUp);
canvas.addEventListener('dblclick', () => {
  if (ui.draft?.type === 'wall') endDraft();
});
canvas.addEventListener('pointerleave', () => { if (!down) hideMeasure(); });

const controls3d = new OrbitControls(persp, canvas);
Object.assign(controls3d, {
  enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI / 2 - 0.04,
  minDistance: 2, maxDistance: 80, screenSpacePanning: false,
});
controls3d.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
const controls2d = new OrbitControls(ortho, canvas);
Object.assign(controls2d, { enableRotate: false, screenSpacePanning: true, minZoom: 0.25, maxZoom: 8, enableDamping: true, dampingFactor: 0.12 });
controls2d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls2d.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
function restoreControls() {
  controls3d.enabled = ui.view === '3d';
  controls2d.enabled = ui.view === 'plan';
}

function resize() {
  const w = Math.max(vp.clientWidth, 1), h = Math.max(vp.clientHeight, 1);
  renderer.setSize(w, h, false);
  labelR.setSize(w, h);
  for (const c of [persp, walkCam]) { c.aspect = w / h; c.updateProjectionMatrix(); }
  Object.assign(ortho, { left: (-ORTHO_V * w) / h, right: (ORTHO_V * w) / h, top: ORTHO_V, bottom: -ORTHO_V });
  ortho.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(vp);
resize();

function bounds() {
  const b = new THREE.Box3();
  for (const w of S.walls) { b.expandByPoint(new V3(w.a[0], 0, w.a[1])); b.expandByPoint(new V3(w.b[0], 0, w.b[1])); }
  for (const f of S.floors) { b.expandByPoint(new V3(f.x0, 0, f.z0)); b.expandByPoint(new V3(f.x1, 0, f.z1)); }
  if (b.isEmpty()) b.set(new V3(-5, 0, -4), new V3(5, 0, 4));
  return b;
}
function fitView() {
  const b = bounds(), c = b.getCenter(new V3()), s = b.getSize(new V3());
  const r = Math.max(s.x, s.z, 6);
  controls3d.target.set(c.x, 0, c.z);
  persp.position.set(c.x + r * 0.42, r * 0.78, c.z + r * 0.86);
  controls3d.update();
  controls2d.target.set(c.x, 0, c.z);
  ortho.position.set(c.x, 80, c.z + 0.001);
  const asp = vp.clientWidth / Math.max(vp.clientHeight, 1);
  ortho.zoom = Math.min((2 * ORTHO_V) / (s.z * 1.25 + 1), (2 * ORTHO_V * asp) / (s.x * 1.25 + 1));
  ortho.updateProjectionMatrix();
  controls2d.update();
}

// ================================================================ construcción
const objs = { item: new Map(), wall: new Map(), floor: new Map(), opening: new Map() };
function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse((o) => { if (o.userData.dispose) o.geometry.dispose(); });
  }
}
function makeItem(it) {
  const g = buildItem(it.type, it.color);
  g.position.set(it.x, it.elev || 0, it.z);
  g.rotation.y = it.rot || 0;
  g.userData = { kind: 'item', id: it.id };
  return g;
}
function rebuild() {
  for (const k of ['floors', 'walls', 'items']) clearGroup(G[k]);
  Object.values(objs).forEach((m) => m.clear());
  const dh = ui.view === '3d' && ui.cut ? 1.15 : Infinity;
  S.floors.forEach((f, i) => {
    const m = buildFloor(f, i);
    G.floors.add(m);
    objs.floor.set(f.id, m);
  });
  for (const w of S.walls) {
    const g = buildWall(w, dh);
    G.walls.add(g);
    objs.wall.set(w.id, g);
    g.traverse((o) => { if (o.userData.kind === 'opening') objs.opening.set(o.userData.id, o); });
  }
  for (const it of S.items) {
    const g = makeItem(it);
    G.items.add(g);
    objs.item.set(it.id, g);
  }
  updateLampLights();
  buildLabels();
  attachSel();
}

function updateLampLights() {
  let n = 0;
  G.items.updateMatrixWorld(true);
  for (const it of S.items) {
    const L = ITEM_MAP[it.type]?.light;
    if (!L || n >= lampLights.length) continue;
    const o = objs.item.get(it.id);
    lampLights[n].position.copy(o.localToWorld(new V3(0, L.y, 0)));
    lampLights[n].userData.on = true;
    n++;
  }
  for (; n < lampLights.length; n++) lampLights[n].userData.on = false;
}

function label(text, x, y, z, cls = 'lbl') {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.set(x, y, z);
  G.labels.add(o);
}
function buildLabels() {
  clearGroup(G.labels);
  if (ui.view !== 'plan') return;
  for (const w of S.walls) {
    const i = wallInfo(w);
    const off = w.thickness / 2 + 0.28;
    label(`${fmt(i.L)} m`, i.ax + i.dx / 2 - i.uz * off, 0.1, i.az + i.dz / 2 + i.ux * off);
  }
  for (const f of S.floors) {
    const r = floorRect(f);
    const a = (r.x1 - r.x0) * (r.z1 - r.z0);
    if (a >= 2) label(`${fmt(a, 1)} m²`, (r.x0 + r.x1) / 2, 0.1, (r.z0 + r.z1) / 2, 'lbl area');
  }
}

// ================================================================ selección
let selHelper = null;
function selObj() {
  return ui.sel ? objs[ui.sel.kind]?.get(ui.sel.id) : null;
}
function attachSel() {
  if (selHelper) {
    scene.remove(selHelper);
    selHelper.geometry.dispose();
    selHelper = null;
  }
  const o = selObj();
  if (!o || ui.view === 'walk') return;
  selHelper = new THREE.BoxHelper(o, 0x2f6df6);
  selHelper.material.depthTest = false;
  selHelper.material.transparent = true;
  selHelper.renderOrder = 999;
  scene.add(selHelper);
}
function select(sel) {
  ui.sel = sel;
  attachSel();
  refreshProps();
}
function validateSel() {
  const s = ui.sel;
  if (!s) return;
  const ok = s.kind === 'item' ? findItem(s.id) : s.kind === 'wall' ? findWall(s.id)
    : s.kind === 'floor' ? findFloor(s.id) : findOpening(s.id);
  if (!ok) ui.sel = null;
}

// ================================================================ imán y choques
// Caja (AABB) que ocupa un mueble en el mundo según posición, giro y altura
function itemAABB(type, x, z, rot = 0, elev = 0) {
  const f = footprint(type), c = Math.cos(rot), s = Math.sin(rot);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const lx of [f.x0, f.x1]) for (const lz of [f.z0, f.z1]) {
    const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
    z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
  }
  return { x0, x1, z0, z1, y0: elev + f.y0, y1: elev + f.y1 };
}
// Tramos sólidos de las paredes rectas (los vanos de puerta quedan libres)
function wallBoxes() {
  const out = [];
  for (const w of S.walls) {
    const i = wallInfo(w), h = w.thickness / 2;
    const alongX = Math.abs(i.uz) < 1e-3, alongZ = Math.abs(i.ux) < 1e-3;
    if (!alongX && !alongZ) continue;
    let segs = [[-h, i.L + h]];
    for (const o of w.openings || []) {
      if (o.bottom > 0.05) continue;
      const a = o.t - o.w / 2, b = o.t + o.w / 2;
      segs = segs.flatMap(([s0, e0]) => (b <= s0 || a >= e0 ? [[s0, e0]] : [[s0, a], [b, e0]].filter(([p, q]) => q - p > 0.01)));
    }
    for (const [s0, e0] of segs) {
      const px = [i.ax + i.ux * s0, i.ax + i.ux * e0], pz = [i.az + i.uz * s0, i.az + i.uz * e0];
      out.push({
        x0: Math.min(...px) - (alongZ ? h : 0), x1: Math.max(...px) + (alongZ ? h : 0),
        z0: Math.min(...pz) - (alongX ? h : 0), z1: Math.max(...pz) + (alongX ? h : 0),
        y0: 0, y1: w.height, wall: true,
      });
    }
  }
  return out;
}
const SNAP = 0.15, EPS = 0.012;
const overlapY = (a, b) => a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS;
const overlapXZ = (a, b) => a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS;
function otherBoxes(type, b, exclude) {
  if (ITEM_MAP[type]?.flat) return [];
  const out = [];
  for (const it of S.items) {
    if (it.id === exclude || ITEM_MAP[it.type]?.flat || !ITEM_MAP[it.type]) continue;
    const o = itemAABB(it.type, it.x, it.z, it.rot || 0, it.elev || 0);
    if (overlapY(b, o)) { o.name = ITEM_MAP[it.type].name; out.push(o); }
  }
  return out;
}
// Pega el mueble a paredes y muebles cercanos (bordes a menos de 15 cm)
function snapItem(type, x, z, rot, elev, exclude) {
  const b = itemAABB(type, x, z, rot, elev);
  let dx = null, dz = null;
  const tx = (d) => { if (Math.abs(d) < SNAP && (dx === null || Math.abs(d) < Math.abs(dx))) dx = d; };
  const tz = (d) => { if (Math.abs(d) < SNAP && (dz === null || Math.abs(d) < Math.abs(dz))) dz = d; };
  for (const o of [...wallBoxes(), ...otherBoxes(type, b, exclude)]) {
    if (b.z0 < o.z1 && b.z1 > o.z0) {
      tx(o.x0 - b.x1); tx(o.x1 - b.x0);
      if (!o.wall) { tx(o.x0 - b.x0); tx(o.x1 - b.x1); }
    }
    if (b.x0 < o.x1 && b.x1 > o.x0) {
      tz(o.z0 - b.z1); tz(o.z1 - b.z0);
      if (!o.wall) { tz(o.z0 - b.z0); tz(o.z1 - b.z1); }
    }
  }
  return [x + (dx || 0), z + (dz || 0)];
}
// Devuelve con qué choca el mueble (o null)
function collision(type, x, z, rot, elev, exclude) {
  if (ITEM_MAP[type]?.flat) return null;
  const b = itemAABB(type, x, z, rot, elev);
  for (const w of wallBoxes()) if (overlapXZ(b, w) && overlapY(b, w)) return 'una pared';
  for (const o of otherBoxes(type, b, exclude)) if (overlapXZ(b, o)) return o.name;
  return null;
}
function warnCollision(e, hit) {
  if (hit) showMeasure(e, `Choca con ${hit.toLowerCase().startsWith('una') ? hit : hit.toLowerCase()}`);
  else hideMeasure();
  measure.classList.toggle('bad', !!hit);
}

// ================================================================ puntero
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const ground = new THREE.Plane(new V3(0, 1, 0), 0);
function setRay(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, cam());
}
function groundAt(e) {
  setRay(e);
  const p = new V3();
  return ray.ray.intersectPlane(ground, p) ? p : null;
}
function pickAt(e, groups = [G.items, G.walls, G.floors]) {
  setRay(e);
  for (const h of ray.intersectObjects(groups, true)) {
    let o = h.object;
    while (o && !o.userData.kind) o = o.parent;
    if (o) return { kind: o.userData.kind, id: o.userData.id, obj: o, point: h.point };
  }
  return null;
}
function snapWallPt(p, from) {
  let x = snap(p.x, 0.25), z = snap(p.z, 0.25), best = 0.35, hit = false;
  for (const w of S.walls) for (const q of [w.a, w.b]) {
    const d = Math.hypot(p.x - q[0], p.z - q[1]);
    if (d < best) { best = d; x = q[0]; z = q[1]; hit = true; }
  }
  if (from && !hit) {
    if (Math.abs(x - from[0]) < 0.4) x = from[0];
    if (Math.abs(z - from[1]) < 0.4) z = from[1];
  }
  return [x, z];
}

const measure = $('#measure');
function showMeasure(e, text) {
  measure.textContent = text;
  measure.style.left = e.clientX + 'px';
  measure.style.top = e.clientY + 'px';
  measure.style.display = 'block';
}
function hideMeasure() { measure.style.display = 'none'; }

let down = null, dragging = null;

function onDown(e) {
  if (ui.view === 'walk') {
    if (walk.active && !document.pointerLockElement) { walk.looking = true; walk.lx = e.clientX; walk.ly = e.clientY; }
    return;
  }
  closeMenu();
  if (e.button !== 0) return;
  const ctl = ui.view === '3d' ? controls3d : controls2d;
  down = { x: e.clientX, y: e.clientY, moved: false, empty: false };
  const t = ui.tool;

  if (t === 'select') {
    const h = pickAt(e);
    if (h?.kind === 'item') {
      select({ kind: 'item', id: h.id });
      const it = findItem(h.id), gp = groundAt(e);
      if (gp) {
        dragging = { id: h.id, before: JSON.stringify(S), off: [it.x - gp.x, it.z - gp.z], pos: null };
        ctl.enabled = false;
        canvas.setPointerCapture(e.pointerId);
      }
    } else if (h) {
      select({ kind: h.kind, id: h.id });
    } else {
      down.empty = true;
    }
    return;
  }

  ctl.enabled = false;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignorar */ }
  const gp = groundAt(e);
  if (!gp) return;

  if (t === 'wall') {
    const p = snapWallPt(gp, ui.draft?.a);
    if (!ui.draft) ui.draft = { type: 'wall', a: p, b: p };
    else {
      const a = ui.draft.a;
      if (Math.hypot(p[0] - a[0], p[1] - a[1]) > 0.2) {
        commit(() => S.walls.push(newWall(a, p)));
        ui.draft = { type: 'wall', a: p, b: p };
      }
    }
    renderDraft();
  } else if (t === 'room' || t === 'floor') {
    const p = [snap(gp.x, 0.25), snap(gp.z, 0.25)];
    ui.draft = { type: t, a: p, b: p };
    renderDraft();
  } else if (t === 'door' || t === 'window') {
    if (hoverOpening?.valid) {
      const h = hoverOpening, d = OPENINGS[h.kind];
      commit(() => findWall(h.wallId).openings.push({ id: nid('o'), kind: h.kind, t: h.t, w: d.w, bottom: d.bottom, top: d.top }));
      ghostOpening.visible = false;
      hoverOpening = null;
    } else toast('Coloca el cursor sobre una pared con espacio libre');
  } else if (t === 'place') {
    updateGhost(e);
    placeItem(e.shiftKey);
  }
}

let lastHover = 0;
function onMove(e) {
  if (ui.view === 'walk') {
    if (walk.looking) {
      walk.yaw -= (e.clientX - walk.lx) * 0.005;
      walk.pitch = clamp(walk.pitch - (e.clientY - walk.ly) * 0.005, -1.4, 1.4);
      walk.lx = e.clientX; walk.ly = e.clientY;
    }
    return;
  }
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
  const t = ui.tool;

  if (dragging) {
    const gp = groundAt(e);
    if (!gp) return;
    const free = e.altKey, it = findItem(dragging.id);
    let nx = free ? gp.x + dragging.off[0] : snap(gp.x + dragging.off[0], 0.05);
    let nz = free ? gp.z + dragging.off[1] : snap(gp.z + dragging.off[1], 0.05);
    if (!free) [nx, nz] = snapItem(it.type, nx, nz, it.rot || 0, it.elev || 0, it.id);
    const hit = collision(it.type, nx, nz, it.rot || 0, it.elev || 0, it.id);
    selHelper?.material.color.set(hit ? 0xef4444 : 0x2f6df6);
    warnCollision(e, hit);
    const o = objs.item.get(dragging.id);
    o.position.x = nx;
    o.position.z = nz;
    dragging.pos = [nx, nz];
    selHelper?.update();
    return;
  }

  if (t === 'select') {
    const now = performance.now();
    if (now - lastHover < 40 || e.buttons) return;
    lastHover = now;
    const h = pickAt(e);
    canvas.style.cursor = h?.kind === 'item' ? 'grab' : h ? 'pointer' : '';
    return;
  }

  const gp = groundAt(e);
  if (!gp) return;
  if (t === 'wall') {
    const p = snapWallPt(gp, ui.draft?.a);
    cursorDot.position.set(p[0], 0.03, p[1]);
    cursorDot.visible = true;
    if (ui.draft) {
      ui.draft.b = p;
      renderDraft();
      showMeasure(e, `${fmt(Math.hypot(p[0] - ui.draft.a[0], p[1] - ui.draft.a[1]))} m`);
    }
  } else if (t === 'room' || t === 'floor') {
    const p = [snap(gp.x, 0.25), snap(gp.z, 0.25)];
    cursorDot.position.set(p[0], 0.03, p[1]);
    cursorDot.visible = true;
    if (ui.draft && down) {
      ui.draft.b = p;
      renderDraft();
      const w = Math.abs(p[0] - ui.draft.a[0]), d = Math.abs(p[1] - ui.draft.a[1]);
      showMeasure(e, `${fmt(w)} × ${fmt(d)} m · ${fmt(w * d, 1)} m²`);
    }
  } else if (t === 'door' || t === 'window') {
    updateOpeningGhost(e);
  } else if (t === 'place') {
    updateGhost(e);
  }
}

function onUp(e) {
  if (ui.view === 'walk') { walk.looking = false; return; }
  if (dragging) {
    if (dragging.pos) {
      const it = findItem(dragging.id);
      pushUndo(dragging.before);
      [it.x, it.z] = dragging.pos;
      changed();
    }
    dragging = null;
    hideMeasure();
  }
  const d = ui.draft;
  if (d && (d.type === 'room' || d.type === 'floor') && down) {
    const x0 = Math.min(d.a[0], d.b[0]), x1 = Math.max(d.a[0], d.b[0]);
    const z0 = Math.min(d.a[1], d.b[1]), z1 = Math.max(d.a[1], d.b[1]);
    ui.draft = null;
    renderDraft();
    hideMeasure();
    if (x1 - x0 >= 0.5 && z1 - z0 >= 0.5) {
      commit(() => {
        if (d.type === 'room') {
          S.walls.push(newWall([x0, z0], [x1, z0]), newWall([x1, z0], [x1, z1]), newWall([x1, z1], [x0, z1]), newWall([x0, z1], [x0, z0]));
        }
        S.floors.push({ id: nid('f'), x0, z0, x1, z1, mat: ui.floorMat });
      });
      toast(d.type === 'room' ? 'Habitación creada' : 'Piso agregado');
    }
  }
  if (down?.empty && !down.moved) select(null);
  down = null;
  restoreControls();
}

function newWall(a, b) {
  return { id: nid('w'), a: [...a], b: [...b], thickness: ui.wallTh, height: ui.wallH, color: '#f3efe8', openings: [] };
}

function renderDraft() {
  clearGroup(G.draft);
  const d = ui.draft;
  if (!d) return;
  if (d.type === 'wall') {
    if (d.a[0] !== d.b[0] || d.a[1] !== d.b[1]) {
      G.draft.add(buildWall({ a: d.a, b: d.b, thickness: ui.wallTh, height: ui.view === 'plan' ? 0.3 : ui.wallH, openings: [] }, Infinity, true));
    }
    return;
  }
  const f = { id: 'draft', x0: d.a[0], z0: d.a[1], x1: d.b[0], z1: d.b[1], mat: ui.floorMat };
  const fm = buildFloor(f, 40, true);
  fm.position.y = 0.02;
  G.draft.add(fm);
  if (d.type === 'room') {
    const [x0, z0] = d.a, [x1, z1] = d.b;
    for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]]) {
      if (a[0] === b[0] && a[1] === b[1]) continue;
      G.draft.add(buildWall({ a, b, thickness: ui.wallTh, height: ui.view === 'plan' ? 0.3 : ui.wallH, openings: [] }, Infinity, true));
    }
  }
}
function endDraft() {
  ui.draft = null;
  renderDraft();
  hideMeasure();
}

// ---------------------------------------------------- puertas y ventanas
let hoverOpening = null;
function updateOpeningGhost(e) {
  ghostOpening.visible = false;
  hoverOpening = null;
  const h = pickAt(e, [G.walls]);
  if (!h || h.kind !== 'wall') return;
  const w = findWall(h.id);
  const i = wallInfo(w);
  const kind = ui.tool === 'door' ? ui.opening : ui.winKind;
  const d = OPENINGS[kind];
  let t = snap((h.point.x - i.ax) * i.ux + (h.point.z - i.az) * i.uz, 0.05);
  const fits = i.L >= d.w + 0.2;
  t = clamp(t, d.w / 2 + 0.1, i.L - d.w / 2 - 0.1);
  const free = (w.openings || []).every((o) => Math.abs(o.t - t) >= (o.w + d.w) / 2 + 0.05);
  const valid = fits && free && d.top <= w.height;
  const dh = ui.view === '3d' && ui.cut ? Math.min(1.15, w.height) : w.height;
  const top = Math.min(d.top, dh + 0.3);
  ghostOpening.scale.set(d.w, Math.max(0.1, top - d.bottom), w.thickness + 0.08);
  ghostOpening.position.set(i.ax + i.ux * t, (top + d.bottom) / 2, i.az + i.uz * t);
  ghostOpening.rotation.y = -i.angle;
  ghostOpening.material.color.set(valid ? '#22c55e' : '#ef4444');
  ghostOpening.visible = true;
  hoverOpening = { wallId: w.id, t, valid, kind };
  showMeasure(e, valid ? `${d.name} · ${fmt(d.w)} m` : 'No cabe aquí');
}

// ---------------------------------------------------- colocar muebles
function makeGhost() {
  if (ghost) scene.remove(ghost);
  ghost = buildItem(ui.place, ITEM_MAP[ui.place].color);
  ghost.traverse((o) => { if (o.isMesh) { o.material = ghostMat; o.castShadow = false; } });
  ghost.visible = false;
  ghost.rotation.y = ui.placeRot;
  scene.add(ghost);
}
function updateGhost(e) {
  if (!ghost) return;
  const gp = groundAt(e);
  if (!gp) return;
  const elev = ITEM_MAP[ui.place].elev || 0;
  let x = e.altKey ? gp.x : snap(gp.x, 0.05), z = e.altKey ? gp.z : snap(gp.z, 0.05);
  if (!e.altKey) [x, z] = snapItem(ui.place, x, z, ui.placeRot, elev, null);
  ghost.position.set(x, elev, z);
  ghost.visible = true;
  const hit = collision(ui.place, x, z, ui.placeRot, elev, null);
  ghostMat.color.set(hit ? '#ef4444' : '#3b82f6');
  warnCollision(e, hit);
}
function startPlace(type) {
  setTool('place');
  ui.place = type;
  ui.placeRot = 0;
  makeGhost();
  renderCatalog();
  refreshHint();
}
function placeItem(keep) {
  if (!ghost?.visible) return;
  const def = ITEM_MAP[ui.place];
  const it = {
    id: nid('i'), type: ui.place, x: ghost.position.x, z: ghost.position.z,
    rot: ui.placeRot, color: def.color, elev: def.elev || 0,
  };
  commit(() => S.items.push(it));
  if (!keep) {
    setTool('select');
    select({ kind: 'item', id: it.id });
  }
}

// ---------------------------------------------------- acciones de edición
function del() {
  const s = ui.sel;
  if (!s) return;
  commit(() => {
    if (s.kind === 'item') S.items = S.items.filter((i) => i.id !== s.id);
    else if (s.kind === 'wall') S.walls = S.walls.filter((w) => w.id !== s.id);
    else if (s.kind === 'floor') S.floors = S.floors.filter((f) => f.id !== s.id);
    else if (s.kind === 'opening') {
      const r = findOpening(s.id);
      if (r) r.wall.openings = r.wall.openings.filter((o) => o.id !== s.id);
    }
  });
  select(null);
}
function rotate(a) {
  if (ui.tool === 'place') {
    ui.placeRot += a;
    if (ghost) ghost.rotation.y = ui.placeRot;
    return;
  }
  if (ui.sel?.kind !== 'item') return;
  commit(() => {
    const it = findItem(ui.sel.id);
    it.rot = Math.round((((it.rot || 0) + a) % (Math.PI * 2)) * 1e4) / 1e4;
  });
}
function duplicate() {
  if (ui.sel?.kind !== 'item') return;
  const src = findItem(ui.sel.id);
  const it = { ...src, id: nid('i'), x: src.x + 0.4, z: src.z + 0.4 };
  commit(() => S.items.push(it));
  select({ kind: 'item', id: it.id });
}

// ================================================================ vistas
function setView(v) {
  if (v === ui.view) return;
  if (ui.view === 'walk') stopWalk();
  ui.view = v;
  endDraft();
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  app.classList.toggle('walking', v === 'walk');
  grid.visible = ui.grid && v !== 'walk';
  if (v === 'walk') {
    setTool('select');
    startWalkScreen();
  }
  restoreControls();
  rebuild();
  refreshProps();
  refreshHint();
  requestAnimationFrame(resize);
}

// ---------------------------------------------------- recorrido
const walk = { active: false, yaw: 0, pitch: 0, looking: false, lx: 0, ly: 0, vel: new V3() };
const keys = {};
function startWalkScreen() {
  const b = bounds(), c = b.getCenter(new V3());
  walkCam.position.set(c.x, 1.6, b.max.z + 3);
  walk.yaw = 0;
  walk.pitch = -0.05;
  $('#walk').hidden = false;
  $('.walk-exit').hidden = false;
}
function beginWalk() {
  walk.active = true;
  $('#walk').hidden = true;
  $('.crosshair').hidden = false;
  if (matchMedia('(pointer: coarse)').matches) $('.dpad').hidden = false;
  try {
    const p = canvas.requestPointerLock?.();
    if (p?.catch) p.catch(() => {});
  } catch { /* usar arrastre para mirar */ }
}
function pauseWalk() {
  walk.active = false;
  $('#walk').hidden = false;
  $('.crosshair').hidden = true;
  $('.dpad').hidden = true;
}
function stopWalk() {
  walk.active = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('#walk').hidden = true;
  $('.crosshair').hidden = true;
  $('.dpad').hidden = true;
  $('.walk-exit').hidden = true;
  for (const k in keys) keys[k] = false;
}
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && ui.view === 'walk' && walk.active) pauseWalk();
});
document.addEventListener('mousemove', (e) => {
  if (ui.view !== 'walk' || !walk.active || document.pointerLockElement !== canvas) return;
  walk.yaw -= e.movementX * 0.0022;
  walk.pitch = clamp(walk.pitch - e.movementY * 0.0022, -1.4, 1.4);
});
function collide(p, r = 0.25) {
  for (let pass = 0; pass < 2; pass++) {
    for (const w of S.walls) {
      const i = wallInfo(w), ext = w.thickness / 2;
      let t = (p.x - i.ax) * i.ux + (p.z - i.az) * i.uz;
      t = clamp(t, -ext, i.L + ext);
      const gap = (w.openings || []).some((o) => OPENINGS[o.kind]?.type === 'door' && t > o.t - o.w / 2 + 0.05 && t < o.t + o.w / 2 - 0.05);
      if (gap) continue;
      const cx = i.ax + i.ux * t, cz = i.az + i.uz * t;
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), min = r + w.thickness / 2;
      if (d < min) {
        if (d < 1e-5) { p.x += -i.uz * min; p.z += i.ux * min; }
        else { p.x = cx + (dx / d) * min; p.z = cz + (dz / d) * min; }
      }
    }
  }
}
function updateWalk(dt) {
  walkCam.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  if (!walk.active) return;
  const f = new V3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
  const r = new V3(Math.cos(walk.yaw), 0, -Math.sin(walk.yaw));
  const m = new V3();
  if (keys.KeyW || keys.ArrowUp) m.add(f);
  if (keys.KeyS || keys.ArrowDown) m.sub(f);
  if (keys.KeyD || keys.ArrowRight) m.add(r);
  if (keys.KeyA || keys.ArrowLeft) m.sub(r);
  const speed = keys.ShiftLeft || keys.ShiftRight ? 4.2 : 2.2;
  if (m.lengthSq()) m.normalize().multiplyScalar(speed);
  walk.vel.lerp(m, 1 - Math.exp(-dt * 10));
  walkCam.position.addScaledVector(walk.vel, dt);
  collide(walkCam.position);
  walkCam.position.x = clamp(walkCam.position.x, -80, 80);
  walkCam.position.z = clamp(walkCam.position.z, -80, 80);
  walkCam.position.y = 1.6 + Math.sin(performance.now() * 0.009) * 0.025 * Math.min(walk.vel.length() / 2, 1);
}
document.querySelectorAll('.dpad button').forEach((b) => {
  const k = b.dataset.key;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[k] = true; });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { keys[k] = false; });
});

// ---------------------------------------------------- día / noche
let dayV = 1, dayApplied = -1;
const C_SUN_D = new THREE.Color('#fff1dd'), C_SUN_N = new THREE.Color('#8fa6ff');
const SKY = {
  top: [new THREE.Color('#6fa6dc'), new THREE.Color('#050b1d')],
  bot: [new THREE.Color('#eaf2f7'), new THREE.Color('#1a2442')],
};
function applyDay(v) {
  if (Math.abs(v - dayApplied) < 0.002) return;
  dayApplied = v;
  const n = 1 - v;
  sun.intensity = 0.12 + 2.58 * v;
  sun.color.copy(C_SUN_N).lerp(C_SUN_D, v);
  hemi.intensity = 0.12 + 0.98 * v;
  skyU.uTop.value.copy(SKY.top[1]).lerp(SKY.top[0], v);
  skyU.uBot.value.copy(SKY.bot[1]).lerp(SKY.bot[0], v);
  scene.fog.color.copy(skyU.uBot.value);
  scene.environmentIntensity = 0.06 + 0.29 * v;
  for (const m of lampMats) m.emissiveIntensity = n * 2.5;
  for (const l of lampLights) l.intensity = l.userData.on ? n * 9 : 0;
}

// ================================================================ UI
const TOOL_HINT = {
  select: 'Clic para seleccionar · arrastra un mueble para moverlo: se pega a paredes y muebles (Alt = libre) · R girar · Supr borrar · clic derecho o arrastrar vacío para girar la cámara',
  wall: 'Clic para empezar, clic en cada esquina · doble clic, Enter o Esc para terminar · clic derecho para girar la cámara',
  room: 'Arrastra para dibujar una habitación completa: 4 paredes + piso',
  floor: 'Arrastra para pintar un piso con el material elegido',
  door: 'Pasa el cursor sobre una pared y haz clic para colocar la puerta',
  window: 'Pasa el cursor sobre una pared y haz clic para colocar la ventana',
  place: 'Clic para colocar (se pega a paredes y muebles; rojo = choca) · R girar 90° (Shift+R 15°) · Shift+clic para colocar varios · Esc cancelar',
};
function refreshHint() {
  $('#hint').textContent = ui.view === 'walk'
    ? 'Recorrido: WASD o flechas para caminar, mouse para mirar, Shift para correr'
    : ui.view === 'plan' && ui.tool === 'select'
      ? 'Plano 2D: arrastra el fondo para desplazarte, rueda para zoom · clic para seleccionar · arrastra muebles para moverlos'
      : TOOL_HINT[ui.tool];
}
function refreshStats() {
  let area = 0;
  for (const f of S.floors) {
    if (f.mat === 'pasto' || f.mat === 'concreto') continue;
    const r = floorRect(f);
    area += (r.x1 - r.x0) * (r.z1 - r.z0);
  }
  $('#stats').textContent = `${S.walls.length} paredes · ${S.items.length} objetos · ${fmt(area, 1)} m² construidos`;
}

function setTool(t) {
  if (t !== 'place') {
    if (ghost) { scene.remove(ghost); ghost = null; }
    ui.place = null;
  }
  endDraft();
  ui.tool = t;
  ghostOpening.visible = false;
  hoverOpening = null;
  cursorDot.visible = false;
  canvas.style.cursor = t === 'select' ? '' : 'crosshair';
  if (t !== 'select') ui.sel = null, attachSel();
  document.querySelectorAll('.tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  renderCatalog();
  refreshProps();
  refreshHint();
}

// ---------------------------------------------------- catálogo
const thumbs = {};
function renderCatalog() {
  $('#chips').innerHTML = ['Todos', ...CATS]
    .map((c) => `<button data-cat="${c}" class="${c === ui.cat ? 'on' : ''}">${c}</button>`).join('');
  const q = ui.q.trim().toLowerCase();
  const list = ITEMS.filter((d) => (ui.cat === 'Todos' || d.cat === ui.cat) && (!q || d.name.toLowerCase().includes(q)));
  $('#cards').innerHTML = list.map((d) => `
    <button class="card ${ui.place === d.id ? 'on' : ''}" data-item="${d.id}" title="${d.name}">
      ${thumbs[d.id] ? `<img src="${thumbs[d.id]}" alt="">` : '<div class="ph"></div>'}
      <span>${d.name}</span>
    </button>`).join('') || '<p class="muted">Sin resultados</p>';
}
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (b) { ui.cat = b.dataset.cat; renderCatalog(); }
});
$('#cards').addEventListener('click', (e) => {
  const b = e.target.closest('[data-item]');
  if (!b) return;
  if (ui.view === 'walk') setView('3d');
  startPlace(b.dataset.item);
  if (matchMedia('(max-width: 900px)').matches) app.classList.add('no-cat');
});
$('#search').addEventListener('input', (e) => { ui.q = e.target.value; renderCatalog(); });

function generateThumbs() {
  let r2;
  try {
    r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { return; }
  r2.setSize(160, 160);
  r2.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r2);
  sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  sc.environmentIntensity = 0.6;
  sc.add(new THREE.HemisphereLight('#ffffff', '#8a8070', 1.4));
  const dl = new THREE.DirectionalLight('#ffffff', 2.2);
  dl.position.set(3, 5, 4);
  sc.add(dl);
  const c2 = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
  for (const d of ITEMS) {
    const g = buildItem(d.id, d.color);
    sc.add(g);
    const b = new THREE.Box3().setFromObject(g);
    const ctr = b.getCenter(new V3()), sz = b.getSize(new V3());
    const dist = sz.length() * 1.55 + 0.2;
    c2.position.copy(ctr).add(new V3(0.62, 0.5, 1).normalize().multiplyScalar(dist));
    c2.lookAt(ctr);
    r2.render(sc, c2);
    thumbs[d.id] = r2.domElement.toDataURL('image/png');
    sc.remove(g);
  }
  pm.dispose();
  r2.dispose();
  r2.forceContextLoss?.();
}

// ---------------------------------------------------- propiedades
const props = $('#props');
const swatches = (list, cur, key) => `<div class="sw">${list.map((c) =>
  `<button style="--c:${c}" data-p="${key}" data-v="${c}" class="${c.toLowerCase() === (cur || '').toLowerCase() ? 'on' : ''}" title="${c}"></button>`).join('')}
  <label class="custom" title="Color personalizado"><input type="color" data-p="${key}" value="${cur || '#ffffff'}"></label></div>`;
const opts = (list, cur, key) => `<div class="opts">${list.map(([v, l]) =>
  `<button data-p="${key}" data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const matsGrid = (cur, key) => `<div class="mats">${Object.entries(FLOOR_MATS).map(([k, f]) =>
  `<button data-p="${key}" data-v="${k}" class="${k === cur ? 'on' : ''}"><img src="${floorPreview(k)}" alt=""><span>${f.name}</span></button>`).join('')}</div>`;
const ICON = {
  wall: '<svg viewBox="0 0 24 24"><path d="M3 7h18v10H3z"/><path d="M3 12h18M9 7v5M15 12v5"/></svg>',
  floor: '<svg viewBox="0 0 24 24"><path d="M3 16 12 20l9-4-9-4z"/></svg>',
  door: '<svg viewBox="0 0 24 24"><path d="M6 21V4h12v17"/><circle cx="15" cy="13" r="1"/></svg>',
  window: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/></svg>',
};
const TH_OPTS = [[0.1, '10 cm'], [0.15, '15 cm'], [0.2, '20 cm']];
const H_OPTS = [[2.4, '2.40 m'], [2.7, '2.70 m'], [3, '3.00 m']];

function refreshProps() {
  let html = '';
  const s = ui.sel;
  if (ui.view === 'walk') html = '';
  else if (s?.kind === 'item') {
    const it = findItem(s.id), def = ITEM_MAP[it.type];
    const deg = Math.round((((it.rot || 0) * 180) / Math.PI % 360 + 360) % 360);
    const fp = footprint(it.type);
    const hit = collision(it.type, it.x, it.z, it.rot || 0, it.elev || 0, it.id);
    html = `<header>${thumbs[it.type] ? `<img src="${thumbs[it.type]}" alt="">` : ''}<div><h3>${def.name}</h3><p>${def.cat} · ${fmt(fp.x1 - fp.x0)} × ${fmt(fp.z1 - fp.z0)} × ${fmt(fp.y1 - fp.y0)} m</p></div></header>
      ${hit ? `<section class="warn">Este mueble choca con ${hit.toLowerCase().startsWith('una') ? hit : hit.toLowerCase()}. Arrástralo o gíralo para acomodarlo.</section>` : ''}
      <section><label class="t">Color</label>${swatches(FURN_SWATCHES, it.color || def.color, 'item-color')}</section>
      <section><label class="t">Rotación <b>${deg}°</b></label>
        <div class="row"><button data-p="rot" data-v="-90">↺ 90°</button><button data-p="rot" data-v="-15">−15°</button><button data-p="rot" data-v="15">+15°</button><button data-p="rot" data-v="90">90° ↻</button></div></section>
      <section><label class="t">Altura sobre el piso <b id="elev-v">${fmt(it.elev || 0)} m</b></label>
        <input type="range" min="0" max="2.4" step="0.01" value="${it.elev || 0}" data-p="elev"></section>
      <section><div class="row"><button data-p="dup">Duplicar</button><button data-p="del" class="danger">Eliminar</button></div></section>`;
  } else if (s?.kind === 'wall') {
    const w = findWall(s.id);
    html = `<header><div class="ico">${ICON.wall}</div><div><h3>Pared</h3><p>${fmt(wallInfo(w).L)} m de largo · ${(w.openings || []).length} aberturas</p></div></header>
      <section><label class="t">Color de pintura</label>${swatches(WALL_SWATCHES, w.color, 'wall-color')}
        <div class="row" style="margin-top:10px"><button data-p="all-walls">Aplicar a todas las paredes</button></div></section>
      <section><label class="t">Grosor</label>${opts(TH_OPTS, w.thickness, 'wall-th')}</section>
      <section><label class="t">Altura</label>${opts(H_OPTS, w.height, 'wall-h')}</section>
      <section><div class="row"><button data-p="del" class="danger">Eliminar pared</button></div></section>`;
  } else if (s?.kind === 'opening') {
    const { op } = findOpening(s.id), d = OPENINGS[op.kind];
    const list = Object.entries(OPENINGS).filter(([, o]) => o.type === d.type).map(([k, o]) => [k, o.name]);
    html = `<header><div class="ico">${ICON[d.type]}</div><div><h3>${d.name}</h3><p>${fmt(op.w)} m de ancho</p></div></header>
      <section><label class="t">Tipo</label>${opts(list, op.kind, 'op-kind')}</section>
      <section><label class="t">Ancho <b id="opw-v">${fmt(op.w)} m</b></label>
        <input type="range" min="0.5" max="3" step="0.05" value="${op.w}" data-p="op-w"></section>
      <section><div class="row"><button data-p="del" class="danger">Eliminar</button></div></section>`;
  } else if (s?.kind === 'floor') {
    const f = findFloor(s.id), r = floorRect(f);
    html = `<header><div class="ico">${ICON.floor}</div><div><h3>Piso · ${FLOOR_MATS[f.mat]?.name || ''}</h3><p>${fmt(r.x1 - r.x0)} × ${fmt(r.z1 - r.z0)} m · ${fmt((r.x1 - r.x0) * (r.z1 - r.z0), 1)} m²</p></div></header>
      <section><label class="t">Material</label>${matsGrid(f.mat, 'floor-mat')}</section>
      <section><div class="row"><button data-p="del" class="danger">Eliminar piso</button></div></section>`;
  } else if (ui.tool === 'wall' || ui.tool === 'room') {
    html = `<header><div class="ico">${ICON.wall}</div><div><h3>${ui.tool === 'wall' ? 'Nueva pared' : 'Nueva habitación'}</h3><p>Opciones para lo que dibujes</p></div></header>
      <section><label class="t">Grosor</label>${opts(TH_OPTS, ui.wallTh, 'tool-th')}</section>
      <section><label class="t">Altura</label>${opts(H_OPTS, ui.wallH, 'tool-h')}</section>
      ${ui.tool === 'room' ? `<section><label class="t">Piso</label>${matsGrid(ui.floorMat, 'tool-floor')}</section>` : ''}`;
  } else if (ui.tool === 'floor') {
    html = `<header><div class="ico">${ICON.floor}</div><div><h3>Nuevo piso</h3><p>Elige el material y arrastra</p></div></header>
      <section><label class="t">Material</label>${matsGrid(ui.floorMat, 'tool-floor')}</section>`;
  } else if (ui.tool === 'door' || ui.tool === 'window') {
    const type = ui.tool;
    const list = Object.entries(OPENINGS).filter(([, o]) => o.type === type).map(([k, o]) => [k, o.name]);
    html = `<header><div class="ico">${ICON[type]}</div><div><h3>${type === 'door' ? 'Puertas' : 'Ventanas'}</h3><p>Elige el tipo y haz clic en una pared</p></div></header>
      <section><label class="t">Tipo</label>${opts(list, type === 'door' ? ui.opening : ui.winKind, 'tool-op')}</section>`;
  }
  props.innerHTML = html;
  props.hidden = !html;
}

function applyProp(p, v) {
  const s = ui.sel;
  switch (p) {
    case 'item-color': findItem(s.id).color = v; break;
    case 'elev': findItem(s.id).elev = +v; break;
    case 'wall-color': findWall(s.id).color = v; break;
    case 'wall-th': findWall(s.id).thickness = +v; break;
    case 'wall-h': findWall(s.id).height = +v; break;
    case 'floor-mat': findFloor(s.id).mat = v; break;
    case 'op-w': {
      const { wall, op } = findOpening(s.id);
      op.w = Math.min(+v, wallInfo(wall).L - 0.2);
      break;
    }
    case 'op-kind': {
      const { op } = findOpening(s.id), d = OPENINGS[v];
      Object.assign(op, { kind: v, w: d.w, bottom: d.bottom, top: d.top });
      break;
    }
  }
}

props.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-p]');
  if (!b) return;
  const { p, v } = b.dataset;
  switch (p) {
    case 'rot': rotate((+v * Math.PI) / 180); break;
    case 'dup': duplicate(); break;
    case 'del': del(); break;
    case 'all-walls': {
      const c = findWall(ui.sel.id).color;
      commit(() => S.walls.forEach((w) => { w.color = c; }));
      toast('Color aplicado a todas las paredes');
      break;
    }
    case 'tool-th': ui.wallTh = +v; refreshProps(); break;
    case 'tool-h': ui.wallH = +v; refreshProps(); break;
    case 'tool-floor': ui.floorMat = v; refreshProps(); break;
    case 'tool-op':
      if (ui.tool === 'door') ui.opening = v; else ui.winKind = v;
      refreshProps();
      break;
    default: commit(() => applyProp(p, v));
  }
});
let liveBefore = null;
props.addEventListener('input', (e) => {
  const t = e.target;
  if (t.type !== 'range') return;
  if (!liveBefore) liveBefore = JSON.stringify(S);
  applyProp(t.dataset.p, t.value);
  rebuild();
  const out = t.dataset.p === 'elev' ? $('#elev-v') : $('#opw-v');
  if (out) out.textContent = `${fmt(+t.value)} m`;
});
props.addEventListener('change', (e) => {
  const t = e.target;
  if (t.type === 'range') {
    if (liveBefore) { pushUndo(liveBefore); liveBefore = null; }
    save();
    refreshProps();
  } else if (t.type === 'color') {
    commit(() => applyProp(t.dataset.p, t.value));
  }
});

// ---------------------------------------------------- barra superior
function closeMenu() { $('#filemenu').hidden = true; }
function download(name, url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
const ACTIONS = {
  undo, redo,
  cut: () => { ui.cut = !ui.cut; $('[data-act="cut"]').classList.toggle('on', ui.cut); rebuild(); toast(ui.cut ? 'Paredes cortadas: ves adentro' : 'Paredes completas'); },
  grid: () => { ui.grid = !ui.grid; grid.visible = ui.grid && ui.view !== 'walk'; $('[data-act="grid"]').classList.toggle('on', ui.grid); },
  day: () => { ui.day = !ui.day; $('[data-act="day"]').classList.toggle('on', ui.day); },
  catalog: () => { app.classList.toggle('no-cat'); $('[data-act="catalog"]').classList.toggle('on', !app.classList.contains('no-cat')); requestAnimationFrame(resize); },
  menu: () => { $('#filemenu').hidden = !$('#filemenu').hidden; },
  new: () => { commit(() => { S = { walls: [], floors: [], items: [] }; }); select(null); toast('Diseño vacío · Ctrl+Z para deshacer'); setTool('room'); },
  example: () => { commit(() => { S = exampleHouse(nid); }); select(null); fitView(); toast('Casa de ejemplo cargada'); },
  export: async () => {
    if (EMBED) {
      try {
        await navigator.clipboard.writeText(JSON.stringify(S));
        toast('Diseño copiado al portapapeles · pégalo en un archivo .json para guardarlo');
      } catch { toast('No se pudo copiar el diseño en esta vista'); }
      return;
    }
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    download('mi-casa.json', url);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  import: () => $('#file').click(),
  shot: () => {
    if (EMBED) return toast('Las capturas se descargan en la versión publicada en GitHub');
    const hadSel = selHelper?.visible;
    if (selHelper) selHelper.visible = false;
    renderer.render(scene, cam());
    download('mi-casa.png', canvas.toDataURL('image/png'));
    if (selHelper) selHelper.visible = hadSel;
  },
  'walk-start': beginWalk,
  'walk-exit': () => setView('3d'),
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && ACTIONS[b.dataset.act]) {
    if (b.closest('#filemenu')) closeMenu();
    ACTIONS[b.dataset.act]();
  } else if (!e.target.closest('.menu')) closeMenu();
  const t = e.target.closest('.tools [data-tool]');
  if (t) {
    if (ui.view === 'walk') setView('3d');
    setTool(t.dataset.tool);
  }
  const v = e.target.closest('#views [data-view]');
  if (v) setView(v.dataset.view);
});
$('#file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!Array.isArray(j.walls) || !Array.isArray(j.items) || !Array.isArray(j.floors)) throw new Error();
    commit(() => { S = j; });
    select(null);
    fitView();
    toast('Diseño importado');
  } catch {
    toast('Ese archivo no es un diseño válido');
  }
});

// ---------------------------------------------------- teclado
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return;
  if (ui.view === 'walk') {
    keys[e.code] = true;
    if (e.code === 'Escape' && walk.active) pauseWalk();
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    return;
  }
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
  if (mod) return;
  if (k === 'escape') {
    if (ui.draft) endDraft();
    else if (ui.tool !== 'select') setTool('select');
    else select(null);
  } else if (k === 'enter' && ui.draft) endDraft();
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); del(); }
  else if (k === 'r') rotate(e.shiftKey ? Math.PI / 12 : Math.PI / 2);
  else if (k === 'g') ACTIONS.grid();
  else if (k === 'v' || k === '1') setTool('select');
  else if (k === '2') setTool('wall');
  else if (k === '3') setTool('room');
  else if (k === '4') setTool('floor');
  else if (k === '5') setTool('door');
  else if (k === '6') setTool('window');
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

// ================================================================ bucle
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  dayV += ((ui.day ? 1 : 0) - dayV) * (1 - Math.exp(-dt * 4));
  applyDay(dayV);
  if (ui.view === 'walk') updateWalk(dt);
  else (ui.view === '3d' ? controls3d : controls2d).update();
  const c = cam();
  renderer.render(scene, c);
  labelR.render(scene, c);
});

// ================================================================ inicio
if (matchMedia('(max-width: 900px)').matches) {
  app.classList.add('no-cat');
  $('[data-act="catalog"]').classList.remove('on');
}
restoreControls();
rebuild();
fitView();
renderCatalog();
refreshProps();
refreshHint();
refreshStats();
setTimeout(() => {
  generateThumbs();
  renderCatalog();
  refreshProps();
}, 60);

window.casa = { collision, get S() { return S; }, ui, setView, setTool, startPlace, select, commit, fitView, persp, controls3d, ortho, walkCam, walk, keys, beginWalk };
