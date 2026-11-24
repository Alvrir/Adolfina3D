import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
const debug = params.has('debug');                    // ?debug => panel con coordenadas para elegir el spawn
const allowOrbit = CONFIG.allowOrbit || debug;        // vista general disponible?

// ---------------------------------------------------------------
// Textos iniciales
// ---------------------------------------------------------------
document.title = `${CONFIG.pageTitle} · ${CONFIG.schoolName}`;
$('title').textContent = CONFIG.schoolName;
$('loaderTitle').textContent = CONFIG.schoolName;

// ---------------------------------------------------------------
// Pantalla de carga y avisos
// ---------------------------------------------------------------
const loaderEl = $('loader');
const loaderMsg = $('loaderMsg');
const barEl = loaderEl.querySelector('.bar');
const barFill = $('barFill');

function showLoader(msg, pct = null) {
  loaderEl.classList.remove('hide', 'error');
  loaderEl.style.display = '';
  loaderMsg.textContent = msg;
  if (pct === null) {
    barEl.classList.add('indeterminate');
  } else {
    barEl.classList.remove('indeterminate');
    barFill.style.width = `${Math.round(pct * 100)}%`;
  }
}
function hideLoader() {
  loaderEl.classList.add('hide');
  setTimeout(() => { if (loaderEl.classList.contains('hide')) loaderEl.style.display = 'none'; }, 450);
}
function showError(msg) {
  loaderEl.classList.remove('hide');
  loaderEl.style.display = '';
  loaderEl.classList.add('error');
  loaderMsg.textContent = msg;
}

let toastTimer = null;
function toast(msg, ms = 3800) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

if (location.protocol === 'file:') {
  showError('Esta página no funciona abriéndola con doble clic. Hay que verla desde un servidor (por ejemplo GitHub Pages o "python -m http.server"). Mirá el README.');
  throw new Error('file:// no soportado');
}

// ---------------------------------------------------------------
// Colisiones rápidas (three-mesh-bvh). Si no carga, el modo caminata sigue
// funcionando pero puede ir más lento en modelos pesados.
// ---------------------------------------------------------------
let bvh = null;
try {
  bvh = await import('three-mesh-bvh');
  THREE.Mesh.prototype.raycast = bvh.acceleratedRaycast;
} catch (e) {
  console.warn('No se pudo cargar three-mesh-bvh; colisiones sin aceleración.', e);
}

// ---------------------------------------------------------------
// Escena, cámara, renderer
// ---------------------------------------------------------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcd7ee);

const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 2000);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(60, 120, 40);
scene.add(sun);

let highQuality = !isTouch;
function applyQuality() {
  const cap = highQuality ? 2 : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  resize();
  $('btnQuality').textContent = `Calidad: ${highQuality ? 'alta' : 'baja'}`;
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.screenSpacePanning = true;
controls.enabled = allowOrbit;

// ---------------------------------------------------------------
// Carga de modelos
// ---------------------------------------------------------------
const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(draco);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scaleParam = params.get('scale') !== null ? Number(params.get('scale')) : null;
let norm = null; // transformación compartida por todos los modelos (para que coincidan entre sí)
const entries = new Map(); // id -> { def, holder, box, collisionReady }
let current = null;

function fixMaterial(m) {
  if (!m) return;
  if (m.metalness !== undefined && m.metalness > 0.3) {
    m.metalness = 0;
    m.roughness = Math.max(m.roughness ?? 0.8, 0.7);
  }
  if (CONFIG.doubleSided) m.side = THREE.DoubleSide;
  if (m.map) m.map.anisotropy = maxAniso;
  m.needsUpdate = true;
}

function applyNorm(holder) {
  if (!norm) {
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    let s = scaleParam !== null && !Number.isNaN(scaleParam) ? scaleParam : CONFIG.unitScale;
    if (s === 'auto') s = Math.max(size.x, size.z) > 500 ? 0.01 : 1;
    norm = { s, ox: -c.x * s, oy: -box.min.y * s, oz: -c.z * s };
    console.info('Escala aplicada:', s, 'tamaño original:', size.toArray().map((v) => v.toFixed(1)));
  }
  holder.scale.setScalar(norm.s);
  holder.position.set(norm.ox, norm.oy, norm.oz);
  holder.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(holder);
}

function loadEntry(def) {
  if (def._promise) return def._promise;
  def._promise = new Promise((resolve, reject) => {
    gltfLoader.load(
      def.url,
      (gltf) => {
        const holder = new THREE.Group();
        holder.add(gltf.scene);
        holder.traverse((o) => {
          if (o.isMesh) {
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(fixMaterial);
          }
        });
        const box = applyNorm(holder);
        const entry = { def, holder, box, collisionReady: false };
        entries.set(def.id, entry);
        resolve(entry);
      },
      (ev) => {
        const mb = (ev.loaded / 1048576).toFixed(1);
        if (ev.lengthComputable && ev.total > 0) {
          const tot = (ev.total / 1048576).toFixed(1);
          showLoader(`Descargando "${def.label}"… ${mb} de ${tot} MB`, ev.loaded / ev.total);
        } else {
          showLoader(`Descargando "${def.label}"… ${mb} MB`);
        }
      },
      (err) => {
        def._promise = null;
        reject(err);
      }
    );
  });
  return def._promise;
}

function frameCamera(box) {
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const diag = size.length();
  controls.target.set(c.x, box.min.y + size.y * 0.3, c.z);
  camera.position.set(c.x + diag * 0.55, box.max.y + diag * 0.45, c.z + diag * 0.7);
  camera.far = Math.max(1000, diag * 10);
  camera.updateProjectionMatrix();
  controls.minDistance = 2;
  controls.maxDistance = diag * 2.5;
  controls.update();
}

const modelSwitchEl = $('modelSwitch');
function buildModelSwitch() {
  modelSwitchEl.innerHTML = '';
  if (CONFIG.models.length < 2) { modelSwitchEl.hidden = true; return; }
  for (const def of CONFIG.models) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = def.label;
    b.dataset.id = def.id;
    b.addEventListener('click', () => switchModel(def.id));
    modelSwitchEl.appendChild(b);
  }
}
function markActiveModel() {
  for (const b of modelSwitchEl.querySelectorAll('button')) {
    b.classList.toggle('active', current && b.dataset.id === current.def.id);
  }
}

