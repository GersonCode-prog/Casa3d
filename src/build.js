import * as THREE from 'three';

export const WALL_SWATCHES = [
  '#f3efe8', '#ffffff', '#e9e3d6', '#d8d2c4', '#c9d6df', '#b9cbb5',
  '#e6c9b8', '#f0dca8', '#9fb3c8', '#7d8b7a', '#5e6b78', '#3d4450',
];

export const OPENINGS = {
  door: { name: 'Puerta', type: 'door', w: 0.9, bottom: 0, top: 2.1, leaves: 1 },
  doubledoor: { name: 'Puerta doble', type: 'door', w: 1.6, bottom: 0, top: 2.1, leaves: 2 },
  arch: { name: 'Vano libre', type: 'door', w: 1.2, bottom: 0, top: 2.2, leaves: 0 },
  window: { name: 'Ventana', type: 'window', w: 1.2, bottom: 0.9, top: 2.1 },
  high: { name: 'Ventana alta', type: 'window', w: 0.6, bottom: 1.5, top: 2.1 },
  big: { name: 'Ventanal', type: 'window', w: 2.2, bottom: 0.15, top: 2.3 },
};

// ------------------------------------------------------------ texturas
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cv(n = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return [c, c.getContext('2d')];
}
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (r, g, b) => `rgb(${Math.max(0, Math.min(255, r)) | 0},${Math.max(0, Math.min(255, g)) | 0},${Math.max(0, Math.min(255, b)) | 0})`;

function speckle(x, N, n, R, alpha = 0.06) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = R() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    x.fillRect(R() * N, R() * N, 1 + R() * 2, 1 + R() * 2);
  }
}

function wood(base, seed) {
  const N = 1024, [c, x] = cv(N), R = rng(seed);
  const rows = 8, ph = N / rows;
  for (let r = 0; r < rows; r++) {
    let px = -R() * N * 0.6;
    while (px < N) {
      const len = N * (0.3 + R() * 0.45), k = 0.84 + R() * 0.3;
      x.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k);
      x.fillRect(px, r * ph, len, ph);
      for (let i = 0; i < 22; i++) {
        const y = r * ph + 3 + R() * (ph - 6);
        x.strokeStyle = R() < 0.6 ? `rgba(50,30,12,${0.05 + R() * 0.12})` : `rgba(255,240,220,${0.04 + R() * 0.08})`;
        x.lineWidth = 0.6 + R() * 1.8;
        x.beginPath();
        x.moveTo(px, y);
        const f = 0.006 + R() * 0.01, amp = R() * 3;
        for (let s = 0; s <= len; s += 16) x.lineTo(px + s, y + Math.sin(s * f + i) * amp);
        x.stroke();
      }
      x.strokeStyle = 'rgba(25,15,6,.5)';
      x.lineWidth = 2;
      x.strokeRect(px + 1, r * ph + 1, len - 2, ph - 2);
      px += len;
    }
  }
  return c;
}

