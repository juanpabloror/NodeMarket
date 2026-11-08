import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

/* La casa de Node Market: un modelo low-poly hecho solo con primitivas de Three.js.
   Se dibuja en una segunda escena sobre el mismo canvas que la red de nodos (ver scene.js).
   El scroll recorre 3 escenas: 0 = exterior, 1 = interior sin techo ni muros frontales, 2 = la mesa. */

const FOV = 24;
const TAN = Math.tan(MathUtils.degToRad(FOV / 2));

// Encuadre de cada vista: punto de mira, ángulo de la cámara y el tamaño (en unidades) que debe caber en pantalla.
// 0-2 = recorrido del inicio; 3-9 = una parte de la oficina por página. `open` = 1 con techo y muros frontales fuera.
const POSES = [
  { target: new Vector3(0.3, 1.5, 0.4), az: 40, el: 30, vw: 16.5, vh: 12.5, open: 0 }, // 0 la casa
  { target: new Vector3(0, 0.9, 0), az: 40, el: 35, vw: 12.5, vh: 9.6, open: 1 }, // 1 los espacios
  { target: new Vector3(0.5, 0.75, -1.35), az: 33, el: 26, vw: 9.6, vh: 7.6, open: 1 }, // 2 la mesa
  { target: new Vector3(0.8, 1.15, -2.2), az: 28, el: 22, vw: 4.8, vh: 3.8, open: 1 }, // 3 servicios: el taller
  { target: new Vector3(2.0, 0.85, -2.3), az: 35, el: 20, vw: 4.8, vh: 4.2, open: 1 }, // 4 paquetes: la repisa
  { target: new Vector3(0.1, 1.85, -2.7), az: 22, el: 10, vw: 6.2, vh: 3.8, open: 1 }, // 5 portafolio: la pizarra
  { target: new Vector3(-1.8, 0.75, 0.2), az: 58, el: 24, vw: 5.6, vh: 4, open: 1 }, // 6 nosotros: el sofá
  { target: new Vector3(-2.0, 0.8, -2.0), az: 40, el: 20, vw: 4.6, vh: 3.8, open: 1 }, // 7 preguntas: el archivero
  { target: new Vector3(0.15, 1.0, -2.05), az: 30, el: 30, vw: 3.4, vh: 2.8, open: 1 }, // 8 contacto: el teléfono
  { target: new Vector3(0.9, 1.1, 3.0), az: 30, el: 12, vw: 5, vh: 4, open: 0 }, // 9 404: la puerta
];

/* Nodos que se anclan a objetos de la casa. `hotspot` enlaza con el botón del DOM (data-hotspot);
   `group` es el objeto que "salta" al pasar el cursor. Los demás solo son parte de la red. */
const NODES = [
  { id: 'door', scenes: [0, 9], pos: [0.9, 1.2, 3.08], hotspot: true },
  { id: 'window', scenes: [0, 9], pos: [-1.3, 1.5, 3.08] },
  { id: 'sign', scenes: [0, 9], pos: [2.58, 1.35, 1.9] },
  { id: 'board', scenes: [1, 5, 7], pos: [-0.95, 2.0, -2.72], hotspot: true, pill: [0, 0.95, 0] },
  { id: 'monitor', scenes: [1, 3, 8], pos: [0.8, 1.45, -2.3], hotspot: true, pill: [-0.9, 0.85, 0.9] },
  { id: 'shelf', scenes: [1, 4], pos: [2.1, 1.5, -2.4], hotspot: true, pill: [0.5, 0.6, 0.3] },
  { id: 'sofa', scenes: [1, 6, 7], pos: [-1.85, 0.95, 0.2], hotspot: true, pill: [0, 0.7, 0] },
  { id: 'desk', scenes: [2, 3], pos: [0.8, 1.0, -1.9], hotspot: true },
  { id: 'screen', scenes: [2, 3], pos: [0.8, 1.5, -2.3] },
  { id: 'board2', scenes: [2, 5], pos: [1.2, 2.05, -2.72] },
  { id: 'mug', scenes: [2, 8], pos: [1.55, 0.98, -2.1] },
  { id: 'phone', scenes: [8], pos: [0.15, 1.1, -2.05], hotspot: true, pill: [0, 0.55, 0] },
  { id: 'cabinet', scenes: [7], pos: [-2.0, 1.25, -2.1], hotspot: true, pill: [0, 0.6, 0.2] },
  { id: 'drawer', scenes: [7], pos: [-2.0, 0.6, -1.78] },
  { id: 'table', scenes: [6], pos: [-0.7, 0.6, 0.7] },
  { id: 'plant2', scenes: [6], pos: [-2.0, 1.1, 2.4] },
  { id: 'box2', scenes: [4], pos: [2.05, 0.8, -2.05] },
  { id: 'box4', scenes: [4], pos: [2.05, 1.4, -2.15] },
  { id: 'frameL', scenes: [5], pos: [-1.75, 1.5, -2.72] },
];

const AMBIENT = 14;
const NODE_COLORS = { light: '#5d72ff', dark: '#8b9bff' };
const LINK_COLORS = { light: '#7686ef', dark: '#8b9bff' };

const smooth = (x) => {
  const t = MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

const std = (color, opts = {}) => new MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...opts });

function addMesh(parent, geometry, color, x = 0, y = 0, z = 0, opts = {}) {
  const mesh = new Mesh(geometry, opts.material ?? std(color, opts.mat));
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.cast ?? true;
  mesh.receiveShadow = opts.receive ?? true;
  parent.add(mesh);
  return mesh;
}

const box = (parent, w, h, d, color, x, y, z, opts) => addMesh(parent, new BoxGeometry(w, h, d), color, x, y, z, opts);

function cyl(parent, rTop, rBottom, h, color, x, y, z, seg = 18, opts) {
  return addMesh(parent, new CylinderGeometry(rTop, rBottom, h, seg), color, x, y, z, opts);
}