async function switchModel(id) {
  const def = CONFIG.models.find((m) => m.id === id);
  if (!def || (current && current.def.id === id)) return;
  try {
    if (!entries.has(id)) showLoader(`Cargando "${def.label}"…`, 0);
    const entry = await loadEntry(def);
    if (current) scene.remove(current.holder);
    current = entry;
    scene.add(entry.holder);
    markActiveModel();
    if (mode === 'walk') await prepareCollision(entry);
    hideLoader();
  } catch (err) {
    console.error(err);
    if (!current) {
      showError(`No se pudo cargar "${def.url}". Revisá que el archivo esté en la carpeta models/ y que el nombre coincida exactamente (mayúsculas y minúsculas).`);
    } else {
      hideLoader();
      toast(`No se pudo cargar "${def.label}".`);
    }
  }
}

// ---------------------------------------------------------------
// Colisiones: BVH + raycasting
// ---------------------------------------------------------------
function ensureFloatPositions(g) {
  const p = g.attributes.position;
  if (!p) return;
  if (p.isInterleavedBufferAttribute || !(p.array instanceof Float32Array)) {
    const a = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      a[i * 3] = p.getX(i);
      a[i * 3 + 1] = p.getY(i);
      a[i * 3 + 2] = p.getZ(i);
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  }
}

async function prepareCollision(entry) {
  if (entry.collisionReady) return;
  showLoader('Preparando el modo caminata…');
  await tick();
  const meshes = [];
  entry.holder.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (bvh) {
    for (let i = 0; i < meshes.length; i++) {
      const g = meshes[i].geometry;
      if (!g.boundsTree) {
        try {
          ensureFloatPositions(g);
          g.boundsTree = new bvh.MeshBVH(g);
        } catch (e) {
          console.warn('BVH falló en una malla', e);
        }
      }
      if (i % 6 === 5) {
        showLoader(`Preparando el modo caminata… ${Math.round((i / meshes.length) * 100)}%`, i / meshes.length);
        await tick();
      }
    }
  }
  entry.collisionReady = true;
  hideLoader();
}

const ray = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const _n = new THREE.Vector3();
const _org = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _dir2 = new THREE.Vector3();

function castRay(origin, dir, far, first = true) {
  ray.set(origin, dir);
  ray.near = 0;
  ray.far = far;
  ray.firstHitOnly = first;
  return ray.intersectObject(current.holder, true);
}
function worldNormal(hit, out = _n) {
  if (!hit.face) return out.set(0, 1, 0);
  return out.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
}

