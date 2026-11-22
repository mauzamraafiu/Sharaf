// The prayer figure: a man in a thobe and cap on a prayer mat, posed by joint targets and drawn in flat colours
// (unlit shapes of one colour merge into a single clean outline, like a flat illustration). No eyes are drawn.
// One WebGL renderer is shared by every figure on the page; each figure copies its frame to its own canvas.
import * as T from './vendor/three.module.min.js';

const LEN = { shin: 0.43, thigh: 0.43, spine: 0.5, neck: 0.2, upper: 0.29, fore: 0.3 };
const HIPW = 0.1, SHW = 0.19;
// Side plane: x towards the qiblah, y up. pel = pelvis, lean/nod in degrees, knee = where the knee tends,
// ank = ankle, toe = offset from the ankle, hand = right hand [x, y, z out to the side], handL = left hand if different,
// pole = which way the elbow points, flat = palms on the ground, point = index finger raised.
const POSES = {
  stand: { pel: [0, 0.92], lean: 0, nod: 4, yaw: 0, knee: [0.03, 0.5], ank: [0, 0.07], toe: [0.17, -0.04], hand: [0.04, 0.8, 0.24], pole: [-1, -0.2, 0.5], flat: 0, point: 0 },
  raise: { pel: [0, 0.92], lean: 0, nod: 2, yaw: 0, knee: [0.03, 0.5], ank: [0, 0.07], toe: [0.17, -0.04], hand: [0.13, 1.5, 0.24], pole: [-0.2, -1, 0.9], flat: 0, point: 0 },
  fold: { pel: [0, 0.92], lean: 0, nod: 14, yaw: 0, knee: [0.03, 0.5], ank: [0, 0.07], toe: [0.17, -0.04], hand: [0.2, 1.13, -0.02], handL: [0.17, 1.1, -0.05], pole: [-0.2, -1, 1.2], flat: 0, point: 0 },
  bow: { pel: [-0.08, 0.9], lean: 84, nod: -4, yaw: 0, knee: [0.02, 0.5], ank: [0, 0.07], toe: [0.17, -0.04], hand: [0.07, 0.55, 0.14], pole: [-0.3, 0.2, 1], flat: 0, point: 0 },
  crouch: { pel: [-0.14, 0.6], lean: 34, nod: -6, yaw: 0, knee: [0.24, 0.43], ank: [0, 0.07], toe: [0.17, -0.04], hand: [0.24, 0.5, 0.17], pole: [-1, 0.2, 0.8], flat: 0, point: 0 },
  kneel: { pel: [0.1, 0.48], lean: 6, nod: 6, yaw: 0, knee: [0.15, 0.06], ank: [-0.28, 0.07], toe: [-0.15, -0.03], hand: [0.2, 0.47, 0.15], pole: [-1, 0, 0.6], flat: 0, point: 0 },
  reach: { pel: [0.04, 0.45], lean: 62, nod: 4, yaw: 0, knee: [0.15, 0.06], ank: [-0.28, 0.09], toe: [-0.06, -0.07], hand: [0.6, 0.03, 0.2], pole: [0, 1, 1], flat: 1, point: 0 },
  sujud: { pel: [0.03, 0.46], lean: 114, nod: 14, yaw: 0, knee: [0.15, 0.06], ank: [-0.28, 0.12], toe: [-0.03, -0.1], hand: [0.56, 0.03, 0.22], pole: [0, 1, 1.2], flat: 1, point: 0 },
  sit: { pel: [-0.2, 0.2], lean: 3, nod: 10, yaw: 0, knee: [0.15, 0.06], ank: [-0.28, 0.06], toe: [-0.15, -0.03], hand: [0.05, 0.25, 0.13], pole: [-1, 0.2, 0.7], flat: 0, point: 0 },
  point: { pel: [-0.2, 0.2], lean: 3, nod: 12, yaw: 0, knee: [0.15, 0.06], ank: [-0.28, 0.06], toe: [-0.15, -0.03], hand: [0.05, 0.25, 0.13], pole: [-1, 0.2, 0.7], flat: 0, point: 1 },
  salamR: { pel: [-0.2, 0.2], lean: 3, nod: 2, yaw: 78, knee: [0.15, 0.06], ank: [-0.28, 0.06], toe: [-0.15, -0.03], hand: [0.05, 0.25, 0.13], pole: [-1, 0.2, 0.7], flat: 0, point: 0 },
  salamL: { pel: [-0.2, 0.2], lean: 3, nod: 2, yaw: -78, knee: [0.15, 0.06], ank: [-0.28, 0.06], toe: [-0.15, -0.03], hand: [0.05, 0.25, 0.13], pole: [-1, 0.2, 0.7], flat: 0, point: 0 },
  dua: { pel: [-0.2, 0.2], lean: 3, nod: 8, yaw: 0, knee: [0.15, 0.06], ank: [-0.28, 0.06], toe: [-0.15, -0.03], hand: [0.2, 0.6, 0.08], pole: [-0.2, -1, 0.8], flat: 0, point: 0 },
};
const lerp = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a + (b - a) * t);
function blend(A, B, t) {
  const o = {};
  for (const k of ['pel', 'lean', 'nod', 'yaw', 'knee', 'ank', 'toe', 'hand', 'pole', 'flat', 'point']) o[k] = lerp(A[k], B[k], t);
  o.handL = lerp(A.handL || A.hand, B.handL || B.hand, t);
  return o;
}
const v = (x, y, z = 0) => new T.Vector3(x, y, z);
// Two-bone joint: where the knee or elbow sits between a root and a target, bending towards the pole.
function ik(a, c, l1, l2, pole) {
  const ac = c.clone().sub(a), d0 = ac.length() || 1e-4, d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3), dir = ac.clone().divideScalar(d0);
  const a1 = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a1 * a1));
  const p = pole.clone().sub(a), bend = p.sub(dir.clone().multiplyScalar(p.dot(dir)));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1);
  return { joint: a.clone().add(dir.clone().multiplyScalar(a1)).add(bend.normalize().multiplyScalar(h)), end: a.clone().add(dir.multiplyScalar(d)) };
}

