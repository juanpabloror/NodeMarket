const rand = (min, max) => min + Math.random() * (max - min);

const gauss = () => {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function create(count) {
  return {
    live: false,
    targets: new Float32Array(count * 3),
    edges: [],
    mask: new Uint8Array(count),
    group: new Int8Array(count).fill(-1),
    scale: new Float32Array(count).fill(1),
    dim: new Float32Array(count).fill(1),
    reveal: new Float32Array(count),
    revealBase: 1,
    revealScroll: 0,
    hasGroups: false,
    converge: false,
    focusDefault: new Float32Array(8),
    pose: { rotX: 0, sway: 0.4, camZ: 24, advance: 0, wander: 0.3 },
  };
}

function scatter(f, from, count, spread) {
  for (let i = from; i < count; i++) {
    const i3 = i * 3;
    f.targets[i3] = rand(-0.5, 0.5) * spread.x;
    f.targets[i3 + 1] = rand(-0.5, 0.5) * spread.y;
    f.targets[i3 + 2] = rand(-0.5, 0.5) * spread.z;
    f.mask[i] = 1;
    f.dim[i] = 0.45;
    f.reveal[i] = Math.random();
  }
}

function nearest(targets, i, from, to) {
  let best = -1;
  let bestD = Infinity;
  for (let j = from; j < to; j++) {
    if (j === i) continue;
    const dx = targets[i * 3] - targets[j * 3];
    const dy = targets[i * 3 + 1] - targets[j * 3 + 1];
    const dz = targets[i * 3 + 2] - targets[j * 3 + 2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

function calma(count) {
  const f = create(count);
  f.live = true;
  f.targets = null;
  f.mask.fill(1);
  f.dim.fill(0.8);
  for (let i = 0; i < count; i++) f.reveal[i] = Math.random();
  f.revealBase = 0.55;
  f.pose = { rotX: 0, sway: 0.4, camZ: 24, advance: 0, wander: 0.15 };
  return f;
}

// Colonias de una ciudad de noche vista en ángulo; con el scroll se encienden más nodos.
function ciudad(count) {
  const f = create(count);
  const k = Math.min(6, Math.max(3, Math.round(count / 30)));
  const centers = [];
  for (let tries = 0; centers.length < k && tries < 400; tries++) {
    const c = [rand(-15, 15), rand(-8, 8)];
    if (centers.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) > 7)) centers.push(c);
  }

  const cityCount = count - Math.round(count * 0.14);
  const hubs = [];
  for (let i = 0; i < cityCount; i++) {
    const i3 = i * 3;
    const isHub = i < centers.length;
    const c = isHub ? centers[i] : centers[(Math.random() * centers.length) | 0];
    f.targets[i3] = c[0] + (isHub ? 0 : gauss() * 2.1);
    f.targets[i3 + 1] = isHub ? 0.6 : Math.random() < 0.15 ? rand(1.2, 2.6) : Math.abs(gauss()) * 0.45;
    f.targets[i3 + 2] = c[1] + (isHub ? 0 : gauss() * 1.6);
    f.mask[i] = 1;
    f.dim[i] = 0.9;
    f.reveal[i] = isHub ? 0 : Math.pow(Math.random(), 0.9);
    f.scale[i] = isHub ? 1.5 : 1;
    if (isHub) hubs.push(i);
  }
  scatter(f, cityCount, count, { x: 38, y: 4, z: 22 });

  for (const hub of hubs) {
    const other = nearest(f.targets, hub, 0, hubs.length);
    if (other >= 0) f.edges.push(hub, other);
  }

  f.revealBase = 0.5;
  f.revealScroll = 0.5;
  f.pose = { rotX: 0.85, sway: 0.2, camZ: 27, advance: 8, wander: 0.35 };
  return f;
}

// Cuatro constelaciones, una por servicio.
function constelaciones(count) {
  const f = create(count);
  const groups = 4;
  const perGroup = Math.max(5, Math.min(16, Math.round(count * 0.14)));
  const cx = [-13, -4.4, 4.4, 13];
  const cy = [2.5, -2.2, 2.8, -1.8];

  for (let g = 0; g < groups; g++) {
    const start = g * perGroup;
    for (let m = 0; m < perGroup; m++) {
      const i = start + m;
      const i3 = i * 3;
      for (let tries = 0; tries < 24; tries++) {
        const x = cx[g] + rand(-1, 1) * 3.6;
        const y = cy[g] + rand(-1, 1) * 2.6;
        const z = rand(-1, 1) * 2;
        f.targets[i3] = x;
        f.targets[i3 + 1] = y;
        f.targets[i3 + 2] = z;
        let ok = true;
        for (let j = start; j < i && ok; j++) {
          ok = Math.hypot(x - f.targets[j * 3], y - f.targets[j * 3 + 1], z - f.targets[j * 3 + 2]) > 1.3;
        }
        if (ok) break;
      }
      f.group[i] = g;
      f.scale[i] = m === 0 ? 1.4 : 1;
      if (m > 0) {
        f.edges.push(i, nearest(f.targets, i, start, i));
        if (m >= 3 && Math.random() < 0.35) {
          const second = nearest(f.targets, i, start, i - 1);
          if (second >= 0) f.edges.push(i, second);
        }
      }
    }
  }
  scatter(f, groups * perGroup, count, { x: 40, y: 22, z: 14 });

  f.hasGroups = true;
  f.revealBase = 0.3;
  f.pose = { rotX: 0.05, sway: 0.18, camZ: 24, advance: 0, wander: 0.3 };
  return f;
}

// Ruta de etapas (nodos grandes) con satélites por cada cupo.
function ruta(count, { stages }) {
  const f = create(count);
  const list = stages?.length
    ? stages
    : [
        { estado: 'abierta', total: 3, disponible: 3 },
        { estado: 'proximamente', total: 5, disponible: 5 },
        { estado: 'proximamente', total: 0, disponible: 0 },
        { estado: 'proximamente', total: 0, disponible: 0 },
      ];
  const s = Math.min(list.length, 8);
  const xs = list.map((_, i) => (s === 1 ? 0 : -13 + (26 * i) / (s - 1)));
  const ys = list.map((_, i) => Math.sin(i * 1.3) * 3.2);

  for (let i = 0; i < s; i++) {
    const i3 = i * 3;
    f.targets[i3] = xs[i];
    f.targets[i3 + 1] = ys[i];
    f.group[i] = i;
    f.scale[i] = 2.6;
    f.dim[i] = list[i].estado === 'abierta' ? 1 : 0.85;
    f.focusDefault[i] = list[i].estado === 'abierta' ? 0.7 : 0;
    if (i > 0) f.edges.push(i - 1, i);
  }

  let idx = s;
  for (let st = 0; st < s; st++) {
    const total = Math.min(list[st].total || 0, 8);
    for (let k = 0; k < total && idx < count; k++, idx++) {
      const a = (k / total) * Math.PI * 2 + st * 0.7;
      const i3 = idx * 3;
      f.targets[i3] = xs[st] + Math.cos(a) * 2.6;
      f.targets[i3 + 1] = ys[st] + Math.sin(a) * 2.2;
      f.targets[i3 + 2] = Math.sin(a * 2) * 0.9;
      f.group[idx] = st;
      f.scale[idx] = 0.85;
      f.dim[idx] = k < list[st].disponible ? 1 : 0.28;
      f.edges.push(idx, st);
    }
  }
  scatter(f, idx, count, { x: 40, y: 22, z: 14 });

  f.hasGroups = true;
  f.revealBase = 0.3;
  f.pose = { rotX: 0.1, sway: 0.12, camZ: 25, advance: 0, wander: 0.22 };
  return f;
}

// La red converge en un nodo central ("tu negocio") con ramas radiales.
function converge(count) {
  const f = create(count);
  f.scale[0] = 2.8;

  const ringTotal = count - 1 - Math.round(count * 0.18);
  const weights = [0.1, 0.2, 0.3, 0.4];
  const radii = [4.6, 8.6, 12.6, 16.4];
  const rings = [];
  let idx = 1;

  weights.forEach((w, r) => {
    const n = Math.max(3, Math.round(ringTotal * w));
    const start = idx;
    for (let k = 0; k < n && idx < count; k++, idx++) {
      const a = ((k + rand(-0.35, 0.35)) / n) * Math.PI * 2;
      const radius = radii[r] + rand(-1, 1);
      const i3 = idx * 3;
      f.targets[i3] = Math.cos(a) * radius * 1.55;
      f.targets[i3 + 1] = Math.sin(a) * radius * 0.85;
      f.targets[i3 + 2] = rand(-2.5, 2.5);
      f.dim[idx] = 1 - r * 0.1;
    }
    rings.push([start, idx]);
  });

  rings.forEach(([start, end], r) => {
    for (let i = start; i < end; i++) {
      f.edges.push(i, r === 0 ? 0 : nearest(f.targets, i, rings[r - 1][0], rings[r - 1][1]));
    }
  });
  scatter(f, idx, count, { x: 44, y: 24, z: 14 });

  f.converge = true;
  f.revealBase = 0.3;
  f.pose = { rotX: 0, sway: 0.1, camZ: 26, advance: 0, wander: 0.3 };
  return f;
}

const BUILDERS = { calma, ciudad, constelaciones, ruta, converge };

export function buildFormation(name, count, data = {}) {
  const f = (BUILDERS[name] ?? calma)(count, data);
  f.edges = Int16Array.from(f.edges);
  return f;
}