function tiles(col, grout, n, vary, seed, sheen = 0.05) {
  const N = 1024, [c, x] = cv(N), R = rng(seed), b = hx(col), s = N / n;
  x.fillStyle = grout;
  x.fillRect(0, 0, N, N);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = 1 + (R() - 0.5) * vary;
    x.fillStyle = rgb(b[0] * k, b[1] * k, b[2] * k);
    x.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    const gr = x.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
    gr.addColorStop(0, `rgba(255,255,255,${sheen})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr;
    x.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
  }
  speckle(x, N, 9000, R, 0.04);
  return c;
}

function marble() {
  const N = 1024, [c, x] = cv(N), R = rng(12);
  x.fillStyle = '#eeebe6';
  x.fillRect(0, 0, N, N);
  x.filter = 'blur(1.5px)';
  for (let v = 0; v < 26; v++) {
    let px = R() * N, py = R() * N, a = R() * Math.PI * 2;
    x.strokeStyle = `rgba(${110 + R() * 40},${110 + R() * 40},${115 + R() * 40},${0.12 + R() * 0.25})`;
    x.lineWidth = 0.6 + R() * 2.5;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 60; k++) {
      a += (R() - 0.5) * 0.6;
      px += Math.cos(a) * 14;
      py += Math.sin(a) * 14;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  x.filter = 'none';
  x.strokeStyle = 'rgba(150,150,150,.35)';
  x.lineWidth = 2;
  for (const p of [0, N / 2]) {
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, N); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(N, p); x.stroke();
  }
  return c;
}

function checker() {
  const N = 1024, [c, x] = cv(N), n = 4, s = N / n, R = rng(5);
  x.fillStyle = '#9a9a96';
  x.fillRect(0, 0, N, N);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.fillStyle = (i + j) % 2 ? '#2d3034' : '#f1f0ec';
    x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
  }
  speckle(x, N, 6000, R, 0.035);
  return c;
}

function carpet(col) {
  const N = 512, [c, x] = cv(N), R = rng(9), b = hx(col);
  x.fillStyle = col;
  x.fillRect(0, 0, N, N);
  for (let i = 0; i < 60000; i++) {
    const k = 0.8 + R() * 0.4;
    x.fillStyle = rgb(b[0] * k, b[1] * k, b[2] * k);
    x.fillRect(R() * N, R() * N, 1.5, 1.5);
  }
  return c;
}

function concrete() {
  const N = 1024, [c, x] = cv(N), R = rng(21);
  x.fillStyle = '#a9a8a3';
  x.fillRect(0, 0, N, N);
  for (let i = 0; i < 90; i++) {
    const r = 40 + R() * 160, px = R() * N, py = R() * N;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const d = R() < 0.5 ? '0,0,0' : '255,255,255';
    g.addColorStop(0, `rgba(${d},${0.03 + R() * 0.05})`);
    g.addColorStop(1, `rgba(${d},0)`);
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  speckle(x, N, 30000, R, 0.08);
  x.strokeStyle = 'rgba(60,60,60,.45)';
  x.lineWidth = 3;
  x.strokeRect(0, 0, N, N);
  return c;
}

function grass() {
  const N = 1024, [c, x] = cv(N), R = rng(33);
  x.fillStyle = '#5f8f43';
  x.fillRect(0, 0, N, N);
  for (let i = 0; i < 160; i++) {
    const r = 60 + R() * 180, px = R() * N, py = R() * N;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, R() < 0.5 ? 'rgba(120,160,70,.07)' : 'rgba(40,80,30,.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let i = 0; i < 45000; i++) {
    const px = R() * N, py = R() * N, l = 3 + R() * 7;
    x.strokeStyle = `rgba(${60 + R() * 70},${110 + R() * 70},${30 + R() * 40},${0.35 + R() * 0.4})`;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (R() - 0.5) * 3, py - l);
    x.stroke();
  }
  return c;
}

function toTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export const FLOOR_MATS = {
  madera: { name: 'Roble', tile: 2, rough: 0.55, make: () => wood([186, 138, 92], 1) },
  nogal: { name: 'Nogal', tile: 2, rough: 0.5, make: () => wood([112, 74, 50], 2) },
  ceramica: { name: 'Cerámica', tile: 2.4, rough: 0.45, make: () => tiles('#d9c6aa', '#b39f84', 4, 0.12, 3) },
  porcelanato: { name: 'Porcelanato', tile: 2.4, rough: 0.2, make: () => tiles('#e7e7e4', '#cbcbc6', 2, 0.04, 4, 0.12) },
  marmol: { name: 'Mármol', tile: 2.4, rough: 0.12, make: marble },
  damero: { name: 'Damero', tile: 1.2, rough: 0.25, make: checker },
  alfombra: { name: 'Alfombra', tile: 1.5, rough: 1, make: () => carpet('#8f969c') },
  concreto: { name: 'Concreto', tile: 3, rough: 0.9, make: concrete },
  pasto: { name: 'Jardín', tile: 3, rough: 1, make: grass },
};

export function floorMat(k) {
  const f = FLOOR_MATS[k] || FLOOR_MATS.madera;
  if (!f.mat) {
    f.canvas = f.make();
    f.mat = new THREE.MeshStandardMaterial({ map: toTex(f.canvas), roughness: f.rough, metalness: 0 });
  }
  return f.mat;
}

export function floorPreview(k) {
  const f = FLOOR_MATS[k];
  floorMat(k);
  if (!f.url) {
    const [c, x] = cv(120);
    c.height = 80;
    x.drawImage(f.canvas, 0, 0, f.canvas.width * 0.6, f.canvas.width * 0.4, 0, 0, 120, 80);
    f.url = c.toDataURL();
  }
  return f.url;
}

// ------------------------------------------------------------ pisos
export function floorRect(f) {
  return {
    x0: Math.min(f.x0, f.x1), x1: Math.max(f.x0, f.x1),
    z0: Math.min(f.z0, f.z1), z1: Math.max(f.z0, f.z1),
  };
}

export function buildFloor(f, i = 0, preview = false) {
  const { x0, x1, z0, z1 } = floorRect(f);
  const geo = new THREE.PlaneGeometry(Math.max(x1 - x0, 0.01), Math.max(z1 - z0, 0.01));
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0.01 + i * 0.0008, (z0 + z1) / 2);
  const tile = (FLOOR_MATS[f.mat] || FLOOR_MATS.madera).tile;
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / tile, -p.getZ(k) / tile);
  const material = preview
    ? new THREE.MeshBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.35, depthWrite: false })
    : floorMat(f.mat);
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  m.userData = { kind: 'floor', id: f.id, dispose: true };
  return m;
}

export function buildGround() {
  const geo = new THREE.PlaneGeometry(400, 400);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / 5, -p.getZ(k) / 5);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: toTex(grass()), roughness: 1, color: '#d3dcc6',
  }));
  m.position.y = -0.02;
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------ paredes
export function wallInfo(w) {
  const ax = w.a[0], az = w.a[1];
  const dx = w.b[0] - ax, dz = w.b[1] - az;
  const L = Math.hypot(dx, dz) || 1e-6;
  return { ax, az, dx, dz, L, ux: dx / L, uz: dz / L, angle: Math.atan2(dz, dx) };
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const CAP = new THREE.MeshStandardMaterial({ color: '#4b4f56', roughness: 0.9 });
const wallMatCache = new Map();
function wallMats(color) {
  if (!wallMatCache.has(color)) {
    const s = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
    wallMatCache.set(color, [s, s, CAP, CAP, s, s]);
  }
  return wallMatCache.get(color);
}
const PREVIEW_MAT = new THREE.MeshStandardMaterial({ color: '#60a5fa', transparent: true, opacity: 0.55, depthWrite: false });
const PREVIEW = [PREVIEW_MAT, PREVIEW_MAT, PREVIEW_MAT, PREVIEW_MAT, PREVIEW_MAT, PREVIEW_MAT];

const FRAME = new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.5 });
const LEAF = new THREE.MeshStandardMaterial({ color: '#a8774f', roughness: 0.55 });
const HANDLE = new THREE.MeshStandardMaterial({ color: '#cfd3d7', roughness: 0.25, metalness: 0.9 });
const GLASS = new THREE.MeshStandardMaterial({
  color: '#cfe8f5', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false,
});
const INVIS = new THREE.MeshBasicMaterial({ visible: false });

function bx(g, m, w, h, d, x, y, z, shadow = true) {
  const o = new THREE.Mesh(UNIT, m);
  o.scale.set(w, h, d);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  g.add(o);
  return o;
}

function buildOpening(o, th, H) {
  const g = new THREE.Group();
  g.position.x = o.t;
  g.userData = { kind: 'opening', id: o.id };
  const def = OPENINGS[o.kind] || OPENINGS.door;
  const proxy = new THREE.Mesh(UNIT, INVIS);
  proxy.scale.set(o.w, Math.max(0.05, o.top - o.bottom), th + 0.04);
  proxy.position.y = (o.top + o.bottom) / 2;
  g.add(proxy);

  if (def.type === 'door') {
    const Ht = Math.min(o.top, H), fw = 0.05, fd = th + 0.03;
    if (def.leaves === 0) {
      for (const s of [-1, 1]) bx(g, FRAME, 0.02, Ht, fd, s * (o.w / 2 - 0.01), Ht / 2, 0);
      if (o.top <= H) bx(g, FRAME, o.w, 0.02, fd, 0, o.top - 0.01, 0);
      return g;
    }
    for (const s of [-1, 1]) bx(g, FRAME, fw, Ht, fd, s * (o.w / 2 - fw / 2), Ht / 2, 0);
    if (o.top <= H) bx(g, FRAME, o.w, fw, fd, 0, o.top - fw / 2, 0);
    const lh = Ht - 0.03, lw = (o.w - 2 * fw) / def.leaves;
    for (let i = 0; i < def.leaves; i++) {
      const left = i === 0;
      const piv = new THREE.Group();
      piv.position.set(left ? -o.w / 2 + fw : o.w / 2 - fw, 0, th / 2 - 0.02);
      piv.rotation.y = left ? -1.15 : 1.15;
      bx(piv, LEAF, lw, lh, 0.04, left ? lw / 2 : -lw / 2, lh / 2 + 0.01, 0.02);
      if (lh > 1.05) bx(piv, HANDLE, 0.12, 0.02, 0.07, left ? lw - 0.1 : -lw + 0.1, 1.0, 0.02);
      g.add(piv);
    }
    return g;
  }

  // ventana
  if (o.bottom >= H) return g;
  const top = Math.min(o.top, H), h = top - o.bottom, fd = th * 0.55, f = 0.05;
  if (o.bottom > 0.05) bx(g, FRAME, o.w + 0.08, 0.04, th + 0.08, 0, o.bottom - 0.02, 0);
  for (const s of [-1, 1]) bx(g, FRAME, f, h, fd, s * (o.w / 2 - f / 2), o.bottom + h / 2, 0);
  if (o.top <= H) bx(g, FRAME, o.w, f, fd, 0, o.top - f / 2, 0);
  bx(g, FRAME, o.w, f, fd, 0, o.bottom + f / 2, 0);
  if (o.w > 1) bx(g, FRAME, 0.04, h, fd * 0.9, 0, o.bottom + h / 2, 0);
  if (h > 2 * f) bx(g, GLASS, o.w - 2 * f, h - 2 * f, 0.012, 0, o.bottom + h / 2, 0, false);
  return g;
}

export function buildWall(w, dh = Infinity, preview = false) {
  const { ax, az, L, angle } = wallInfo(w);
  const g = new THREE.Group();
  g.position.set(ax, 0, az);
  g.rotation.y = -angle;
  g.userData = { kind: 'wall', id: w.id };
  const th = w.thickness, H = Math.min(w.height, dh), ext = th / 2;
  const mats = preview ? PREVIEW : wallMats(w.color);
  const piece = (x0, x1, y0, y1) => {
    if (x1 - x0 < 0.005 || y1 - y0 < 0.005) return;
    const m = new THREE.Mesh(UNIT, mats);
    m.scale.set(x1 - x0, y1 - y0, th);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.castShadow = m.receiveShadow = !preview;
    g.add(m);
  };
  const ops = [...(w.openings || [])].sort((a, b) => a.t - b.t);
  let cur = -ext;
  for (const o of ops) {
    const s = Math.max(o.t - o.w / 2, cur), e = Math.min(o.t + o.w / 2, L + ext);
    if (e <= s) continue;
    piece(cur, s, -0.03, H);
    if (o.bottom > 0) piece(s, e, -0.03, Math.min(o.bottom, H));
    if (o.top < H) piece(s, e, o.top, H);
    if (!preview) g.add(buildOpening(o, th, H));
    cur = e;
  }
  piece(cur, L + ext, -0.03, H);
  return g;
}