let S = null; // the shared scene
function build() {
  const canvas = document.createElement('canvas');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.clippingPlanes = [new T.Plane(new T.Vector3(0, 1, 0), 0)]; // cloth never sinks through the floor
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0xa9b8b2, 2.1));
  const sun = new T.DirectionalLight(0xfff4e2, 2.4); sun.position.set(0.5, 4.2, 1.1); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 5; sun.shadow.bias = -0.0006;
  Object.assign(sun.shadow.camera, { left: -1.8, right: 1.8, top: 1.9, bottom: -1.2, near: 0.5, far: 8 });
  sun.target.position.set(0.25, 0.4, 0); scene.add(sun, sun.target);
  const mat = (color) => new T.MeshBasicMaterial({ color });
  const M = { robe: mat(0xe9d6ca), sleeve: mat(0xdfc9bc), sleeveFar: mat(0xd3bcae), trim: mat(0xf6ebe4), skin: mat(0xe8ae88), skinFar: mat(0xd99e79), cap: mat(0xe3e3e6), hair: mat(0x16110f), rug: mat(0x9a2a24), edge: mat(0xd2961c) };
  const add = (geo, m, shadow = true) => { const o = new T.Mesh(geo, m); o.castShadow = shadow; o.receiveShadow = true; scene.add(o); return o; };
  // prayer mat and the soft shadow under it
  const edge = add(new T.BoxGeometry(1.84, 0.008, 0.86), M.edge, false); edge.position.set(0.2, 0.004, 0);
  const rug = add(new T.BoxGeometry(1.78, 0.012, 0.8), M.rug, false); rug.position.set(0.2, 0.007, 0);
  const band = add(new T.BoxGeometry(0.05, 0.013, 0.8), M.edge, false); band.position.set(0.96, 0.008, 0);
  const band2 = add(new T.BoxGeometry(0.05, 0.013, 0.8), M.edge, false); band2.position.set(-0.56, 0.008, 0);
  const floor = new T.Mesh(new T.PlaneGeometry(8, 8), new T.ShadowMaterial({ opacity: 0.16 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.016; floor.receiveShadow = true; scene.add(floor);
  const cyl = (rTop, rBot, m) => add(new T.CylinderGeometry(rTop, rBot, 1, 20, 1), m);
  const ball = (r, m) => add(new T.SphereGeometry(r, 24, 16), m);
  const B = { torso: cyl(0.165, 0.185, M.robe), hem: ball(0.185, M.robe), chest: ball(0.165, M.robe), neck: cyl(0.05, 0.055, M.skin), collar: cyl(0.068, 0.075, M.trim), finger: cyl(0.012, 0.014, M.skin),
    lap: cyl(0.125, 0.165, M.robe), skirt: cyl(0.12, 0.125, M.robe), lapB: ball(0.125, M.robe), side: {} };
  for (const s of [1, -1]) { const sl = s === 1 ? M.sleeve : M.sleeveFar, sk = s === 1 ? M.skin : M.skinFar; B.side[s] = {
    thigh: cyl(0.095, 0.11, M.robe), shin: cyl(0.085, 0.095, M.robe), kneeB: ball(0.097, M.robe), hipB: ball(0.11, M.robe), foot: cyl(0.036, 0.046, sk), heel: ball(0.05, sk), toeB: ball(0.038, sk),
    upper: cyl(0.056, 0.066, sl), fore: cyl(0.05, 0.057, sl), elbowB: ball(0.057, sl), shoulderB: ball(0.07, sl), cuff: cyl(0.054, 0.054, M.trim), hand: ball(0.045, sk), thumb: ball(0.02, sk),
  }; }
  const head = new T.Group(); scene.add(head);
  const hadd = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; head.add(o); return o; };
  hadd(new T.SphereGeometry(0.105, 32, 24), M.skin, 0, 0, 0, 1, 1.1, 0.94); // face: no eyes, no mouth
  hadd(new T.SphereGeometry(0.108, 32, 24), M.hair, -0.022, 0.012, 0, 1, 1.08, 0.97); // hair over the back of the head
  hadd(new T.SphereGeometry(0.112, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), M.cap, -0.03, 0.03, 0, 1.02, 1.12, 0.98); // cap
  hadd(new T.SphereGeometry(0.078, 24, 16), M.hair, 0.034, -0.068, 0, 0.95, 0.92, 1.1); // beard along the jaw
  hadd(new T.SphereGeometry(0.05, 20, 14), M.hair, 0.05, -0.12, 0, 0.8, 0.75, 0.8); // its point
  hadd(new T.SphereGeometry(0.018, 12, 10), M.skin, 0.106, -0.008, 0, 1.1, 1.1, 1); // nose
  for (const s of [1, -1]) hadd(new T.SphereGeometry(0.022, 12, 10), M.skin, -0.008, -0.012, s * 0.098, 0.8, 1.2, 0.5); // ears
  const camera = new T.PerspectiveCamera(13, 4 / 3, 0.1, 40);
  return { renderer, scene, camera, B, head, canvas, w: 0, h: 0 };
}
const UP = v(0, 1, 0), Q = new T.Quaternion();
function span(mesh, a, b, sx = 1, sz = 1) { // stretch a unit cylinder from a (its bottom) to b (its top)
  const d = b.clone().sub(a), len = d.length() || 1e-4;
  mesh.position.copy(a).addScaledVector(d, 0.5); mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len)); mesh.scale.set(sx, len, sz);
}
function pose(p, breath) {
  const { B, head } = S, rad = Math.PI / 180;
  const pel = v(p.pel[0], p.pel[1], 0), sd = v(Math.sin(p.lean * rad), Math.cos(p.lean * rad), 0);
  const chest = pel.clone().addScaledVector(sd, LEN.spine + breath * 0.006);
  const ha = (p.lean + p.nod) * rad, hd = v(Math.sin(ha), Math.cos(ha), 0), hpos = chest.clone().addScaledVector(hd, LEN.neck);
  span(B.torso, pel.clone().addScaledVector(sd, -0.1), chest.clone().addScaledVector(sd, -0.02), 0.82, 1.28);
  B.hem.position.copy(pel).addScaledVector(sd, -0.1); B.hem.quaternion.setFromUnitVectors(UP, sd); B.hem.scale.set(0.82, 0.45, 1.28);
  B.chest.position.copy(chest).addScaledVector(sd, -0.04); B.chest.quaternion.setFromUnitVectors(UP, sd); B.chest.scale.set(0.8, 0.5, 1.5);
  span(B.neck, chest, hpos); span(B.collar, chest.clone().addScaledVector(sd, -0.01), chest.clone().addScaledVector(hd, 0.045), 1, 1.25);
  const kneeMid = v(0, 0, 0), ankMid = v(0, 0, 0);
  // the thobe falls as one cloth over both legs
  B._after = () => { span(B.lap, kneeMid, pel, 1, 1.5); span(B.skirt, ankMid.clone().setY(Math.max(ankMid.y, 0.1)), kneeMid, 1, 1.45); B.lapB.position.copy(kneeMid); B.lapB.scale.set(1, 1, 1.45); };
  head.position.copy(hpos);
  const fwd = v(Math.cos(ha), -Math.sin(ha), 0), right = v(0, 0, 1);
  head.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(fwd, hd, right)).multiply(Q.setFromAxisAngle(UP, -p.yaw * rad));
  for (const s of [1, -1]) {
    const b = B.side[s], hip = pel.clone().add(v(0, 0, s * HIPW)), ank = v(p.ank[0], p.ank[1], s * 0.11);
    const leg = ik(hip, ank, LEN.thigh, LEN.shin, v(p.knee[0], p.knee[1], s * 0.12));
    span(b.thigh, leg.joint, hip); span(b.shin, ank, leg.joint); b.kneeB.position.copy(leg.joint); b.hipB.position.copy(hip);
    kneeMid.addScaledVector(leg.joint, 0.5); ankMid.addScaledVector(ank, 0.5);
    const toe = ank.clone().add(v(p.toe[0], p.toe[1], s * 0.015)); toe.y = Math.max(0.035, toe.y);
    span(b.foot, toe, ank); b.heel.position.copy(ank); b.toeB.position.copy(toe);
    const sh = chest.clone().addScaledVector(sd, -0.05).add(v(0, 0, s * SHW)), hsrc = s === 1 ? p.hand : p.handL;
    const arm = ik(sh, v(hsrc[0], hsrc[1], s * hsrc[2]), LEN.upper, LEN.fore, sh.clone().add(v(p.pole[0], p.pole[1], s * p.pole[2])));
    span(b.upper, arm.joint, sh); span(b.fore, arm.end, arm.joint); b.elbowB.position.copy(arm.joint); b.shoulderB.position.copy(sh);
    const fd = arm.end.clone().sub(arm.joint).normalize().lerp(v(1, 0, 0), p.flat).normalize();
    b.hand.position.copy(arm.end).addScaledVector(fd, 0.05); b.hand.position.y = Math.max(0.03, b.hand.position.y);
    b.hand.quaternion.setFromUnitVectors(UP, fd); b.hand.scale.set(0.62 - p.flat * 0.2, 1.7, 1.05 + p.flat * 0.25);
    span(b.cuff, arm.end.clone().addScaledVector(fd, -0.05), arm.end.clone().addScaledVector(fd, 0.005));
    b.thumb.position.copy(b.hand.position).add(v(0, 0.035 * (1 - p.flat), -s * 0.03)).addScaledVector(fd, -0.01);
    if (s === -1) B._after();
    if (s === 1) { const tip = b.hand.position.clone().add(v(0.07, 0.085, 0)); span(B.finger, b.hand.position.clone().addScaledVector(fd, 0.04), tip); B.finger.visible = p.point > 0.05; B.finger.scale.y *= Math.min(1, p.point); }
  }
}
export const names = Object.keys(POSES);
// Attach a figure to a host element. Returns null when 3D is not available on this device.
export function attach(host) {
  try { if (!S) S = build(); } catch { S = null; return null; }
  const cv = document.createElement('canvas'); cv.className = 'fig3d'; host.appendChild(cv);
  const ctx = cv.getContext('2d');
  let az = 0.1, lastArgs = ['stand', 'stand', 0, 0], w = 0, h = 0;
  const size = () => { const cw = Math.min(host.clientWidth || 320, 440); w = Math.round(cw); h = Math.round(cw * 0.74); const dpr = Math.min(window.devicePixelRatio || 1, 2); if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; } cv.style.width = w + 'px'; cv.style.height = h + 'px'; };
  size();
  const draw = (a, b, t, breath) => {
    lastArgs = [a, b, t, breath];
    if (!S || !POSES[a] || !POSES[b]) return;
    if (S.w !== cv.width || S.h !== cv.height) { S.renderer.setSize(cv.width, cv.height, false); S.w = cv.width; S.h = cv.height; S.camera.aspect = cv.width / cv.height; S.camera.updateProjectionMatrix(); }
    pose(blend(POSES[a], POSES[b], t), breath || 0);
    const d = 9.0, el = 0.085, tx = 0.2, ty = 0.85;
    S.camera.position.set(tx + d * Math.sin(az) * Math.cos(el), ty + d * Math.sin(el), d * Math.cos(az) * Math.cos(el)); S.camera.lookAt(tx, ty, 0);
    S.renderer.render(S.scene, S.camera);
    ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(S.canvas, 0, 0);
  };
  // drag sideways to walk around him
  let drag = null;
  const down = (e) => { drag = { x: e.clientX, az }; };
  const move = (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) < 6) return; try { cv.setPointerCapture(e.pointerId); } catch {} az = Math.max(-1.25, Math.min(1.25, drag.az - dx * 0.009)); draw(...lastArgs); };
  const up = () => { drag = null; };
  cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  const ro = new ResizeObserver(() => { const before = w; size(); if (w !== before) draw(...lastArgs); }); ro.observe(host);
  return { draw, dispose: () => { ro.disconnect(); cv.remove(); }, setAz: (x) => { az = x; } };
}