function ball(parent, r, color, x, y, z, sy = 1, opts) {
  const mesh = addMesh(parent, new SphereGeometry(r, 18, 14), color, x, y, z, opts);
  mesh.scale.y = sy;
  return mesh;
}

// Texturas con texto dibujado en un canvas. Se vuelven a pintar cuando carga la tipografía.
const redraws = [];
function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const paint = () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    texture.needsUpdate = true;
  };
  paint();
  redraws.push(paint);
  return texture;
}

const HEADING = '"Bricolage Grotesque", "Arial Narrow", Arial, sans-serif';
const BODY = '"Inter", Arial, sans-serif';

function boardTexture(title, sub) {
  return canvasTexture(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = '#f8f7f1';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9aa196';
    ctx.font = `600 22px ${BODY}`;
    ctx.fillText('NODEMARKET · ESTUDIO DIGITAL', 64, 84);
    ctx.fillStyle = '#1d2820';
    ctx.font = `600 104px ${HEADING}`;
    title.forEach((line, i) => ctx.fillText(line, 64, 220 + i * 112));
    ctx.fillStyle = '#7b867d';
    ctx.font = `500 30px ${BODY}`;
    ctx.fillText(sub, 64, h - 70);
  });
}

function monitorTexture() {
  return canvasTexture(640, 400, (ctx, w, h) => {
    ctx.fillStyle = '#f4f3ec';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5d72ff';
    ctx.fillRect(40, 44, 14, 14);
    ctx.fillStyle = '#9aa196';
    ctx.font = `600 20px ${BODY}`;
    ctx.fillText('NODEMARKET', 66, 58);
    ctx.fillStyle = '#1d2820';
    ctx.font = `600 66px ${HEADING}`;
    ctx.fillText('Tu próxima', 40, 168);
    ctx.fillText('idea', 40, 236);
    ctx.fillStyle = '#6d8450';
    ctx.fillRect(40, 270, 150, 8);
    ctx.fillStyle = '#cfd4c4';
    ctx.fillRect(40, 304, 380, 8);
    ctx.fillRect(40, 328, 280, 8);
  });
}

function signTexture() {
  return canvasTexture(768, 400, (ctx, w, h) => {
    ctx.fillStyle = '#f2f1ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9aa196';
    ctx.font = `600 22px ${BODY}`;
    ctx.fillText('ESTUDIO DIGITAL', 48, 80);
    ctx.fillStyle = '#1d2820';
    ctx.font = `700 96px ${HEADING}`;
    ctx.fillText('NodeMarket', 48, 210);
    ctx.fillStyle = '#6d8450';
    ctx.fillRect(48, 250, 120, 8);
    ctx.fillStyle = '#c4c9ba';
    ctx.fillRect(48, 300, 420, 7);
    ctx.fillRect(48, 326, 300, 7);
  });
}

function floorTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const plank = 64;
    for (let i = 0; i < h / plank; i++) {
      const tone = 196 + ((i * 37) % 5) * 5;
      ctx.fillStyle = `rgb(${tone + 14}, ${tone}, ${tone - 28})`;
      ctx.fillRect(0, i * plank, w, plank);
      ctx.fillStyle = 'rgba(120, 100, 70, 0.28)';
      ctx.fillRect(0, i * plank, w, 3);
      ctx.fillRect(((i * 173) % w) | 0, i * plank, 3, plank);
    }
  });
}

function stripeTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a8bc8a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#93a975';
    for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 32 + 14, w, 12);
  });
}

function plant(parent, x, z, scale = 1, potColor = '#c7a98d') {
  const g = new Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  cyl(g, 0.38, 0.27, 0.6, potColor, 0, 0.3, 0, 14);
  cyl(g, 0.34, 0.34, 0.04, '#6b5846', 0, 0.6, 0, 14);
  const leaf = ['#5f8244', '#6e9150', '#557a3d'];
  [
    [0, 1.0, 0, 0.5],
    [0.28, 0.82, 0.1, 0.36],
    [-0.26, 0.86, -0.08, 0.38],
    [0.06, 1.3, -0.1, 0.34],
    [-0.12, 0.8, 0.28, 0.32],
  ].forEach(([lx, ly, lz, r], i) => ball(g, r, leaf[i % 3], lx, ly, lz, 0.92));
  parent.add(g);
  return g;
}