// Punto más bajo bajo (x,z): piso de planta baja
function findFloor(x, z, fromY) {
  _org.set(x, fromY, z);
  const hits = castRay(_org, DOWN, 5000, false);
  if (!hits.length) return null;
  return hits[hits.length - 1].point.clone();
}

function configSpawn(entry) {
  const s = CONFIG.spawn;
  if (!s || typeof s.x !== 'number' || typeof s.z !== 'number') return null;
  let y = s.y;
  if (typeof y !== 'number') {
    const f = findFloor(s.x, s.z, entry.box.max.y + 1);
    y = f ? f.y : entry.box.min.y;
  }
  return new THREE.Vector3(s.x, y, s.z);
}

function autoSpawn(entry) {
  const configured = configSpawn(entry);
  if (configured) return configured;
  const b = entry.box;
  const c = b.getCenter(new THREE.Vector3());
  const sz = b.getSize(new THREE.Vector3());
  const cands = [[0, 0]];
  for (const r of [0.1, 0.2, 0.3, 0.4]) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      cands.push([Math.cos(a) * sz.x * r, Math.sin(a) * sz.z * r]);
    }
  }
  for (const [dx, dz] of cands) {
    const p = findFloor(c.x + dx, c.z + dz, b.max.y + 1);
    if (!p) continue;
    _org.set(p.x, p.y + 0.1, p.z);
    if (castRay(_org, UP, 1.7, true).length) continue; // sin espacio libre arriba
    return p;
  }
  return new THREE.Vector3(c.x, b.min.y, c.z);
}

// ---------------------------------------------------------------
// Modo caminata
// ---------------------------------------------------------------
let mode = 'orbit';
let running = false;
const player = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
const joy = { x: 0, y: 0 };
const keys = new Set();
let orbitSaved = null;

const HEADINGS = [0, 0.7, -0.7];
const HEIGHTS = [0.55, 1.2];
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _delta = new THREE.Vector3();

function collide(delta) {
  const dist = delta.length();
  if (dist < 1e-6) return;
  _dir.copy(delta).divideScalar(dist);
  const r = CONFIG.playerRadius;
  for (const h of HEIGHTS) {
    for (const a of HEADINGS) {
      _dir2.copy(_dir).applyAxisAngle(UP, a);
      _org.set(player.pos.x, player.pos.y + h, player.pos.z);
      const hits = castRay(_org, _dir2, (r + dist) * 1.25, true);
      if (!hits.length) continue;
      const hit = hits[0];
      const n = worldNormal(hit);
      n.y = 0;
      if (n.lengthSq() < 1e-6) continue;
      n.normalize();
      if (n.dot(_dir2) > 0) n.negate(); // que apunte hacia la persona
      const dp = hit.distance * Math.abs(n.dot(_dir2)); // distancia perpendicular a la pared
      const after = dp + delta.dot(n);
      if (after < r) {
        delta.addScaledVector(n, Math.min(r - after, 0.12));
      }
    }
  }
}

function snapToGround(dt) {
  _org.set(player.pos.x, player.pos.y + CONFIG.stepHeight, player.pos.z);
  const hits = castRay(_org, DOWN, CONFIG.stepHeight + 4, true);
  if (hits.length) {
    const ty = hits[0].point.y;
    const k = 1 - Math.exp(-dt * 14);
    player.pos.y += (ty - player.pos.y) * k;
  }
}

