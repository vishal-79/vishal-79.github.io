/**
 * Drone: a quadcopter holding over its landing pad, props turning. The pointer
 * is put on the ground and the drone flies there on a spring, leaning into the
 * move the way a quad does: it tips toward where it is being pulled, and the
 * two props on the far side, the ones doing the work, take the bright edge
 * until it settles. At rest it holds over the pad, bobbing, and its body is
 * the bright thing. The slider is the reach, in world units.
 *
 * The pattern: a field, flown. Springs for where, a hit test on the ground
 * plane (which never moves), and a lean read from the spring's own pull. The
 * turning props and the bob are the ambient motion.
 */
const {
  Cam, circ, facing, fit, flatDot, hull, mk, open, pointer, poly, prism, proj, put, rad, reducedMotion,
  register, disposer, rings, rrect, run, seg, solid, spring, stepS, unproj, place,
} = HL;

const YAW = rad(-22), H0 = 32, ARM = 24, PR = 11, PAD = 32, TMAX = rad(15);
// A drone has mass: it lags the pointer and overshoots a little, so its springs are softer than the default.
const FLY = { k: 36, c: 8.5, m: 1, eps: 0.02 }, LEAN = { k: 140, c: 22, m: 1, eps: 0.0005 };

/** A ring turned by a radians and moved to (dx, dy), its normals turned with it. */
const at = (ring, dx, dy, a = 0) => {
  const c = Math.cos(a), s = Math.sin(a);
  return ring.map((q) => ({ u: dx + q.u * c - q.v * s, v: dy + q.u * s + q.v * c, nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c }));
};
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const yawed = (pair, la = 0) => pair.map((r) => at(at(r, 0, 0, la), 0, 0, YAW));

