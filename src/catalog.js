import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const FURN_SWATCHES = [
  '#f4f4f2', '#d9d4cc', '#9a948c', '#4a4c50', '#1c1c1f', '#8a5a3b', '#c49a6c',
  '#6b7b8c', '#2f4a6d', '#3f6f5a', '#a44a3f', '#d8a23a', '#c97b8e', '#6c5a8a',
];

// ------------------------------------------------------------ materiales
const matCache = new Map();
export const lampMats = new Set();

export function mat(color, rough = 0.8, metal = 0, extra = null) {
  const key = `${color}|${rough}|${metal}|${extra ? JSON.stringify(extra) : ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...(extra || {}) });
    matCache.set(key, m);
  }
  return m;
}
const tone = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
function lampMat(color) {
  const m = mat(color, 0.9, 0, { emissive: '#ffd59a', emissiveIntensity: 0 });
  lampMats.add(m);
  return m;
}
const C = { dwood: '#4b3427', bwood: '#8d6446', black: '#1c1c1f', soil: '#3b2b20' };
const M = {
  steel: () => mat('#d3d7db', 0.25, 0.85),
  black: () => mat(C.black, 0.5),
  glass: () => mat('#d3ecf7', 0.05, 0.1, { transparent: true, opacity: 0.22, depthWrite: false }),
  screen: () => mat('#070b12', 0.2, 0, { emissive: '#1b3a66', emissiveIntensity: 0.45 }),
  ceramic: () => mat('#f6f7f8', 0.18),
};

// ------------------------------------------------------------ geometría
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(1, 24, 16);
const ICO = new THREE.IcosahedronGeometry(1, 1);
const geoCache = new Map();
function cylGeo(ratio, seg) {
  const k = `c${ratio.toFixed(3)}|${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(ratio, 1, 1, seg));
  return geoCache.get(k);
}
function rGeo(w, h, d, r) {
  const k = [w, h, d, r].map((v) => v.toFixed(3)).join('|');
  if (!geoCache.has(k)) {
    const rr = Math.max(0.002, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
    geoCache.set(k, new RoundedBoxGeometry(w, h, d, 3, rr));
  }
  return geoCache.get(k);
}
const add = (g, geo, m, x, y, z) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
};
// y = base del objeto (no el centro)
const box = (g, m, w, h, d, x = 0, y = 0, z = 0) => {
  const o = add(g, BOX, m, x, y + h / 2, z);
  o.scale.set(w, h, d);
  return o;
};
const rbox = (g, m, w, h, d, r, x = 0, y = 0, z = 0) => add(g, rGeo(w, h, d, r), m, x, y + h / 2, z);
const cyl = (g, m, r, h, x = 0, y = 0, z = 0, rTop = r, seg = 24) => {
  const o = add(g, cylGeo(rTop / r, seg), m, x, y + h / 2, z);
  o.scale.set(r, h, r);
  return o;
};
const sph = (g, m, rx, ry, rz, x, y, z) => {
  const o = add(g, SPH, m, x, y, z);
  o.scale.set(rx, ry, rz);
  return o;
};
const ico = (g, m, r, x, y, z) => {
  const o = add(g, ICO, m, x, y, z);
  o.scale.setScalar(r);
  return o;
};
const legs4 = (g, m, r, h, x, z) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, m, r, h, sx * x, 0, sz * z);
};
const blegs4 = (g, m, s, h, x, z) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, m, s, h, s, sx * x, 0, sz * z);
};
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const BOOKS = ['#a4473d', '#2f5d7c', '#d9b65b', '#3e6b4f', '#e8e0d0', '#6a4a7a', '#c46b3b', '#24384d'];

