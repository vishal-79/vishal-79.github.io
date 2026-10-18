/**
 * Proofs: three printed proofs of things Vishal designed, fanned on the desk:
 * the hatad.in page with its map and one parcel outlined, the Crest
 * Intelligence page with its fan of light, and a Gravitace poster with its
 * planet. The proof under the pointer is picked up: it slides toward you and
 * tips its far edge up so you can read it; the others settle, staggered out
 * from it. At rest the parcel on the hatad.in map is the one bright mark. The
 * slider is how high a proof is picked up, in world units.
 *
 * The pattern: one of many. Tweens, a stagger by distance, and a hit test on
 * each proof's resting footprint, top of the stack first.
 */
const { Cam, fit, mk, pointer, poly, proj, rad, register, disposer, rrect, open, seg, tdone, tset, tval, tween, unproj } = HL;

const TH = 0.8, SLIDE = 8, TIP = 26, STEP = 50, LIFT_MAX = 24;

const line = (u0, v0, u1, v1) => [[u0, v0], [u1, v1]];
const box = (u0, v0, u1, v1, r = 1) => { const p = rrect(u0, v0, u1, v1, r, 3).map((q) => [q.u, q.v]); return p.concat([p[0]]); };
const ring = (cu, cv, ru, rv, n = 40) => Array.from({ length: n + 1 }, (_, i) => [cu + ru * Math.cos((i / n) * 2 * Math.PI), cv + rv * Math.sin((i / n) * 2 * Math.PI)]);

/** What is printed on each proof, as polylines in its own frame: [dim lines, firm lines]. */
function hatad() {
  const dim = [line(4, 4, 10, 4), line(48, 4, 60, 4), line(6, 25, 30, 25), line(6, 28, 25, 28), line(6, 34, 24, 34), box(34, 9, 60, 36, 1.6)];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== 1 || j !== 1) dim.push(box(36.5 + i * 8, 11.5 + j * 8, 41.5 + i * 8, 16.5 + j * 8, 0.6));
  return { dim, firm: [line(6, 11, 29, 11), line(6, 15, 31, 15), line(6, 19, 21, 19), box(26, 32.5, 30, 35.5, 0.8)], mark: [[44, 19.5], [50.5, 19], [51, 25.5], [44.5, 26], [44, 19.5]] };
}
function crest() {
  const dim = [line(4, 4, 10, 4), line(44, 4, 60, 4), line(6, 22, 28, 22), line(6, 25, 27, 25), line(6, 28, 22, 28)];
  for (let i = 0; i < 9; i++) dim.push(line(36, 22, 61, 8 + i * 3.5));
  return { dim, firm: [line(6, 12, 25, 12), line(6, 17, 22, 17), box(6, 32, 16, 35.5, 1.7), box(18, 32, 28, 35.5, 1.7), line(28, 22, 36, 22)] };
}
function poster() {
  return { dim: [ring(20, 20, 17, 5), line(6, 49, 15, 49), line(26, 49, 34, 49)], firm: [ring(20, 20, 10.5, 10.5), ring(33, 13, 1.4, 1.4, 12), line(6, 39, 34, 39), line(6, 43.5, 27, 43.5)] };
}