function updateWalk(dt) {
  dt = Math.min(dt, 0.05);
  let f = joy.y;
  let s = joy.x;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD')) s += 1;
  if (keys.has('KeyA')) s -= 1;
  if (keys.has('ArrowLeft')) player.yaw += 1.8 * dt;
  if (keys.has('ArrowRight')) player.yaw -= 1.8 * dt;

  const len = Math.hypot(f, s);
  if (len > 1) { f /= len; s /= len; }
  const run = running || keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = CONFIG.walkSpeed * (run ? CONFIG.runMultiplier : 1);

  if (len > 0.05) {
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    _fwd.set(-sy, 0, -cy);
    _right.set(cy, 0, -sy);
    _delta.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, s).multiplyScalar(speed * dt);
    collide(_delta);
    player.pos.add(_delta);
  }
  snapToGround(dt);

  camera.position.set(player.pos.x, player.pos.y + CONFIG.eyeHeight, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

async function enterWalk(point = null, opts = {}) {
  if (!current) return;
  await prepareCollision(current);
  orbitSaved = { pos: camera.position.clone(), target: controls.target.clone() };
  player.pitch = 0;
  player.pos.copy(point || autoSpawn(current));
  if (point) {
    // entrada por doble toque: mirar hacia donde apuntaba la vista general
    const dir = camera.getWorldDirection(new THREE.Vector3());
    player.yaw = Math.atan2(-dir.x, -dir.z);
  } else if (CONFIG.spawn && typeof CONFIG.spawn.yaw === 'number') {
    player.yaw = THREE.MathUtils.degToRad(CONFIG.spawn.yaw);
  } else {
    // sin dirección configurada: mirar hacia el centro del edificio
    player.yaw = Math.atan2(player.pos.x, player.pos.z);
  }
  mode = 'walk';
  controls.enabled = false;
  camera.near = 0.08;
  camera.updateProjectionMatrix();
  for (let i = 0; i < 6; i++) snapToGround(0.1);
  $('btnMode').textContent = '🗺️ Vista general';
  $('btnRun').hidden = false;
  $('joy').hidden = !isTouch;
  if (!opts.quiet) toast(isTouch ? 'Joystick para moverte · arrastrá la pantalla para mirar' : 'W A S D para moverte · arrastrá con el mouse para mirar');
}

function exitWalk() {
  mode = 'orbit';
  controls.enabled = true;
  camera.near = 0.1;
  camera.updateProjectionMatrix();
  camera.rotation.set(0, 0, 0);
  if (orbitSaved) {
    camera.position.copy(orbitSaved.pos);
    controls.target.copy(orbitSaved.target);
  }
  controls.update();
  joy.x = joy.y = 0;
  $('joy').hidden = true;
  $('btnRun').hidden = true;
  $('btnMode').textContent = '🚶 Caminar';
}

// ---------------------------------------------------------------
// Entradas: botones, joystick, mirar con el dedo, teclado, doble toque
// ---------------------------------------------------------------
$('btnMode').addEventListener('click', () => { if (mode === 'orbit') enterWalk(); else exitWalk(); });
$('btnRun').addEventListener('click', () => {
  running = !running;
  $('btnRun').textContent = `🏃 Correr: ${running ? 'sí' : 'no'}`;
  $('btnRun').classList.toggle('active', running);
});
$('btnQuality').addEventListener('click', () => { highQuality = !highQuality; applyQuality(); });
$('btnHelp').addEventListener('click', () => { $('help').hidden = false; });
$('btnHelpClose').addEventListener('click', () => { $('help').hidden = true; });
const fsTarget = document.documentElement;
if (!fsTarget.requestFullscreen) {
  $('btnFs').hidden = true;
} else {
  $('btnFs').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else fsTarget.requestFullscreen().catch(() => {});
  });
}

// Joystick
const joyEl = $('joy');
const stickEl = $('stick');
let joyId = null;
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect();
  const max = r.width / 2 - 10;
  let dx = e.clientX - (r.left + r.width / 2);
  let dy = e.clientY - (r.top + r.height / 2);
  const l = Math.hypot(dx, dy);
  if (l > max) { dx *= max / l; dy *= max / l; }
  stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
  const nx = dx / max, ny = -dy / max;
  const mag = Math.hypot(nx, ny);
  if (mag < 0.12) { joy.x = joy.y = 0; } else { joy.x = nx; joy.y = ny; }
}
function endJoy(e) {
  if (e.pointerId !== joyId) return;
  joyId = null;
  joy.x = joy.y = 0;
  stickEl.style.transform = 'translate(0, 0)';
}
joyEl.addEventListener('pointerdown', (e) => {
  joyId = e.pointerId;
  joyEl.setPointerCapture(e.pointerId);
  moveJoy(e);
});
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
joyEl.addEventListener('pointerup', endJoy);
joyEl.addEventListener('pointercancel', endJoy);

// Mirar arrastrando (modo caminata) y doble toque (modo órbita)
let lookId = null, lx = 0, ly = 0;
const LOOK_SENS = 0.005;
let down = null; // para detectar toques
let lastTap = { t: 0, x: 0, y: 0 };
const activePointers = new Set();