// ------------------------------------------------------------ piezas
function sofaBody(g, c, W) {
  const F = mat(c, 0.95), F2 = mat(tone(c, 1.1), 0.95), L = mat(C.dwood, 0.6);
  legs4(g, L, 0.025, 0.1, W / 2 - 0.1, 0.34);
  rbox(g, F, W, 0.3, 0.88, 0.05, 0, 0.1, 0);
  rbox(g, F, W, 0.52, 0.22, 0.07, 0, 0.32, -0.33);
  for (const s of [-1, 1]) rbox(g, F, 0.2, 0.34, 0.88, 0.07, s * (W / 2 - 0.1), 0.32, 0);
  const n = W > 1.3 ? 2 : 1;
  const cw = (W - 0.42) / n;
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * cw) / 2 + i * cw;
    rbox(g, F2, cw - 0.01, 0.14, 0.64, 0.05, x, 0.4, 0.08);
    rbox(g, F2, cw - 0.01, 0.4, 0.15, 0.06, x, 0.46, -0.17);
  }
}

function bed(g, c, W, pillows) {
  const F = mat(C.bwood, 0.6), Wt = mat('#f4f3ef', 0.9), Dv = mat(c, 0.95), P = mat('#ffffff', 0.9);
  const D = 2.05;
  blegs4(g, F, 0.05, 0.1, W / 2 - 0.02, D / 2 - 0.05);
  box(g, F, W + 0.06, 0.22, D, 0, 0.1, 0);
  rbox(g, Wt, W - 0.04, 0.22, D - 0.08, 0.04, 0, 0.3, 0.02);
  rbox(g, Dv, W + 0.02, 0.08, 1.42, 0.035, 0, 0.5, 0.3);
  rbox(g, Dv, W + 0.02, 0.3, 0.04, 0.02, 0, 0.26, 1.0);
  if (pillows === 2) for (const s of [-1, 1]) rbox(g, P, W / 2 - 0.12, 0.13, 0.4, 0.06, (s * W) / 4, 0.5, -0.68);
  else rbox(g, P, W - 0.3, 0.13, 0.4, 0.06, 0, 0.5, -0.68);
  rbox(g, F, W + 0.12, 1.05, 0.08, 0.02, 0, 0, -1.06);
}

function counter(g, c, upper) {
  const B = mat(c, 0.5), K = mat(C.black, 0.7), T = mat('#2f3033', 0.25, 0.1);
  box(g, K, 0.8, 0.08, 0.54, 0, 0, -0.02);
  box(g, B, 0.8, 0.8, 0.6, 0, 0.08, 0);
  box(g, T, 0.82, 0.04, 0.64, 0, 0.88, 0.01);
  box(g, mat(tone(c, 0.75), 0.6), 0.79, 0.005, 0.01, 0, 0.66, 0.301);
  box(g, M.steel(), 0.25, 0.02, 0.03, 0, 0.73, 0.31);
  box(g, M.steel(), 0.02, 0.2, 0.03, 0.3, 0.38, 0.31);
  if (upper) {
    box(g, B, 0.8, 0.7, 0.35, 0, 1.45, -0.125);
    box(g, M.steel(), 0.02, 0.18, 0.03, 0.3, 1.5, 0.06);
  }
}