const SHEETS = [
  { name: "gravitace", w: 40, h: 54, x: 4, y: 26, a: -9, art: poster() },
  { name: "crest", w: 64, h: 40, x: 30, y: 2, a: 7, art: crest() },
  { name: "hatad.in", w: 64, h: 40, x: 40, y: 38, a: -4, art: hatad() },
];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let LIFT = value;
  const C = Cam(45, 0.5, 2.6);
  fit(C, [[0, 0, 0], [112, 0, 0], [0, 100, 0], [112, 100, 0], [60, 20, 52], [40, 50, 50], [110, 60, 46]], 200, 170);
  const P = proj(C);
  const g = mk("g", {}, svg);

  const sheets = SHEETS.map((s, i) => {
    const grp = mk("g", {}, g);
    return { ...s, i, base: i * (TH + 0.2), grp, back: mk("path", { class: "lo" }, grp), face: mk("path", { class: "sil" }, grp),
      dim: mk("path", { class: "nf lo" }, grp), firm: mk("path", { class: "nf" }, grp), mark: s.art.mark ? mk("path", { class: "nf hi" }, grp) : null,
      z: tween(0), t: tween(0), drawn: "" };
  });

  /** A point of sheet s, in its own frame, picked up by z and tipped by t degrees about its near edge. */
  function W(s, u, v, z, t, k = 0) {
    const c = Math.cos(rad(t)), sn = Math.sin(rad(t)), vv = s.h - (s.h - v) * c, up = (s.h - v) * sn;
    const ca = Math.cos(rad(s.a)), sa = Math.sin(rad(s.a)), lx = u - s.w / 2, ly = vv - s.h / 2, f = z / LIFT_MAX * SLIDE;
    return P(s.x + s.w / 2 + lx * ca - ly * sa + f, s.y + s.h / 2 + lx * sa + ly * ca + f, s.base + TH + z + up + k);
  }
  const outline = (s) => rrect(0, 0, s.w, s.h, 2.2, 4);
  function draw(s, z, t) {
    const key = z.toFixed(3) + "," + t.toFixed(3);
    if (key === s.drawn) return;
    s.drawn = key;
    const o = outline(s), at = (pts) => pts.map(([u, v]) => W(s, u, v, z, t));
    s.back.setAttribute("d", poly(o.map((q) => W(s, q.u, q.v, z, t, -TH))));
    s.face.setAttribute("d", poly(o.map((q) => W(s, q.u, q.v, z, t))));
    s.dim.setAttribute("d", s.art.dim.map((l) => open(at(l))).join(""));
    s.firm.setAttribute("d", s.art.firm.map((l) => open(at(l))).join(""));
    if (s.mark) s.mark.setAttribute("d", open(at(s.art.mark)));
  }
  sheets.forEach((s) => draw(s, 0, 0));

  let act = -1, order = sheets.slice();
  const B = register(stage, (_dt, now) => {
    let m = false;
    for (const s of sheets) { draw(s, tval(s.z, now), tval(s.t, now)); if (!tdone(s.z, now) || !tdone(s.t, now)) m = true; }
    // a proof that has been put back returns to its place in the stack once it lands
    if (!m && act < 0 && order !== sheets) { sheets.forEach((s) => g.appendChild(s.grp)); order = sheets; }
    return m;
  });
  bag.add(B.unregister);

  /** The proof whose resting footprint holds the point, top of the stack first; -1 for none. */
  function hit([sx, sy]) {
    for (let i = sheets.length - 1; i >= 0; i--) {
      const s = sheets[i], [x, y] = unproj(C, sx, sy, s.base + TH), ca = Math.cos(rad(s.a)), sa = Math.sin(rad(s.a));
      const dx = x - (s.x + s.w / 2), dy = y - (s.y + s.h / 2), u = dx * ca + dy * sa + s.w / 2, v = -dx * sa + dy * ca + s.h / 2;
      if (u >= 0 && u <= s.w && v >= 0 && v <= s.h) return i;
    }
    return -1;
  }

  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    if (a >= 0) { g.appendChild(sheets[a].grp); order = null; }
    sheets.forEach((s, i) => {
      const d = Math.abs(i - from) * STEP;
      tset(s.z, i === a ? Math.min(LIFT, LIFT_MAX) : 0, now, d);
      tset(s.t, i === a ? TIP : 0, now, d);
      s.face.classList.toggle("hi", i === a);
    });
    if (sheets[2].mark) sheets[2].mark.setAttribute("class", a < 0 ? "nf hi" : "nf");
    read.textContent = a < 0 ? "rest" : sheets[a].name;
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), down: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return {
    set: (v) => { LIFT = v; if (act >= 0) { const a = act; act = -2; setActive(a); } },
    destroy: bag.dispose,
  };
}

hairline({
  name: "proofs",
  means: "Proofs of things I designed, fanned on a desk. The one under the pointer is picked up and tipped toward you.",
  rules: [1, 2, 4, 5],
  range: [8, 16, 24],
  mount,
});