canvas.addEventListener('pointerdown', (e) => {
  activePointers.add(e.pointerId);
  down = { t: e.timeStamp, x: e.clientX, y: e.clientY, multi: activePointers.size > 1, moved: false };
  if (mode === 'walk' && lookId === null) {
    lookId = e.pointerId;
    lx = e.clientX;
    ly = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.moved = true;
  if (mode === 'walk' && e.pointerId === lookId) {
    player.yaw -= (e.clientX - lx) * LOOK_SENS;
    player.pitch -= (e.clientY - ly) * LOOK_SENS;
    player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch));
    lx = e.clientX;
    ly = e.clientY;
  }
});
function endPointer(e) {
  activePointers.delete(e.pointerId);
  if (e.pointerId === lookId) lookId = null;
  if (mode === 'orbit' && e.type === 'pointerup' && down && !down.moved && !down.multi) {
    // e.timeStamp = cuándo ocurrió el toque (no cuándo se procesó), así el doble toque
    // sigue funcionando aunque el celular vaya lento con un modelo pesado.
    const now = e.timeStamp;
    if (now - down.t < 350) {
      if (now - lastTap.t < 450 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        lastTap.t = 0;
        pickAndEnter(e.clientX, e.clientY);
      } else {
        lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

async function pickAndEnter(cx, cy) {
  if (!current) return;
  await prepareCollision(current);
  const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ray.near = 0;
  ray.far = Infinity; // castRay() deja un alcance corto de las colisiones
  ray.firstHitOnly = true;
  const hits = ray.intersectObject(current.holder, true);
  if (!hits.length) { toast('Tocá dos veces sobre la escuela para entrar ahí.'); return; }
  const hit = hits[0];
  let p = hit.point.clone();
  if (current.def.roofed) {
    const f = findFloor(p.x, p.z, current.box.max.y + 1);
    if (f) p = f;
  } else {
    const n = worldNormal(hit, new THREE.Vector3());
    if (n.dot(ray.ray.direction) > 0) n.negate();
    if (Math.abs(n.y) < 0.5) {
      // tocó una pared: bajar al piso un poco hacia adelante de la pared
      _org.set(p.x + n.x * 0.6, p.y + 0.2, p.z + n.z * 0.6);
      const down2 = castRay(_org, DOWN, 20, true);
      if (down2.length) p = down2[0].point.clone();
    }
  }
  await enterWalk(p);
}

// Panel de ayuda para elegir el spawn (solo con ?debug)
const dbgText = $('dbgText');
let dbgT = 0;
function yawDeg() {
  let d = THREE.MathUtils.radToDeg(player.yaw) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function updateDebug(dt) {
  dbgT += dt;
  if (dbgT < 0.2) return;
  dbgT = 0;
  dbgText.textContent = `x ${player.pos.x.toFixed(2)}  y ${player.pos.y.toFixed(2)}  z ${player.pos.z.toFixed(2)}  yaw ${Math.round(yawDeg())}°`;
}
function spawnSnippet() {
  return `spawn: { x: ${player.pos.x.toFixed(2)}, y: ${player.pos.y.toFixed(2)}, z: ${player.pos.z.toFixed(2)}, yaw: ${Math.round(yawDeg())} },`;
}
async function copySpawn() {
  if (mode !== 'walk') { toast('Entrá en modo caminata para fijar el punto de inicio.'); return; }
  const text = spawnSnippet();
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copiado. Pegalo en js/config.js:  ${text}`, 7000);
  } catch (e) {
    window.prompt('Copiá esta línea y pegala en js/config.js:', text);
  }
}
$('btnCopySpawn').addEventListener('click', copySpawn);

// Teclado
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (debug && e.code === 'KeyP') copySpawn();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------
// Bucle de render
// ---------------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (mode === 'walk' && current) { updateWalk(dt); if (debug) updateDebug(dt); }
  else controls.update();
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------
async function boot() {
  buildModelSwitch();
  $('btnMode').hidden = !allowOrbit;
  $('debug').hidden = !debug;
  if (!allowOrbit) document.querySelectorAll('.orbit-only').forEach((el) => { el.hidden = true; });
  applyQuality();
  showLoader('Cargando el modelo 3D…', 0);

  let first = null;
  for (const def of CONFIG.models) {
    try {
      first = await loadEntry(def);
      break;
    } catch (err) {
      console.warn(`No se pudo cargar ${def.url}`, err);
    }
  }
  if (!first) {
    const urls = CONFIG.models.map((m) => m.url).join(' o ');
    showError(`No se encontró ningún modelo (${urls}). Copiá tus archivos .glb a la carpeta models/ y revisá que los nombres coincidan con js/config.js.`);
    return;
  }
  current = first;
  scene.add(first.holder);
  frameCamera(first.box);
  markActiveModel();
  if (CONFIG.startMode === 'walk') {
    await enterWalk(null, { quiet: true });
    hideLoader();
  } else {
    hideLoader();
  }
  $('help').hidden = false;
}
boot();