export function createHouse(renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 1, 200);

  const hemi = new HemisphereLight('#fffdf3', '#c9cdb6', 1.5);
  scene.add(hemi);
  const sun = new DirectionalLight('#fff4de', 2.1);
  sun.position.set(6, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 36;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const world = new Group();
  scene.add(world);

  /* — terreno (claro / oscuro) — */
  const terrain = [
    [box(world, 14, 0.12, 15, '#ecebe1', 0, -0.36, 0.3, { cast: false }), '#ecebe1', '#2a3045'],
    [box(world, 11, 0.3, 12.4, '#e4e4d8', 0, -0.15, 0.2, { cast: false }), '#e4e4d8', '#333a50'],
    [box(world, 9.8, 0.02, 11.2, '#eae9de', 0, 0.005, 0.2, { cast: false }), '#eae9de', '#3a4259'],
  ];
  // franjas de pasto
  box(world, 1.1, 0.1, 6.2, '#a9bf8d', 3.55, 0.05, 0.1, { cast: false });
  box(world, 3.2, 0.08, 1.0, '#b3c598', -3.2, 0.04, 4.6, { cast: false });

  /* — estructura — */
  const WALL_H = 2.6;
  const RIDGE = 1.5;
  const interiorWall = '#cfd2c1';

  // muros traseros (se quedan siempre)
  const back = new Group();
  world.add(back);
  box(back, 5, WALL_H, 0.2, interiorWall, 0, WALL_H / 2, -2.9);
  box(back, 0.2, WALL_H, 5.6, interiorWall, -2.4, WALL_H / 2, 0);
  box(back, 5, 0.18, 0.04, '#b9bdaa', 0, 0.09, -2.78, { cast: false });
  box(back, 0.04, 0.18, 5.6, '#b9bdaa', -2.28, 0.09, 0, { cast: false });

  // muros frontales: se "bajan" al pasar a la escena 2
  const front = new Group();
  world.add(front);

  const frontShape = new Shape();
  frontShape.moveTo(-2.5, 0);
  frontShape.lineTo(0.4, 0);
  frontShape.lineTo(0.4, 2.05);
  frontShape.lineTo(1.4, 2.05);
  frontShape.lineTo(1.4, 0);
  frontShape.lineTo(2.5, 0);
  frontShape.lineTo(2.5, WALL_H);
  frontShape.lineTo(0, WALL_H + RIDGE);
  frontShape.lineTo(-2.5, WALL_H);
  frontShape.closePath();
  const windowHole = new Path();
  windowHole.moveTo(-1.9, 1.0);
  windowHole.lineTo(-0.7, 1.0);
  windowHole.lineTo(-0.7, 1.95);
  windowHole.lineTo(-1.9, 1.95);
  windowHole.closePath();
  const gableHole = new Path();
  gableHole.moveTo(-0.32, 2.95);
  gableHole.lineTo(0.32, 2.95);
  gableHole.lineTo(0.32, 3.55);
  gableHole.lineTo(-0.32, 3.55);
  gableHole.closePath();
  frontShape.holes.push(windowHole, gableHole);
  const frontWall = addMesh(front, new ExtrudeGeometry(frontShape, { depth: 0.2, bevelEnabled: false }), '#cbc8b6', 0, 0, 2.8);
  frontWall.castShadow = true;

  const sideWall = box(front, 0.2, WALL_H, 5.6, '#b3bba5', 2.4, WALL_H / 2, 0);
  sideWall.receiveShadow = true;
  box(front, 5, 0.26, 0.05, '#a9a793', 0, 0.13, 3.02, { cast: false });
  box(front, 0.05, 0.26, 5.6, '#98a48b', 2.52, 0.13, 0, { cast: false });
  // listones verticales del muro lateral
  for (let i = 0; i < 11; i++) box(front, 0.06, WALL_H - 0.3, 0.07, '#97a38a', 2.53, WALL_H / 2 + 0.1, -2.5 + i * 0.5, { cast: false });
  // marcos de las ventanas y vidrio
  const glass = '#86ad9c';
  const trim = '#5f7b6b';
  box(front, 1.2, 0.95, 0.05, glass, -1.3, 1.475, 2.9, { cast: false, mat: { roughness: 0.25 } });
  [
    [1.3, 0.07, 0, 1.0 - 0.02],
    [1.3, 0.07, 0, 1.95 + 0.02],
  ].forEach(([w, h, ox, y]) => box(front, w, h, 0.1, trim, -1.3 + ox, y, 2.95, { cast: false }));
  [-1.9 - 0.02, -0.7 + 0.02, -1.3].forEach((x) => box(front, 0.07, 1.0, 0.1, trim, x, 1.475, 2.95, { cast: false }));
  box(front, 0.64, 0.6, 0.05, glass, 0, 3.25, 2.9, { cast: false, mat: { roughness: 0.25 } });
  box(front, 0.74, 0.07, 0.1, trim, 0, 2.93, 2.95, { cast: false });
  box(front, 0.74, 0.07, 0.1, trim, 0, 3.57, 2.95, { cast: false });
  box(front, 0.07, 0.7, 0.1, trim, -0.35, 3.25, 2.95, { cast: false });
  box(front, 0.07, 0.7, 0.1, trim, 0.35, 3.25, 2.95, { cast: false });

  // letrero en el muro lateral
  const sign = new Mesh(new PlaneGeometry(1.6, 0.83), new MeshStandardMaterial({ map: signTexture(), roughness: 0.9 }));
  sign.rotation.y = Math.PI / 2;
  sign.position.set(2.58, 1.4, 1.9);
  sign.receiveShadow = true;
  front.add(sign);
  box(front, 0.04, 0.95, 1.72, '#5f7b6b', 2.555, 1.4, 1.9, { cast: false });

  // puerta (bisagra en x = 0.4; el eje Y la abre hacia dentro)
  const doorPivot = new Group();
  doorPivot.position.set(0.4, 0.12, 2.93);
  front.add(doorPivot);
  box(doorPivot, 1.0, 1.93, 0.08, '#34503f', 0.5, 0.965, 0);
  box(doorPivot, 0.34, 0.9, 0.09, '#9cb8a8', 0.5, 1.15, 0, { cast: false, mat: { roughness: 0.25 } });
  ball(doorPivot, 0.045, '#d8c58a', 0.88, 0.95, 0.07, 1, { cast: false });
  box(front, 1.16, 0.06, 0.12, trim, 0.9, 2.08, 2.95, { cast: false });
  box(front, 0.06, 2.0, 0.12, trim, 0.37, 1.05, 2.95, { cast: false });
  box(front, 0.06, 2.0, 0.12, trim, 1.43, 1.05, 2.95, { cast: false });

  // escalones del acceso
  box(world, 2.5, 0.12, 1.5, '#d3c3b0', 0.9, 0.06, 3.85);
  box(world, 2.1, 0.24, 0.8, '#cdbca8', 0.9, 0.12, 3.3);

  // techo (se eleva y se desvanece en la escena 2)
  const roof = new Group();
  world.add(roof);
  const slabLen = Math.hypot(2.5, RIDGE) + 0.5;
  const slope = Math.atan2(RIDGE, 2.5);
  [1, -1].forEach((side) => {
    const pivot = new Group();
    pivot.position.set(0, WALL_H + RIDGE + 0.04, 0);
    pivot.rotation.z = -side * slope;
    const slab = box(pivot, slabLen, 0.16, 6.9, '#7d8c7a', side * (slabLen / 2 - 0.1), 0, 0);
    for (let i = 0; i < 12; i++) {
      const rib = new Mesh(new BoxGeometry(slabLen - 0.05, 0.05, 0.055), std('#6a7967'));
      rib.position.set(0, 0.1, -3.2 + i * 0.58);
      rib.castShadow = true;
      slab.add(rib);
    }
    roof.add(pivot);
  });
  box(roof, 0.3, 0.1, 6.9, '#667563', 0, WALL_H + RIDGE + 0.14, 0);
  // gablete trasero
  const gable = new Shape();
  gable.moveTo(-2.5, 0);
  gable.lineTo(2.5, 0);
  gable.lineTo(0, RIDGE);
  gable.closePath();
  addMesh(roof, new ExtrudeGeometry(gable, { depth: 0.2, bevelEnabled: false }), interiorWall, 0, WALL_H, -3.0);
  // chimenea
  box(roof, 0.62, 2.2, 0.62, '#b9ac9b', -1.2, 3.85, -1.4);
  box(roof, 0.78, 0.14, 0.78, '#a39787', -1.2, 5.02, -1.4);
  box(roof, 0.4, 0.04, 0.4, '#5d5347', -1.2, 5.1, -1.4, { cast: false });

  /* — interior — */
  const interior = new Group();
  world.add(interior);
  const floorMap = floorTexture();
  floorMap.wrapS = floorMap.wrapT = RepeatWrapping;
  floorMap.repeat.set(2.4, 2.9);
  const floorMat = new MeshStandardMaterial({ map: floorMap, roughness: 0.95 });
  const floor = new Mesh(new BoxGeometry(4.8, 0.12, 5.6), floorMat);
  floor.position.set(0.1, 0.06, 0);
  floor.receiveShadow = true;
  interior.add(floor);

  // pizarrones en el muro del fondo
  const boardsList = [];
  const textMaps = [];
  const frameColor = '#4d6a4f';
  const boards = [
    { x: -0.95, title: ['Tu lugar', 'en internet.'], sub: 'Web · Catálogo · Conecta' },
    { x: 1.15, title: ['De idea', 'a proyecto.'], sub: 'Planeamos en fácil' },
  ].map(({ x, title, sub }) => {
    const g = new Group();
    g.position.set(x, 1.95, -2.78);
    g.userData.index = boardsList.length;
    box(g, 1.78, 1.12, 0.06, frameColor, 0, 0, 0);
    const face = new Mesh(new PlaneGeometry(1.6, 0.94), new MeshStandardMaterial({ map: boardTexture(title, sub), roughness: 0.9 }));
    face.position.z = 0.035;
    face.receiveShadow = true;
    g.add(face);
    g.userData.face = face;
    textMaps.push(face.material.map);
    boardsList.push(g);
    interior.add(g);
    return g;
  });

  // sofá contra el muro izquierdo
  const sofa = new Group();
  sofa.position.set(-1.8, 0.12, 0.2);
  box(sofa, 0.95, 0.38, 2.0, '#889d6c', 0, 0.2, 0);
  box(sofa, 0.3, 0.62, 2.0, '#7c9161', -0.33, 0.52, 0);
  box(sofa, 0.95, 0.52, 0.3, '#7c9161', 0, 0.38, -0.85);
  box(sofa, 0.95, 0.52, 0.3, '#7c9161', 0, 0.38, 0.85);
  box(sofa, 0.62, 0.18, 1.35, '#97ab7d', 0.1, 0.48, 0);
  interior.add(sofa);

  // alfombra y mesita
  const stripes = stripeTexture();
  stripes.wrapS = stripes.wrapT = RepeatWrapping;
  stripes.repeat.set(1, 1);
  const rug = new Mesh(new BoxGeometry(2.1, 0.02, 1.5), new MeshStandardMaterial({ map: stripes, roughness: 1 }));
  rug.position.set(-0.7, 0.13, 0.7);
  rug.receiveShadow = true;
  interior.add(rug);
  const table = new Group();
  table.position.set(-0.7, 0.14, 0.7);
  cyl(table, 0.5, 0.5, 0.06, '#b28e68', 0, 0.33, 0, 24);
  cyl(table, 0.07, 0.07, 0.3, '#8c6d4d', 0, 0.16, 0, 10);
  cyl(table, 0.26, 0.26, 0.05, '#8c6d4d', 0, 0.02, 0, 16);
  box(table, 0.36, 0.05, 0.28, '#7c9a6a', 0.05, 0.39, 0.02, { cast: false });
  box(table, 0.3, 0.02, 0.22, '#f1efe4', 0.05, 0.425, 0.02, { cast: false });
  interior.add(table);

  // escritorio, monitor y accesorios
  const desk = new Group();
  desk.position.set(0.8, 0.12, -2.1);
  box(desk, 2.0, 0.09, 0.8, '#c9a173', 0, 0.76, 0);
  box(desk, 0.08, 0.72, 0.7, '#a98456', -0.9, 0.36, 0);
  box(desk, 0.08, 0.72, 0.7, '#a98456', 0.9, 0.36, 0);
  box(desk, 1.7, 0.6, 0.04, '#a98456', 0, 0.42, -0.34, { cast: false });
  box(desk, 0.44, 0.015, 0.3, '#f6f4ea', 0.4, 0.81, 0.1, { cast: false });
  box(desk, 0.5, 0.025, 0.18, '#394439', 0.0, 0.82, 0.22, { cast: false });
  // teléfono de oficina
  const phone = new Group();
  phone.position.set(-0.65, 0.805, 0.05);
  phone.scale.setScalar(1.35);
  box(phone, 0.3, 0.06, 0.26, '#2e3b31', 0, 0.03, 0);
  const plate = box(phone, 0.22, 0.02, 0.14, '#414f44', 0, 0.075, 0.045);
  plate.rotation.x = -0.22;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const key = new Mesh(new BoxGeometry(0.036, 0.012, 0.024), std('#dcdfd0'));
      key.position.set((c - 1) * 0.052, 0.014, -0.045 + r * 0.03);
      plate.add(key);
    }
  }
  box(phone, 0.05, 0.09, 0.05, '#2e3b31', -0.1, 0.1, -0.09);
  box(phone, 0.05, 0.09, 0.05, '#2e3b31', 0.1, 0.1, -0.09);
  const handset = new Group();
  handset.position.set(0, 0.17, -0.09);
  box(handset, 0.3, 0.032, 0.055, '#3a4b3e', 0, 0, 0);
  cyl(handset, 0.042, 0.042, 0.06, '#2e3b31', -0.15, -0.012, 0, 14);
  cyl(handset, 0.042, 0.042, 0.06, '#2e3b31', 0.15, -0.012, 0, 14);
  phone.add(handset);
  ball(phone, 0.012, '#9bd06a', 0.1, 0.067, 0.115, 1, { cast: false });
  desk.add(phone);
  interior.add(desk);

  const monitor = new Group();
  monitor.position.set(0.8, 0.93, -2.38);
  box(monitor, 0.3, 0.03, 0.2, '#2e3b31', 0, 0, 0);
  box(monitor, 0.06, 0.28, 0.06, '#2e3b31', 0, 0.14, 0);
  box(monitor, 1.02, 0.66, 0.06, '#2e3b31', 0, 0.58, 0.02);
  const screen = new Mesh(new PlaneGeometry(0.92, 0.57), new MeshStandardMaterial({ map: monitorTexture(), roughness: 0.6 }));
  screen.position.set(0, 0.58, 0.056);
  monitor.add(screen);
  interior.add(monitor);

  cyl(interior, 0.07, 0.06, 0.12, '#f4f1e6', 1.55, 0.93 + 0.06, -2.1, 14);
  const mug = interior.children[interior.children.length - 1];
  mug.position.set(1.55, 0.93 + 0.06, -2.05);

  // silla frente al escritorio
  const chair = new Group();
  chair.position.set(0.8, 0.12, -1.2);
  chair.rotation.y = 0.12;
  box(chair, 0.6, 0.08, 0.6, '#8f9d86', 0, 0.5, 0);
  box(chair, 0.6, 0.62, 0.07, '#8f9d86', 0, 0.86, 0.28);
  [
    [-0.24, -0.24],
    [0.24, -0.24],
    [-0.24, 0.24],
    [0.24, 0.24],
  ].forEach(([cx, cz]) => box(chair, 0.06, 0.48, 0.06, '#6d7a66', cx, 0.24, cz));
  interior.add(chair);

  // repisa de cajas apiladas
  const shelf = new Group();
  shelf.position.set(2.05, 0.12, -2.35);
  box(shelf, 0.6, 0.4, 0.6, '#aab69e', 0, 0.2, 0);
  box(shelf, 0.52, 0.34, 0.52, '#9fac93', 0, 0.57, 0);
  box(shelf, 0.46, 0.3, 0.46, '#b7c2ab', 0, 0.89, 0);
  box(shelf, 0.4, 0.26, 0.4, '#a4b198', 0, 1.17, 0);
  box(shelf, 0.46, 0.05, 0.46, '#8d9a82', 0, 1.33, 0);
  // cada caja de la repisa es una etapa de la ruta de paquetes
  [
    ['01', '#aab69e', 0.6, 0.2],
    ['02', '#9fac93', 0.52, 0.57],
    ['03', '#b7c2ab', 0.46, 0.89],
    ['04', '#a4b198', 0.4, 1.17],
  ].forEach(([label, bg, depth, y]) => {
    const tag = new Mesh(
      new PlaneGeometry(0.3, 0.15),
      new MeshStandardMaterial({
        map: canvasTexture(256, 128, (ctx, w, h) => {
          ctx.fillStyle = '#f4f3ec';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#1d2820';
          ctx.font = `600 84px ${HEADING}`;
          ctx.textAlign = 'center';
          ctx.fillText(label, w / 2, h / 2 + 30);
        }),
        roughness: 0.9,
      }),
    );
    tag.position.set(0, y, depth / 2 + 0.003);
    shelf.add(tag);
  });
  interior.add(shelf);

  // archivero (preguntas frecuentes)
  const cabinet = new Group();
  cabinet.position.set(-2.0, 0.12, -2.1);
  box(cabinet, 0.6, 1.1, 0.6, '#a1b095', 0, 0.55, 0);
  box(cabinet, 0.64, 0.04, 0.64, '#8f9d86', 0, 1.12, 0);
  [0.2, 0.56, 0.92].forEach((y) => {
    box(cabinet, 0.52, 0.3, 0.02, '#b6c4aa', 0, y, 0.31);
    box(cabinet, 0.2, 0.03, 0.03, '#6d7a66', 0, y + 0.06, 0.34, { cast: false });
    box(cabinet, 0.14, 0.07, 0.012, '#f4f3ec', 0, y - 0.07, 0.325, { cast: false });
  });
  interior.add(cabinet);

  plant(interior, 1.75, 1.7, 1.15);
  plant(interior, -2.0, 2.4, 0.85, '#b9a28a');

  /* — decoración exterior — */
  const garden = new Group();
  world.add(garden);
  [-2.1, -0.75, 0.6, 1.95].forEach((z, i) => ball(garden, 0.56 - (i % 2) * 0.04, i % 2 ? '#6a8a4a' : '#78975a', 3.55, 0.42, z, 0.72));
  plant(garden, -3.05, 3.7, 1.1);
  plant(garden, 3.0, 3.75, 1.1, '#bfa28a');
  cyl(garden, 0.34, 0.34, 0.8, '#889a70', -3.5, 0.4, 2.6, 18);
  cyl(garden, 0.36, 0.36, 0.05, '#778860', -3.5, 0.82, 2.6, 18);
  box(garden, 3.4, 0.14, 0.7, '#d3c3b0', -0.2, 0.07, 4.9, { cast: false });
  ball(garden, 0.34, '#7b9a5a', -3.9, 0.22, 4.7, 0.7);
  ball(garden, 0.28, '#6a8a4a', -3.35, 0.2, 4.55, 0.7);

  // En la vista del portafolio los pizarrones muestran capturas del trabajo real.
  const shotMaps = [];
  let shotsRequested = false;
  const shotTexture = (url, contain) => {
    const texture = canvasTexture(1024, 640, (ctx, w, h) => {
      ctx.fillStyle = '#f8f7f1';
      ctx.fillRect(0, 0, w, h);
    });
    const image = new Image();
    image.onload = () => {
      const scale = contain ? Math.min(940 / image.width, 580 / image.height) : Math.max(1024 / image.width, 640 / image.height);
      const iw = image.width * scale;
      const ih = image.height * scale;
      const ctx = texture.image.getContext('2d');
      ctx.fillStyle = '#f8f7f1';
      ctx.fillRect(0, 0, 1024, 640);
      ctx.drawImage(image, (1024 - iw) / 2, (640 - ih) / 2, iw, ih);
      texture.needsUpdate = true;
      dirty = true;
    };
    image.src = url;
    return texture;
  };
  const loadShots = () => {
    if (shotsRequested) return;
    shotsRequested = true;
    shotMaps.push(
      shotTexture(new URL('../assets/portfolio/nodemarket-desktop.jpg', import.meta.url).href, false),
      shotTexture(new URL('../assets/portfolio/nodemarket-mobile.jpg', import.meta.url).href, true),
    );
  };
  let showingShots = false;
  const showShots = (on) => {
    if (on === showingShots) return;
    if (on) loadShots();
    if (on && !shotMaps.length) return;
    showingShots = on;
    boardsList.forEach((board, i) => {
      board.userData.face.material.map = on ? shotMaps[i] : textMaps[i];
      board.userData.face.material.needsUpdate = true;
    });
    dirty = true;
  };

  /* — grupos que se desvanecen — */
  const collect = (group) => {
    const list = { materials: [], meshes: [] };
    group.traverse((obj) => {
      if (!obj.isMesh) return;
      list.meshes.push({ mesh: obj, cast: obj.castShadow });
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => !list.materials.includes(m) && list.materials.push(m));
    });
    return list;
  };
  const roofParts = collect(roof);
  const frontParts = collect(front);
  const fade = (parts, opacity) => {
    parts.materials.forEach((m) => {
      m.opacity = opacity;
      m.transparent = opacity < 0.999;
    });
  };
  const castShadows = (parts, on) => parts.meshes.forEach(({ mesh, cast }) => (mesh.castShadow = on && cast));

  /* — red de nodos de la casa — */
  const nodeCount = NODES.length;
  const total = nodeCount + AMBIENT;
  const positions = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const alphas = new Float32Array(total);
  const world0 = NODES.map((n) => new Vector3(...n.pos));
  const ambient = Array.from({ length: AMBIENT }, (_, i) => {
    const a = (i / AMBIENT) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.6;
    const r = 6.2 + ((i * 37) % 7) * 0.55;
    return {
      base: new Vector3(Math.cos(a) * r, 0.8 + ((i * 53) % 10) * 0.55, Math.sin(a) * r * 1.05),
      phase: i * 1.7,
    };
  });
  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  pointGeometry.setAttribute('aSize', new BufferAttribute(sizes, 1).setUsage(DynamicDrawUsage));
  pointGeometry.setAttribute('aAlpha', new BufferAttribute(alphas, 1).setUsage(DynamicDrawUsage));
  const pointMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new Color(NODE_COLORS.light) }, uScale: { value: 600 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      uniform float uScale;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uScale / -mv.z, 3.0, 26.0) * uPixelRatio;
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.5, 0.36, d);
        float halo = smoothstep(0.5, 0.0, d) * 0.28;
        float a = max(core, halo) * vAlpha;
        if (a < 0.01) discard;
        vec3 c = mix(uColor, vec3(1.0), smoothstep(0.22, 0.0, d) * 0.55);
        gl_FragColor = vec4(c, a);
      }
    `,
  });
  const points = new Points(pointGeometry, pointMaterial);
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene.add(points);

  // conexiones: una malla por escena (estáticas) + las que van a los nodos flotantes (dinámicas)
  const linkColor = new Color(LINK_COLORS.light);
  const sceneLines = POSES.map((_, s) => {
    const verts = [];
    const ids = NODES.map((n, i) => (n.scenes.includes(s) ? i : -1)).filter((i) => i >= 0);
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        if (world0[ids[a]].distanceTo(world0[ids[b]]) < 4.4) verts.push(...world0[ids[a]].toArray(), ...world0[ids[b]].toArray());
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    const material = new LineBasicMaterial({ color: linkColor, transparent: true, opacity: 0 });
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.renderOrder = 2;
    scene.add(lines);
    return lines;
  });
  const MAX_FLOAT_LINKS = 70;
  const floatPositions = new Float32Array(MAX_FLOAT_LINKS * 6);
  const floatGeometry = new BufferGeometry();
  floatGeometry.setAttribute('position', new BufferAttribute(floatPositions, 3).setUsage(DynamicDrawUsage));
  floatGeometry.setDrawRange(0, 0);
  const floatMaterial = new LineBasicMaterial({ color: linkColor, transparent: true, opacity: 0.3 });
  const floatLines = new LineSegments(floatGeometry, floatMaterial);
  floatLines.frustumCulled = false;
  floatLines.renderOrder = 1;
  scene.add(floatLines);

  /* — estado de la animación — */
  const view = { width: 1, height: 1, narrow: false, pixelRatio: 1, panel: false };
  const current = { p: 0, exit: 0, door: 0, open: 0 };
  const cam = { target: POSES[0].target.clone(), az: POSES[0].az, el: POSES[0].el, vw: POSES[0].vw, vh: POSES[0].vh };
  const sw = POSES.map((_, i) => (i === 0 ? 1 : 0)); // peso (0..1) de la vista activa: decide qué nodos se ven
  const hover = new Map(NODES.map((n) => [n.id, 0]));
  const bumpTargets = {
    board: [boardsList[0]],
    board2: [boardsList[1]],
    monitor: [monitor],
    screen: [monitor],
    shelf: [shelf],
    sofa: [sofa],
    desk: [desk],
    chair: [chair],
    plant: [],
  };
  const flash = new Map();
  let dirty = true;
  let lastNodeColor = '';
  let time = 0;
  const tmp = new Vector3();
  const lookDir = new Vector3();
  let fonts = false;

  // Pose meta para un progreso continuo (el recorrido del inicio) o un índice entero (una página).
  const goalPose = (p) => {
    const i = MathUtils.clamp(Math.floor(p), 0, POSES.length - 2);
    const f = smooth(p - i);
    const a = POSES[i];
    const b = POSES[i + 1];
    return {
      target: tmp.lerpVectors(a.target, b.target, f),
      az: MathUtils.lerp(a.az, b.az, f),
      el: MathUtils.lerp(a.el, b.el, f),
      vw: MathUtils.lerp(a.vw, b.vw, f),
      vh: MathUtils.lerp(a.vh, b.vh, f),
    };
  };

  const placeCamera = () => {
    const aspect = view.width / view.height;
    // panel: el objeto va al centro y el contenido se acomoda a la derecha, junto a él
    const fracW = view.narrow ? 1 : view.panel ? 0.34 : 0.56;
    const fracH = view.narrow ? 0.56 : 0.9;
    const shrink = view.narrow ? 0.72 : 1;
    const dist = Math.max((cam.vw * shrink) / (2 * TAN * aspect * fracW), (cam.vh * shrink) / (2 * TAN * fracH));
    const az = MathUtils.degToRad(cam.az);
    const el = MathUtils.degToRad(cam.el);
    camera.position.set(
      cam.target.x + Math.sin(az) * Math.cos(el) * dist,
      cam.target.y + Math.sin(el) * dist,
      cam.target.z + Math.cos(az) * Math.cos(el) * dist,
    );
    camera.lookAt(cam.target);
    camera.aspect = aspect;
    // La casa se corre hacia la derecha (o hacia abajo en pantallas angostas) para dejar espacio al texto.
    const shiftX = view.narrow ? 0 : view.panel ? -view.width * 0.03 : view.width * 0.2;
    const shiftY = view.narrow ? view.height * 0.2 : 0;
    camera.setViewOffset(view.width, view.height, -shiftX, -shiftY + current.exit, view.width, view.height);
    camera.updateMatrixWorld();
  };

  const setNodeColors = (theme) => {
    const key = theme === 'dark' ? 'dark' : 'light';
    if (key === lastNodeColor) return;
    lastNodeColor = key;
    pointMaterial.uniforms.uColor.value.set(NODE_COLORS[key]);
    sceneLines.forEach((l) => l.material.color.set(LINK_COLORS[key]));
    floatMaterial.color.set(LINK_COLORS[key]);
  };

  function update(delta, state, { snap = false } = {}) {
    time += delta;
    view.panel = !!state.housePanel && !view.narrow;
    const k = snap ? 1 : 1 - Math.exp(-delta * 5.5);
    const prevOpen = current.open;
    current.p += (state.house - current.p) * k;
    const goal = goalPose(state.house);
    cam.target.lerp(goal.target, k);
    cam.az += (goal.az - cam.az) * k;
    cam.el += (goal.el - cam.el) * k;
    cam.vw += (goal.vw - cam.vw) * k;
    cam.vh += (goal.vh - cam.vh) * k;
    const active = MathUtils.clamp(Math.round(state.house), 0, POSES.length - 1);
    sw.forEach((w, i) => (sw[i] = w + ((i === active ? 1 : 0) - w) * (snap ? 1 : 1 - Math.exp(-delta * 5))));
    const openGoal = state.house <= 1 ? smooth((state.house - 0.12) / 0.78) : POSES[active].open;
    current.open += (openGoal - current.open) * k;
    current.exit += (state.houseExit - current.exit) * (snap ? 1 : 1 - Math.exp(-delta * 12));
    const doorGoal = state.doorOpen ? 1.7 : state.hotspotHover === 'door' ? 0.3 : 0;
    const prevDoor = current.door;
    current.door += (doorGoal - current.door) * (snap ? 1 : 1 - Math.exp(-delta * 6));
    if (Math.abs(current.open - prevOpen) > 1e-4 || Math.abs(current.door - prevDoor) > 1e-4) dirty = true;

    // Exterior → interior: se levanta el techo y bajan los muros frontales.
    const t = current.open;
    roof.position.y = t * 7;
    roof.visible = t < 0.98;
    fade(roofParts, 1 - smooth(t * 1.15));
    castShadows(roofParts, t < 0.3);
    front.scale.y = Math.max(0.001, 1 - smooth(t * 1.1));
    front.visible = t < 0.98;
    fade(frontParts, 1 - smooth(t * 1.2));
    castShadows(frontParts, t < 0.3);
    doorPivot.rotation.y = current.door;

    // saltito de los objetos al señalarlos
    const hoveredId = state.hotspotHover;
    hover.forEach((value, id) => {
      const goal = hoveredId === id ? 1 : 0;
      const next = value + (goal - value) * (snap ? 1 : 1 - Math.exp(-delta * 9));
      hover.set(id, next);
      const targets = bumpTargets[id];
      if (targets && Math.abs(next - value) > 1e-4) {
        dirty = true;
        targets.forEach((g) => g.scale.setScalar(1 + next * 0.06));
      }
    });

    placeCamera();
    showShots(active === 5);

    // nodos: los de cada escena aparecen con su escena; los flotantes se mueven despacio
    const visibleScene = sw;
    NODES.forEach((node, i) => {
      positions[i * 3] = world0[i].x;
      positions[i * 3 + 1] = world0[i].y;
      positions[i * 3 + 2] = world0[i].z;
      const w = Math.max(...node.scenes.map((sc) => sw[sc]));
      const pulse = 1 + Math.sin(time * 2 + i) * 0.12;
      const f = flash.get(node.id) ?? 0;
      if (f > 0) flash.set(node.id, Math.max(0, f - delta * 1.6));
      sizes[i] = (node.hotspot ? 0.2 : 0.14) * pulse * (1 + hover.get(node.id) * 0.9 + f * 1.4);
      alphas[i] = w * (node.hotspot ? 1 : 0.85);
    });
    const ambientFade = MathUtils.lerp(1, 0.55, t);
    ambient.forEach((a, i) => {
      const o = (nodeCount + i) * 3;
      positions[o] = a.base.x + Math.sin(time * 0.4 + a.phase) * 0.4;
      positions[o + 1] = a.base.y + Math.cos(time * 0.5 + a.phase * 1.3) * 0.32;
      positions[o + 2] = a.base.z + Math.sin(time * 0.35 + a.phase * 0.7) * 0.4;
      sizes[nodeCount + i] = 0.1;
      alphas[nodeCount + i] = 0.55 * ambientFade;
    });
    pointGeometry.attributes.position.needsUpdate = true;
    pointGeometry.attributes.aSize.needsUpdate = true;
    pointGeometry.attributes.aAlpha.needsUpdate = true;
    sceneLines.forEach((lines, s) => (lines.material.opacity = visibleScene[s] * 0.7));

    // conexiones entre nodos flotantes cercanos y con la casa
    let n = 0;
    const put = (ax, ay, az, bx, by, bz) => {
      if (n >= MAX_FLOAT_LINKS) return;
      const o = n * 6;
      floatPositions[o] = ax;
      floatPositions[o + 1] = ay;
      floatPositions[o + 2] = az;
      floatPositions[o + 3] = bx;
      floatPositions[o + 4] = by;
      floatPositions[o + 5] = bz;
      n++;
    };
    for (let i = 0; i < AMBIENT && n < MAX_FLOAT_LINKS; i++) {
      const ai = (nodeCount + i) * 3;
      for (let j = i + 1; j < AMBIENT; j++) {
        const bi = (nodeCount + j) * 3;
        const dx = positions[ai] - positions[bi];
        const dy = positions[ai + 1] - positions[bi + 1];
        const dz = positions[ai + 2] - positions[bi + 2];
        if (dx * dx + dy * dy + dz * dz < 9.5) put(positions[ai], positions[ai + 1], positions[ai + 2], positions[bi], positions[bi + 1], positions[bi + 2]);
      }
    }
    const scenePick = active;
    NODES.forEach((node, i) => {
      if (!node.scenes.includes(scenePick) || !node.hotspot) return;
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < AMBIENT; j++) {
        const o = (nodeCount + j) * 3;
        const d = (positions[o] - positions[i * 3]) ** 2 + (positions[o + 2] - positions[i * 3 + 2]) ** 2 + (positions[o + 1] - positions[i * 3 + 1]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      if (best >= 0) put(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], positions[best], positions[best + 1], positions[best + 2]);
    });
    floatGeometry.setDrawRange(0, n * 2);
    floatGeometry.attributes.position.needsUpdate = true;
    floatMaterial.opacity = 0.3 * ambientFade;

    pointMaterial.uniforms.uScale.value = (view.height * view.pixelRatio) / (2 * TAN);
    pointMaterial.uniforms.uPixelRatio.value = 1;
    setNodeColors(state.theme);

    // puntos del DOM: se posicionan sobre sus nodos
    if (state.hotspots?.length) {
      const away = current.exit > 8;
      state.hotspots.forEach(({ el, anchor, scene: s }) => {
        const index = NODES.findIndex((nd) => nd.id === anchor);
        if (index < 0) return;
        if (state.anchorScreen && el === state.hotspots[0].el) {
          tmp.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]).project(camera);
          state.anchorScreen.x = (tmp.x * 0.5 + 0.5) * view.width;
          state.anchorScreen.y = (-tmp.y * 0.5 + 0.5) * view.height;
          state.anchorScreen.on = !away && sw[s] > 0.85;
        }
        const [px, py, pz] = NODES[index].pill ?? [0, 0.42, 0];
        tmp.set(positions[index * 3] + px, positions[index * 3 + 1] + py, positions[index * 3 + 2] + pz).project(camera);
        const x = (tmp.x * 0.5 + 0.5) * view.width;
        const y = (-tmp.y * 0.5 + 0.5) * view.height;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        const show = !away && sw[s] > 0.85;
        if (el.classList.contains('is-visible') !== show) {
          el.classList.toggle('is-visible', show);
          el.tabIndex = show ? 0 : -1;
        }
      });
    }

    if (dirty) {
      renderer.shadowMap.needsUpdate = true;
      dirty = false;
    }
  }

  function setTheme(theme) {
    const dark = theme === 'dark';
    hemi.intensity = dark ? 0.95 : 1.5;
    hemi.color.set(dark ? '#c7d0ff' : '#fffdf3');
    hemi.groundColor.set(dark ? '#3a4157' : '#c9cdb6');
    sun.intensity = dark ? 1.5 : 2.1;
    sun.color.set(dark ? '#dfe6ff' : '#fff4de');
    terrain.forEach(([mesh, lightColor, darkColor]) => mesh.material.color.set(dark ? darkColor : lightColor));
    dirty = true;
  }

  function resize(width, height, pixelRatio = 1) {
    view.width = width;
    view.height = height;
    view.pixelRatio = pixelRatio;
    view.narrow = width < 880;
    const high = pixelRatio >= 1.5 || width > 900;
    const size = high ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    dirty = true;
  }

  function render() {
    const prev = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = prev;
  }

  function pulse(id) {
    flash.set(id, 1);
  }

  document.fonts?.ready.then(() => {
    if (fonts) return;
    fonts = true;
    redraws.forEach((paint) => paint());
    dirty = true;
  });

  function dispose() {
    scene.traverse((obj) => {
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      mats.forEach((m) => {
        m.map?.dispose?.();
        m.dispose();
      });
    });
    sun.shadow.map?.dispose();
    redraws.length = 0;
  }

  return { scene, camera, update, render, resize, setTheme, pulse, dispose, getProgress: () => current.p };
}
