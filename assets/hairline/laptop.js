/**
 * Laptop: an open laptop with code on its screen. The pointer rests on the
 * keyboard: the keys under it go down, the nearest furthest, on springs, and
 * each new key it crosses types on the screen. Return starts a new line and
 * backspace takes one back. At rest the cursor at the end of the code is the
 * one bright mark; under the pointer, the key is. The slider is the reach of
 * the press, in world units.
 *
 * The pattern: a field, typed. Springs for how far each key goes down, a hit
 * test on the plane of the resting key tops, and the screen redrawn only when
 * a key is struck.
 */
const {
  Cam, clamp, facing, fit, mk, pointer, poly, prism, proj, put, rad, reflect, register, disposer,
  rings, rrect, seg, solid, spring, stepS, unproj,
} = HL;

const W = 120, D = 84, T = 3, LH = 74, OPEN = 106, TK = 1.6;
const U = 6.8, KX = 9, KY = 8, ROW = 7.4, KG = 1.15, KH = 1.5, PRESS = 1.1, CW = 1.9, LINES = 9;
const ROWS = [
  "` 1 2 3 4 5 6 7 8 9 0 - = delete:2",
  "tab:1.5 q w e r t y u i o p [ ] \\:1.5",
  "caps:1.75 a s d f g h j k l ; ' return:2.25",
  "shift:2.25 z x c v b n m , . / shift:2.75",
  "fn ctrl opt cmd:1.25 space:5.5 cmd:1.25 opt ← ↑ →",
].map((r) => r.split(" ").map((t) => { const [n, w] = t.split(":"); return [n, Number(w || 1)]; }));
// The shape of code, by line: indent, then word lengths in characters. It repeats.
const CODE = [
  [0, [5, 8, 4]], [1, [3, 6, 2, 9]], [1, [6, 4]], [2, [4, 7, 3]], [2, [9, 5]], [1, [1]], [1, [6, 3, 10]],
  [0, [1]], [0, []], [0, [6, 9, 2]], [1, [4, 4, 6]], [1, [8, 2, 5]], [2, [7]], [1, [1]], [0, [1]], [0, []],
];
const lenOf = (i) => { const w = CODE[i % CODE.length][1]; return w.length ? w.reduce((a, b) => a + b, 0) + w.length - 1 : 0; };

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let R = value;
  const C = Cam(45, 0.5, 1.72), o = rad(OPEN), co = Math.cos(o), so = Math.sin(o);
  fit(C, [[0, 0, 0], [W, D, 0], [W, 0, 0], [0, D, 0], [2, LH * co, T + LH * so], [W - 2, LH * co, T + LH * so]], 200, 166);
  const P = proj(C), front = facing(C);
  /** A point on the lid: u across, v up from the hinge, k off its face (negative is behind). */
  const L = (u, v, k = 0) => P(u, v * co + k * so, T + v * so - k * co);

  const g = mk("g", {}, svg);
  const [bo, bi] = rings(0, 0, W, D, 5, 1.6);
  reflect(svg, g, P, front, bo, 0, 9);

  // The lid stands behind the base: its back, its face, the bezel, then the code and the cursor on the screen.
  const lidO = rrect(2, 0, W - 2, LH, 4.5, 5), scr = rrect(7, 6, W - 7, LH - 5, 1.6, 3);
  mk("path", { class: "lo", d: poly(lidO.map((q) => L(q.u, q.v, -TK))) }, g);
  mk("path", { class: "sil", d: poly(lidO.map((q) => L(q.u, q.v))) }, g);
  mk("path", { class: "nf lo", d: poly(scr.map((q) => L(q.u, q.v))) }, g);
  const done = mk("path", { class: "nf lo" }, g), now = mk("path", { class: "nf" }, g), cursor = mk("path", { class: "hi" }, g);

  put(solid(g), prism(P, front, bo, bi, 0, T));
  mk("path", { class: "nf lo", d: poly(rrect(KX - 2.5, KY - 2.5, KX + 15 * U + 2.5, KY + 5 * ROW + 1.6, 2.4, 4).map((q) => P(q.u, q.v, T))) }, g);
  mk("path", { class: "nf", d: poly(rrect(41, 53, 79, 77, 3, 4).map((q) => P(q.u, q.v, T))) }, g);

  // The keys, row by row from the far one, so each row covers the one behind it.
  const keys = [];
  ROWS.forEach((row, r) => {
    let acc = 0;
    for (const [name, w] of row) {
      const x0 = KX + acc * U + KG / 2, x1 = x0 + w * U - KG, y0 = KY + r * ROW + KG / 2, y1 = y0 + ROW - KG;
      const [ring, inner] = rings(x0, y0, x1, y1, 1.3, 0.5);
      keys.push({ name, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ring, inner, el: solid(g), sp: spring(0, { eps: 0.005 }), drawn: NaN });
      acc += w;
    }
  });

  // What has been typed: how many characters of each line, and where the cursor is.
  const lens = [];
  for (let i = 0; i < 6; i++) lens.push(lenOf(i));
  let cur = 6, col = 4;
  function strike(name) {
    if (name === "return") { lens[cur] = col; cur++; col = 0; }
    else if (name === "delete") { if (col > 0) col--; else if (cur > 0) { cur--; col = lens[cur]; } }
    else if (col < lenOf(cur)) col++;
    else { lens[cur] = col; cur++; col = 0; }
    drawScreen();
  }
  function drawScreen() {
    const first = Math.max(0, cur - LINES + 1);
    let past = "", live = "";
    for (let i = first; i <= cur; i++) {
      const [ind, words] = CODE[i % CODE.length], v = LH - 12 - (i - first) * 6, n = i === cur ? col : lens[i];
      let at = 0, d = "";
      for (const w of words) {
        const a = Math.min(at, n), b = Math.min(at + w, n);
        if (b > a) d += seg(L(12 + (ind * 3 + a) * CW, v), L(12 + (ind * 3 + b) * CW - 0.6, v));
        at += w + 1;
      }
      if (i === cur) live = d; else past += d;
    }
    done.setAttribute("d", past);
    now.setAttribute("d", live);
    const u = 12 + (CODE[cur % CODE.length][0] * 3 + col) * CW, v = LH - 12 - (cur - first) * 6;
    cursor.setAttribute("d", poly([L(u, v - 1.7), L(u + CW, v - 1.7), L(u + CW, v + 1.7), L(u, v + 1.7)]));
  }
  drawScreen();

  const B = register(stage, (dt) => {
    let m = false;
    for (const k of keys) {
      if (stepS(k.sp, dt)) m = true;
      const z = T + KH - k.sp.x;
      if (z !== k.drawn) { k.drawn = z; put(k.el, prism(P, front, k.ring, k.inner, T, z)); }
    }
    return m;
  });
  bag.add(B.unregister);

  let over = null, act = -1;
  function retarget() {
    let hit = -1;
    keys.forEach((k, i) => {
      let t = 0;
      if (over) {
        const dist = Math.hypot(over[0] - k.cx, over[1] - k.cy);
        t = PRESS * Math.pow(clamp(1 - dist / R, 0, 1), 1.4);
        if (over[0] >= k.x0 - KG / 2 && over[0] <= k.x1 + KG / 2 && over[1] >= k.y0 - KG / 2 && over[1] <= k.y1 + KG / 2) hit = i;
      }
      k.sp.t = hit === i ? PRESS : t;
    });
    if (hit !== act) {
      if (act >= 0) keys[act].el.sil.classList.remove("hi");
      act = hit;
      if (act >= 0) { keys[act].el.sil.classList.add("hi"); strike(keys[act].name); }
      cursor.setAttribute("class", act >= 0 ? "nf" : "hi");
      read.textContent = act >= 0 ? keys[act].name : "rest";
    }
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => { over = unproj(C, p[0], p[1], T + KH); retarget(); },
    down: (p) => { over = unproj(C, p[0], p[1], T + KH); retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { R = v; retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "laptop",
  means: "An open laptop. The keys under the pointer go down, and each key it crosses types on the screen.",
  rules: [1, 3, 4, 8],
  range: [4, 9, 16],
  mount,
});