/** A two-blade prop, flat, in its own plane: each blade's leading edge fuller than its trailing one. */
const BLADE = (() => {
  const w = (t) => 0.7 + 2.2 * Math.pow(Math.sin(Math.PI * Math.abs(t)), 0.85) * (1 - 0.3 * Math.abs(t));
  const top = [], bot = [];
  for (let i = 0; i <= 24; i++) {
    const t = -1 + i / 12, f = t > 0 ? 1 : 0.5, b = t > 0 ? 0.5 : 1;
    top.push([t * PR, w(t) * f]);
    bot.unshift([t * PR, -w(t) * b]);
  }
  return top.concat(bot);
})();

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let R = value;

  // Fitted to the pad and to the drone at full reach in every direction, props and skids included.
  const C = Cam(45, 0.5, 2.8), far = 18 + ARM + PR, pts = [];
  for (let a = 0; a < 8; a++) pts.push([far * Math.cos(a * Math.PI / 4), far * Math.sin(a * Math.PI / 4), H0 + 14], [far * Math.cos(a * Math.PI / 4), far * Math.sin(a * Math.PI / 4), H0 - 9]);
  fit(C, pts.concat([[-PAD, -PAD, -2], [PAD, PAD, -2], [PAD, -PAD, -2], [-PAD, PAD, -2]]), 200, 160);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // The pad: a thin disc, a ring painted on it, four lights round it.
  const padO = circ(PAD, 48), padI = circ(PAD - 1.6, 48);
  put(solid(g), prism(P, front, padO, padI, -2, 0));
  mk("path", { class: "nf lo", d: poly(circ(PAD - 8, 48).map((q) => P(q.u, q.v, 0))) }, g);
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) place(flatDot(g, C, 0.9, "dot off"), P(x * (PAD - 4), y * (PAD - 4), 0));
  const shadow = mk("path", { class: "dash nf" }, g), plumb = mk("path", { class: "dash nf" }, g);

  // The drone, painted back to front: skids, gimbal, the two far corners, the body, the two near corners.
  const sx = spring(0, FLY), sy = spring(0, FLY), lx = spring(0, LEAN), ly = spring(0, LEAN);
  let px = 0, py = 0, alt = H0, ca = 1, sa = 0, kx = 0, ky = 0;
  /** A point in the drone's frame (already yawed), leaned by the current tilt and carried to where it flies. */
  function M(u, v, z) {
    const kp = kx * u + ky * v;
    const x = u * ca + ky * z * sa + kx * kp * (1 - ca), y = v * ca - kx * z * sa + ky * kp * (1 - ca), w = z * ca + (kx * v - ky * u) * sa;
    return P(px + x, py + y, alt + w);
  }
  const tp = (ring, z) => ring.map((q) => M(q.u, q.v, z));
  const ts = (el, [o, i], z0, z1) => put(el, { sil: poly(hull(tp(o, z0).concat(tp(o, z1)))), crease: open(tp(run(i, front), z1)) });

  const skids = [-7.5, 7.5].map((y) => ({ el: solid(g), r: yawed(rings(-13, y - 0.8, 13, y + 0.8, 0.8, 0.35)) }));
  const struts = mk("path", { class: "nf" }, g);
  const [gx, gy] = rot(8.5, 0, YAW), gimbal = { el: solid(g), r: [at(circ(3, 20), gx, gy), at(circ(2.2, 20), gx, gy)] };
  const corner = (a, i) => {
    const la = rad(a), [mx, my] = rot(ARM, 0, la + YAW);
    return { mx, my, depth: mx + my, dir: i % 2 ? 1 : -1, phi: i * 0.8, wx: Math.cos(la + YAW), wy: Math.sin(la + YAW),
      arm: yawed(rings(10, -1.5, ARM, 1.5, 1.3, 0.6), la), motor: [at(circ(3.2, 20), mx, my), at(circ(2.4, 20), mx, my)] };
  };
  const corners = [45, -45, 135, -135].map(corner).sort((a, b) => a.depth - b.depth);
  const make = (c) => { c.a = solid(g); c.m = solid(g); c.disc = mk("path", { class: "nf lo" }, g); c.blade = mk("path", {}, g); c.cap = mk("path", {}, g); };
  corners.slice(0, 2).forEach(make);
  const body = { el: solid(g), r: yawed(rings(-11.5, -7.5, 11.5, 7.5, 4.5, 1.4)) };
  const batt = { el: solid(g), r: yawed(rings(-8, -4.6, 5, 4.6, 2, 0.8)) }, strap = mk("path", { class: "nf lo" }, g);
  const mast = mk("path", { class: "nf" }, g), [qx, qy] = rot(-9.6, 0, YAW), gps = { el: solid(g), r: [at(circ(2.6, 20), qx, qy), at(circ(1.8, 20), qx, qy)] };
  corners.slice(2).forEach(make);

  function draw(work) {
    const th = Math.hypot(lx.x, ly.x);
    ca = Math.cos(th); sa = Math.sin(th);
    kx = th > 1e-6 ? -ly.x / th : 0; ky = th > 1e-6 ? lx.x / th : 0;
    shadow.setAttribute("d", poly(circ(12 + alt * 0.08, 32).map((q) => P(px + q.u, py + q.v, 0))));
    plumb.setAttribute("d", seg(M(0, 0, -7.4), P(px, py, 0)));
    skids.forEach((s) => ts(s.el, s.r, -7.4, -6.2));
    let d = "";
    for (const [x, y] of [[-6, -6.8], [6, -6.8], [-6, 6.8], [6, 6.8]]) {
      const [a, b] = rot(x, y * 0.75, YAW), [e, f] = rot(x, y * 1.1, YAW);
      d += seg(M(a, b, 0), M(e, f, -6.2));
    }
    struts.setAttribute("d", d);
    ts(gimbal.el, gimbal.r, -3.6, 0);
    for (const c of corners) {
      ts(c.a, c.arm, 2.2, 4);
      ts(c.m, c.motor, 3.2, 7.6);
      c.disc.setAttribute("d", poly(circ(PR, 36).map((q) => M(c.mx + q.u, c.my + q.v, 8.2))));
      c.blade.setAttribute("d", poly(BLADE.map(([u, v]) => { const [e, f] = rot(u, v, c.phi); return M(c.mx + e, c.my + f, 8.2); })));
      c.cap.setAttribute("d", poly(circ(1.4, 12).map((q) => M(c.mx + q.u, c.my + q.v, 8.8))));
      const on = work.includes(c);
      c.m.sil.classList.toggle("hi", on); c.blade.classList.toggle("hi", on);
    }
    ts(body.el, body.r, 0, 6);
    body.el.sil.classList.toggle("hi", work.length === 0);
    ts(batt.el, batt.r, 6, 9.6);
    const [s0, s1] = [rot(-1.5, -4.6, YAW), rot(-1.5, 4.6, YAW)];
    strap.setAttribute("d", seg(M(s0[0], s0[1], 9.6), M(s1[0], s1[1], 9.6)));
    mast.setAttribute("d", seg(M(qx, qy, 6), M(qx, qy, 11)));
    ts(gps.el, gps.r, 11, 12.4);
  }

  let over = null, said = "";
  const B = register(stage, (dt, now) => {
    let m = false;
    for (const s of [sx, sy]) if (stepS(s, dt)) m = true;
    // the lean follows the pull of the flight springs, the way a quad tips to accelerate
    const ax = FLY.k * (sx.t - sx.x) - FLY.c * sx.v, ay = FLY.k * (sy.t - sy.x) - FLY.c * sy.v, an = Math.hypot(ax, ay);
    const tn = Math.min(TMAX, an * 0.0011), dx = an > 1e-6 ? (ax / an) * tn : 0, dy = an > 1e-6 ? (ay / an) * tn : 0;
    lx.t = dx; ly.t = dy;
    for (const s of [lx, ly]) if (stepS(s, dt)) m = true;
    px = sx.x; py = sy.x;
    const still = reducedMotion();
    alt = H0 + (still ? 0 : 1.1 * Math.sin(now / 700));
    const th = Math.hypot(lx.x, ly.x), lean = th > rad(3) ? [lx.x / th, ly.x / th] : null;
    const work = lean ? corners.filter((c) => c.wx * lean[0] + c.wy * lean[1] < -0.2) : [];
    if (!still) for (const c of corners) c.phi += c.dir * dt * (7 + 10 * (th / TMAX) + (work.includes(c) ? 5 : 0));
    draw(work);
    return m || !still;
  });
  bag.add(B.unregister);
  // the props turn and the drone bobs from the start: that is its rest
  B.wake();

  const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  function retarget() {
    let tx = 0, ty = 0;
    if (over) {
      const r = Math.hypot(over[0], over[1]), k = r > R ? R / r : 1;
      tx = over[0] * k; ty = over[1] * k;
    }
    sx.t = tx; sy.t = ty;
    // north is up the screen: world (-1, -1); east is right: world (1, -1)
    const n = -(tx + ty) / Math.SQRT2, e = (tx - ty) / Math.SQRT2, dist = Math.round(Math.hypot(tx, ty));
    const text = !over ? "rest" : dist < 2 ? "hold" : COMPASS[(Math.round(Math.atan2(e, n) / (Math.PI / 4)) + 8) % 8] + " " + dist;
    if (text !== said) read.textContent = said = text;
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => { over = unproj(C, p[0], p[1], 0); retarget(); },
    down: (p) => { over = unproj(C, p[0], p[1], 0); retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());
  read.textContent = said = "rest";

  return {
    set: (v) => { R = v; retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "drone",
  means: "A drone over its pad. Point and it flies there, leaning into the move; the props doing the work light up.",
  rules: [1, 3, 5, 8],
  range: [6, 12, 18],
  mount,
});
