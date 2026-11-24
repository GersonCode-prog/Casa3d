import { OPENINGS, wallInfo } from './build.js';

// Casa de ejemplo: sala-comedor-cocina, 2 dormitorios y baño (10 × 8 m)
export function exampleHouse(nid) {
  const H = Math.PI / 2, P = Math.PI;
  const W = (ax, az, bx, bz, th = 0.2) => ({
    id: nid('w'), a: [ax, az], b: [bx, bz], thickness: th, height: 2.7, color: '#f3efe8', openings: [],
  });
  const back = W(-5, -4, 5, -4), right = W(5, -4, 5, 4), front = W(5, 4, -5, 4), left = W(-5, 4, -5, -4);
  const mid = W(-5, 0, 5, 0, 0.12), v1 = W(-1.5, -4, -1.5, 0, 0.12), v2 = W(1, -4, 1, 0, 0.12);
  const walls = [back, right, front, left, mid, v1, v2];

  const op = (w, px, pz, kind) => {
    const i = wallInfo(w);
    const t = (px - i.ax) * i.ux + (pz - i.az) * i.uz;
    const d = OPENINGS[kind];
    w.openings.push({ id: nid('o'), kind, t, w: d.w, bottom: d.bottom, top: d.top });
  };
  op(back, -3.2, -4, 'window');
  op(back, -0.25, -4, 'high');
  op(back, 3, -4, 'window');
  op(right, 5, -2, 'window');
  op(right, 5, 1.95, 'window');
  op(front, 0.5, 4, 'door');
  op(front, 2.8, 4, 'window');
  op(front, -2.8, 4, 'big');
  op(mid, -3.2, 0, 'door');
  op(mid, -0.25, 0, 'door');
  op(mid, 3, 0, 'door');

  const F = (x0, z0, x1, z1, mat) => ({ id: nid('f'), x0, z0, x1, z1, mat });
  const floors = [
    F(-5, 0, 1.5, 4, 'madera'),
    F(1.5, 0, 5, 4, 'ceramica'),
    F(-5, -4, -1.5, 0, 'nogal'),
    F(-1.5, -4, 1, 0, 'porcelanato'),
    F(1, -4, 5, 0, 'madera'),
    F(1.7, 4.1, 4.5, 9, 'concreto'),
    F(0, 4.1, 1, 7, 'concreto'),
  ];

  const I = (type, x, z, rot = 0, extra = {}) => ({ id: nid('i'), type, x, z, rot, ...extra });
  const items = [
    // sala
    I('alfombra', -3.2, 2, H),
    I('tv', -4.7, 2, H),
    I('mesa-centro', -3.2, 2, H),
    I('sofa', -1.75, 2, -H),
    I('sillon', -3.2, 3.35, P),
    I('lampara', -1.2, 3.5),
    I('planta', -4.55, 3.55),
    I('librero', -4.72, 0.6, H),
    // comedor
    I('mesa-comedor', 0.25, 2, H),
    I('silla', -0.5, 1.55, H), I('silla', -0.5, 2.45, H),
    I('silla', 1.0, 1.55, -H), I('silla', 1.0, 2.45, -H),
    // cocina
    I('cocina', 4.58, 0.47, -H),
    I('estufa', 4.58, 1.255, -H),
    I('fregadero', 4.58, 2.04, -H),
    I('refri', 4.53, 2.97, -H),
    // dormitorio principal
    I('cama-doble', -3.25, -2.79),
    I('mesa-noche', -4.35, -3.65),
    I('mesa-noche', -2.15, -3.65),
    I('ropero', -4.6, -1.0, H),
    // baño
    I('ducha', -0.99, -3.45),
    I('inodoro', 0.35, -3.55),
    I('lavamanos', 0.7, -1.3, -H),
    // dormitorio 2
    I('cama-simple', 2.2, -2.79),
    I('mesa-noche', 3.05, -3.65),
    I('escritorio', 4.55, -1.4, -H),
    I('computadora', 4.62, -1.4, -H, { elev: 0.755 }),
    I('silla-oficina', 3.85, -1.4, H),
    I('ropero', 1.75, -0.38, P, { color: '#d8cdbd' }),
    I('planta', 4.5, -3.5),
    // exterior
    I('carro', 3.1, 6.6, P),
    I('arbol', -7.5, 6),
    I('arbol', 7.8, -2.5),
    I('arbol', -7.2, -6.2),
    I('arbusto', -4.2, 4.75),
    I('arbusto', -1.3, 4.75),
    I('arbusto', 5.85, 1.5),
  ];
  return { walls, floors, items };
}