// ------------------------------------------------------------ catálogo
// Convención: el frente de cada mueble mira hacia +z; el origen está en el piso, al centro.
export const ITEMS = [
  // ---------------- Sala
  { id: 'sofa', name: 'Sofá', cat: 'Sala', color: '#6b7b8c', build: (g, c) => sofaBody(g, c, 2.0) },
  { id: 'sillon', name: 'Sillón', cat: 'Sala', color: '#c97b5a', build: (g, c) => sofaBody(g, c, 0.95) },
  {
    id: 'mesa-centro', name: 'Mesa de centro', cat: 'Sala', color: '#b88a5a',
    build(g, c) {
      const W = mat(c, 0.5), L = mat(C.black, 0.4, 0.3);
      rbox(g, W, 1.1, 0.05, 0.6, 0.012, 0, 0.36, 0);
      box(g, W, 1.0, 0.03, 0.5, 0, 0.12, 0);
      blegs4(g, L, 0.035, 0.36, 0.52, 0.27);
    },
  },
  {
    id: 'tv', name: 'Mueble con TV', cat: 'Sala', color: '#ebe6de',
    build(g, c) {
      const W = mat(c, 0.55), D = mat(tone(c, 0.7), 0.6), K = M.black();
      blegs4(g, K, 0.03, 0.08, 0.85, 0.17);
      box(g, W, 1.8, 0.46, 0.42, 0, 0.08, 0);
      for (const x of [-0.3, 0.3]) box(g, D, 0.006, 0.4, 0.01, x, 0.11, 0.211);
      box(g, K, 0.3, 0.02, 0.18, 0, 0.54, -0.05);
      box(g, K, 0.05, 0.12, 0.03, 0, 0.55, -0.09);
      rbox(g, K, 1.3, 0.76, 0.045, 0.012, 0, 0.62, -0.08);
      box(g, M.screen(), 1.25, 0.71, 0.004, 0, 0.645, -0.056);
    },
  },
  {
    id: 'librero', name: 'Librero', cat: 'Sala', color: '#c9a06f',
    build(g, c) {
      const W = mat(c, 0.6), R = rng(7);
      box(g, W, 0.03, 2.0, 0.34, -0.435, 0, 0);
      box(g, W, 0.03, 2.0, 0.34, 0.435, 0, 0);
      box(g, W, 0.9, 0.03, 0.34, 0, 1.97, 0);
      box(g, mat(tone(c, 0.8), 0.7), 0.84, 2.0, 0.01, 0, 0, -0.165);
      for (const y of [0, 0.4, 0.8, 1.2, 1.6]) box(g, W, 0.84, 0.03, 0.33, 0, y, 0);
      for (const y of [0.03, 0.43, 0.83, 1.23, 1.63]) {
        let x = -0.41;
        while (x < 0.36) {
          const w = 0.025 + R() * 0.035, h = 0.2 + R() * 0.13;
          if (R() < 0.1) { x += 0.07; continue; }
          box(g, mat(BOOKS[Math.floor(R() * BOOKS.length)], 0.8), w, h, 0.2 + R() * 0.07, x + w / 2, y, 0.02);
          x += w + 0.004;
        }
      }
    },
  },
  {
    id: 'alfombra', name: 'Alfombra', cat: 'Sala', color: '#cbbca8', flat: true,
    build(g, c) {
      box(g, mat(tone(c, 0.78), 1), 2.4, 0.012, 1.7, 0, 0, 0);
      box(g, mat(c, 1), 2.2, 0.014, 1.5, 0, 0, 0);
    },
  },
  {
    id: 'lampara', name: 'Lámpara de pie', cat: 'Sala', color: '#f1e7d6', light: { y: 1.42 },
    build(g, c) {
      const K = mat('#2a2a2d', 0.35, 0.6);
      cyl(g, K, 0.16, 0.03);
      cyl(g, K, 0.014, 1.35, 0, 0.03, 0);
      cyl(g, lampMat(c), 0.2, 0.32, 0, 1.3, 0, 0.15, 32);
    },
  },
  {
    id: 'planta', name: 'Planta', cat: 'Sala', color: '#b5643c',
    build(g, c) {
      cyl(g, mat(c, 0.8), 0.17, 0.38, 0, 0, 0, 0.21);
      cyl(g, mat(C.soil, 1), 0.19, 0.02, 0, 0.36, 0);
      const L = mat('#3f7d3a', 0.7), L2 = mat('#5c9c45', 0.7);
      for (let i = 0; i < 11; i++) {
        const a = i * 2.4, r = i < 3 ? 0.02 : 0.1, k = i % 3;
        const m = sph(g, i % 2 ? L : L2, 0.075, 0.3 + k * 0.06, 0.035, Math.cos(a) * r, 0.62 + k * 0.06, Math.sin(a) * r);
        m.rotation.set(Math.sin(a) * 0.55, -a, -Math.cos(a) * 0.55, 'YXZ');
      }
    },
  },

  // ---------------- Dormitorio
  { id: 'cama-doble', name: 'Cama matrimonial', cat: 'Dormitorio', color: '#7d93ad', build: (g, c) => bed(g, c, 1.6, 2) },
  { id: 'cama-simple', name: 'Cama individual', cat: 'Dormitorio', color: '#d58b6a', build: (g, c) => bed(g, c, 1.0, 1) },
  {
    id: 'mesa-noche', name: 'Mesa de noche', cat: 'Dormitorio', color: '#c9a06f', light: { y: 0.72 },
    build(g, c) {
      const W = mat(c, 0.55);
      blegs4(g, mat(C.dwood, 0.6), 0.03, 0.08, 0.21, 0.17);
      box(g, W, 0.5, 0.45, 0.42, 0, 0.08, 0);
      box(g, mat(tone(c, 0.72), 0.6), 0.46, 0.006, 0.01, 0, 0.33, 0.211);
      box(g, M.steel(), 0.08, 0.015, 0.02, 0, 0.42, 0.22);
      cyl(g, mat('#c9b79c', 0.5), 0.05, 0.03, 0.05, 0.53, -0.02);
      cyl(g, M.steel(), 0.008, 0.12, 0.05, 0.56, -0.02);
      cyl(g, lampMat('#f2ead9'), 0.1, 0.15, 0.05, 0.66, -0.02, 0.075);
    },
  },
  {
    id: 'ropero', name: 'Ropero', cat: 'Dormitorio', color: '#e6e0d6',
    build(g, c) {
      const W = mat(c, 0.55);
      box(g, mat(C.black, 0.6), 1.16, 0.06, 0.56, 0, 0, 0);
      box(g, W, 1.2, 2.04, 0.6, 0, 0.06, 0);
      box(g, mat(tone(c, 0.7), 0.6), 0.006, 1.98, 0.01, 0, 0.09, 0.301);
      for (const s of [-1, 1]) box(g, M.steel(), 0.02, 0.3, 0.025, s * 0.05, 1.0, 0.31);
    },
  },

  // ---------------- Cocina
  {
    id: 'refri', name: 'Refrigeradora', cat: 'Cocina', color: '#d6dadd',
    build(g, c) {
      rbox(g, mat(c, 0.3, 0.5), 0.75, 1.8, 0.7, 0.03, 0, 0, 0);
      box(g, mat('#5a5f66', 0.5), 0.74, 0.008, 0.01, 0, 1.18, 0.351);
      for (const [y, h] of [[1.3, 0.4], [0.55, 0.45]]) box(g, M.steel(), 0.025, h, 0.04, 0.3, y, 0.37);
    },
  },
  {
    id: 'estufa', name: 'Estufa', cat: 'Cocina', color: '#e9e9e7',
    build(g, c) {
      const B = mat(c, 0.35, 0.3), K = mat('#151517', 0.2, 0.3);
      box(g, B, 0.76, 0.88, 0.62, 0, 0, 0);
      box(g, K, 0.76, 0.025, 0.62, 0, 0.88, 0);
      for (const sx of [-0.18, 0.18]) for (const sz of [-0.15, 0.15]) {
        cyl(g, mat('#2b2b2e', 0.5, 0.6), 0.085, 0.012, sx, 0.905, sz);
        cyl(g, mat('#46464a', 0.4, 0.7), 0.04, 0.018, sx, 0.905, sz);
      }
      box(g, K, 0.56, 0.32, 0.01, 0, 0.25, 0.311);
      box(g, M.steel(), 0.6, 0.025, 0.04, 0, 0.64, 0.33);
      for (let i = 0; i < 4; i++) box(g, K, 0.04, 0.04, 0.03, -0.27 + i * 0.18, 0.76, 0.32);
      box(g, B, 0.76, 0.14, 0.04, 0, 0.9, -0.29);
    },
  },
  { id: 'cocina', name: 'Mueble de cocina', cat: 'Cocina', color: '#f0ede7', build: (g, c) => counter(g, c, true) },
  {
    id: 'fregadero', name: 'Lavatrastos', cat: 'Cocina', color: '#f0ede7',
    build(g, c) {
      counter(g, c, false);
      box(g, M.steel(), 0.54, 0.01, 0.4, 0, 0.918, 0.03);
      box(g, mat('#6f757c', 0.35, 0.6), 0.46, 0.012, 0.32, 0, 0.918, 0.03);
      cyl(g, M.steel(), 0.016, 0.28, 0, 0.9, -0.22);
      box(g, M.steel(), 0.025, 0.025, 0.16, 0, 1.16, -0.15);
    },
  },

  // ---------------- Comedor
  {
    id: 'mesa-comedor', name: 'Mesa de comedor', cat: 'Comedor', color: '#a77a52',
    build(g, c) {
      const W = mat(c, 0.5);
      rbox(g, W, 1.6, 0.05, 0.9, 0.015, 0, 0.71, 0);
      blegs4(g, W, 0.06, 0.71, 0.72, 0.37);
      for (const s of [-1, 1]) box(g, W, 1.4, 0.08, 0.03, 0, 0.63, s * 0.38);
    },
  },
  {
    id: 'silla', name: 'Silla', cat: 'Comedor', color: '#a77a52',
    build(g, c) {
      const W = mat(c, 0.55), S = mat(tone(c, 1.12), 0.8);
      legs4(g, W, 0.018, 0.44, 0.19, 0.19);
      rbox(g, S, 0.45, 0.05, 0.45, 0.015, 0, 0.44, 0);
      for (const s of [-1, 1]) box(g, W, 0.03, 0.48, 0.03, s * 0.19, 0.46, -0.205);
      rbox(g, W, 0.42, 0.18, 0.03, 0.01, 0, 0.72, -0.205);
      box(g, W, 0.38, 0.03, 0.02, 0, 0.58, -0.205);
    },
  },

  // ---------------- Baño
  {
    id: 'inodoro', name: 'Inodoro', cat: 'Baño', color: '#f6f7f8',
    build(g, c) {
      const P = mat(c, 0.15);
      const bowl = cyl(g, P, 0.19, 0.36, 0, 0, 0.08, 0.21, 32);
      bowl.scale.z *= 1.3;
      const seat = cyl(g, P, 0.205, 0.04, 0, 0.36, 0.09, 0.205, 32);
      seat.scale.z *= 1.3;
      box(g, P, 0.42, 0.38, 0.18, 0, 0.4, -0.23);
      box(g, P, 0.44, 0.04, 0.2, 0, 0.78, -0.23);
      box(g, M.steel(), 0.05, 0.01, 0.03, 0, 0.82, -0.2);
    },
  },
  {
    id: 'lavamanos', name: 'Lavamanos', cat: 'Baño', color: '#f2f2ef',
    build(g, c) {
      box(g, mat(C.black, 0.7), 0.56, 0.08, 0.4, 0, 0, -0.02);
      box(g, mat(c, 0.5), 0.6, 0.72, 0.45, 0, 0.08, 0);
      box(g, M.ceramic(), 0.62, 0.06, 0.48, 0, 0.8, 0.01);
      const b = cyl(g, mat('#dfe6eb', 0.15), 0.17, 0.012, 0, 0.855, 0.04, 0.17, 32);
      b.scale.z *= 0.75;
      cyl(g, M.steel(), 0.014, 0.18, 0, 0.86, -0.17);
      box(g, M.steel(), 0.02, 0.02, 0.1, 0, 1.02, -0.12);
      box(g, mat('#2b2b2e', 0.5), 0.59, 0.79, 0.012, 0, 1.08, -0.236);
      box(g, mat('#e4ecf0', 0.03, 1), 0.55, 0.75, 0.015, 0, 1.1, -0.228);
    },
  },
  {
    id: 'ducha', name: 'Ducha', cat: 'Baño', color: '#f6f7f8',
    build(g, c) {
      box(g, mat(c, 0.2), 0.9, 0.06, 0.9, 0, 0, 0);
      box(g, M.glass(), 0.88, 1.9, 0.012, 0, 0.06, 0.444);
      box(g, M.glass(), 0.012, 1.9, 0.88, 0.444, 0.06, 0);
      box(g, M.steel(), 0.9, 0.02, 0.02, 0, 1.96, 0.444);
      box(g, M.steel(), 0.02, 0.02, 0.9, 0.444, 1.96, 0);
      box(g, M.steel(), 0.02, 1.9, 0.02, 0.444, 0.06, 0.444);
      cyl(g, M.steel(), 0.012, 1.1, -0.3, 0.9, -0.43);
      box(g, M.steel(), 0.02, 0.02, 0.14, -0.3, 1.98, -0.37);
      cyl(g, M.steel(), 0.09, 0.02, -0.3, 1.95, -0.3);
      box(g, M.steel(), 0.08, 0.08, 0.03, -0.3, 1.05, -0.43);
    },
  },
  {
    id: 'banera', name: 'Bañera', cat: 'Baño', color: '#f6f7f8',
    build(g, c) {
      rbox(g, mat(c, 0.15), 0.78, 0.56, 1.7, 0.06, 0, 0, 0);
      rbox(g, mat('#dbe5eb', 0.1), 0.6, 0.04, 1.5, 0.02, 0, 0.535, 0.02);
      box(g, M.steel(), 0.03, 0.12, 0.03, 0, 0.56, -0.78);
      box(g, M.steel(), 0.03, 0.03, 0.1, 0, 0.66, -0.74);
    },
  },

  // ---------------- Oficina
  {
    id: 'escritorio', name: 'Escritorio', cat: 'Oficina', color: '#c9a06f',
    build(g, c) {
      const T = mat(c, 0.5), K = mat('#2d2f33', 0.4, 0.4);
      box(g, T, 1.4, 0.035, 0.7, 0, 0.72, 0);
      for (const s of [-1, 1]) box(g, K, 0.04, 0.72, 0.62, s * 0.66, 0, 0);
      box(g, K, 1.28, 0.05, 0.02, 0, 0.62, -0.29);
      box(g, T, 0.42, 0.16, 0.6, 0.42, 0.55, 0);
      box(g, M.steel(), 0.12, 0.015, 0.02, 0.42, 0.62, 0.305);
    },
  },
  {
    id: 'silla-oficina', name: 'Silla de oficina', cat: 'Oficina', color: '#2f3640',
    build(g, c) {
      const F = mat(c, 0.85), K = mat('#1d1f22', 0.4, 0.5);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const m = box(g, K, 0.3, 0.025, 0.035, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15);
        m.rotation.y = -a;
        sph(g, K, 0.03, 0.03, 0.03, Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3);
      }
      cyl(g, K, 0.025, 0.34, 0, 0.08, 0);
      rbox(g, F, 0.5, 0.08, 0.48, 0.03, 0, 0.42, 0.02);
      box(g, K, 0.04, 0.3, 0.03, 0, 0.45, -0.24);
      rbox(g, F, 0.46, 0.52, 0.06, 0.03, 0, 0.6, -0.25);
    },
  },
  {
    id: 'computadora', name: 'Computadora', cat: 'Oficina', color: '#1d1f22', elev: 0.755,
    build(g, c) {
      const K = mat(c, 0.4, 0.3);
      box(g, K, 0.22, 0.012, 0.16, 0, 0, -0.08);
      box(g, K, 0.04, 0.16, 0.03, 0, 0.01, -0.1);
      rbox(g, K, 0.6, 0.36, 0.03, 0.008, 0, 0.13, -0.08);
      box(g, M.screen(), 0.57, 0.33, 0.004, 0, 0.145, -0.063);
      box(g, mat('#2a2c30', 0.6), 0.44, 0.015, 0.14, 0, 0, 0.12);
      sph(g, K, 0.03, 0.015, 0.045, 0.3, 0.012, 0.12);
    },
  },

  // ---------------- Exterior
  {
    id: 'arbol', name: 'Árbol', cat: 'Exterior', color: '#4f8a3a',
    build(g, c) {
      cyl(g, mat('#6b4a33', 0.9), 0.16, 2.2, 0, 0, 0, 0.1, 10);
      const L = mat(c, 0.9, 0, { flatShading: true }), L2 = mat(tone(c, 1.18), 0.9, 0, { flatShading: true });
      ico(g, L, 1.15, 0, 2.7, 0);
      ico(g, L2, 0.85, 0.6, 2.3, 0.35);
      ico(g, L2, 0.8, -0.55, 2.4, -0.3);
      ico(g, L, 0.7, 0.1, 3.35, -0.1);
    },
  },
  {
    id: 'arbusto', name: 'Arbusto', cat: 'Exterior', color: '#4c8a3c',
    build(g, c) {
      const L = mat(c, 0.9, 0, { flatShading: true }), L2 = mat(tone(c, 1.18), 0.9, 0, { flatShading: true });
      ico(g, L, 0.45, 0, 0.36, 0);
      ico(g, L2, 0.35, 0.35, 0.28, 0.15);
      ico(g, L2, 0.32, -0.32, 0.26, -0.1);
    },
  },
  {
    id: 'carro', name: 'Carro', cat: 'Exterior', color: '#b23a3a',
    build(g, c) {
      const P = mat(c, 0.3, 0.5), K = mat('#151618', 0.6), Gl = mat('#1f2a33', 0.08, 0.6);
      rbox(g, P, 1.8, 0.6, 4.2, 0.14, 0, 0.28, 0);
      rbox(g, Gl, 1.56, 0.5, 2.1, 0.16, 0, 0.78, -0.25);
      rbox(g, P, 1.5, 0.06, 1.7, 0.03, 0, 1.25, -0.3);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const w = new THREE.Mesh(cylGeo(1, 24), K);
        w.scale.set(0.34, 0.26, 0.34);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx * 0.8, 0.34, sz * 1.35);
        const r = new THREE.Mesh(cylGeo(1, 16), M.steel());
        r.scale.set(0.2, 0.27, 0.2);
        r.rotation.z = Math.PI / 2;
        r.position.copy(w.position);
        g.add(w, r);
      }
      for (const s of [-1, 1]) {
        box(g, mat('#fffbe8', 0.2, 0, { emissive: '#fff6d0', emissiveIntensity: 0.6 }), 0.36, 0.1, 0.02, s * 0.6, 0.6, 2.1);
        box(g, mat('#b3121b', 0.3, 0, { emissive: '#ff2020', emissiveIntensity: 0.4 }), 0.36, 0.08, 0.02, s * 0.6, 0.62, -2.1);
      }
      box(g, K, 1.82, 0.14, 0.08, 0, 0.22, 2.1);
      box(g, K, 1.82, 0.14, 0.08, 0, 0.22, -2.1);
    },
  },
];

export const ITEM_MAP = Object.fromEntries(ITEMS.map((d) => [d.id, d]));
export const CATS = [...new Set(ITEMS.map((d) => d.cat))];

export function buildItem(type, color) {
  const def = ITEM_MAP[type];
  const g = new THREE.Group();
  if (!def) return g;
  def.build(g, color || def.color);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !def.flat && !o.material.transparent;
      o.receiveShadow = true;
    }
  });
  return g;
}

// Caja que ocupa cada mueble en su sistema local (sin girar), calculada una vez por tipo
const fpCache = {};
export function footprint(type) {
  if (!fpCache[type]) {
    const b = new THREE.Box3().setFromObject(buildItem(type));
    fpCache[type] = { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z };
  }
  return fpCache[type];
}
