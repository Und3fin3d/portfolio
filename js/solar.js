/* The site's framework — a solar system the page travels through.
   Every planet's position is computed, not drawn: JPL approximate
   Keplerian elements (Standish, valid 1800–2050) propagated to the
   simulated date, Kepler's equation solved by Newton's method each
   frame, positions rotated from each orbital plane to the ecliptic,
   inclinations included. A hand-rolled camera (focus point, zoom,
   yaw + elevation, perspective divide, painter's sort) projects onto
   a fixed canvas; there is no 3D library.

   Each .chapter element declares the body it lives on (data-body).
   Scroll position drives the camera: it holds on a chapter's planet,
   flies to the next between chapters, and pulls out to the whole
   system at the end, where clicking a planet flies you back to its
   section. Radial distances are compressed with r^0.42 so Mercury and
   Neptune share one view; angles are true. */
(() => {
  const canvas = document.getElementById("solar-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const mod360 = x => ((x % 360) + 360) % 360;

  /* [value at J2000, rate per Julian century] */
  const EL = [
    { name: "Mercury", glyph: "☿", col: "oklch(74% 0.015 60)",  px: 2.6,
      a: [0.38709927, 0.00000037],  e: [0.20563593, 0.00001906],  I: [7.00497902, -0.00594749],
      L: [252.25032350, 149472.67411175], W: [77.45779628, 0.16047689],  O: [48.33076593, -0.12534081] },
    { name: "Venus",   glyph: "♀", col: "oklch(85% 0.055 85)",  px: 4.0,
      a: [0.72333566, 0.00000390],  e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890],
      L: [181.97909950, 58517.81538729],  W: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
    { name: "Earth",   glyph: "⊕", col: "oklch(72% 0.09 235)",  px: 4.2,
      a: [1.00000261, 0.00000562],  e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668],
      L: [100.46457166, 35999.37244981],  W: [102.93768193, 0.32327364], O: [0, 0] },
    { name: "Mars",    glyph: "♂", col: "oklch(66% 0.13 40)",   px: 3.4,
      a: [1.52371034, 0.00001847],  e: [0.09339410, 0.00007882],  I: [1.84969142, -0.00813131],
      L: [-4.55343205, 19140.30268499],   W: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
    { name: "Jupiter", glyph: "♃", col: "oklch(77% 0.065 70)",  px: 9.2,
      a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714],
      L: [34.39644051, 3034.74612775],    W: [14.72847983, 0.21252668],  O: [100.47390909, 0.20469106] },
    { name: "Saturn",  glyph: "♄", col: "oklch(83% 0.075 90)",  px: 7.6, ring: true,
      a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609],
      L: [49.95424423, 1222.49362201],    W: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
    { name: "Uranus",  glyph: "♅", col: "oklch(80% 0.055 200)", px: 5.8,
      a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939],
      L: [313.23810451, 428.48202785],    W: [170.95427630, 0.40805281], O: [74.01692503, 0.04240589] },
    { name: "Neptune", glyph: "♆", col: "oklch(64% 0.10 260)",  px: 5.5,
      a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105],  I: [1.77004347, 0.00035372],
      L: [-55.12002969, 218.45945325],    W: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664] },
  ];
  const IDX = Object.fromEntries(EL.map((p, i) => [p.name.toLowerCase(), i]));

  const centuries = ms => (ms / 86400000 + 2440587.5 - 2451545.0) / 36525;

  const elementsAt = (p, T) => ({
    a: p.a[0] + p.a[1] * T,
    e: p.e[0] + p.e[1] * T,
    I: (p.I[0] + p.I[1] * T) * D2R,
    L: p.L[0] + p.L[1] * T,
    W: p.W[0] + p.W[1] * T,
    O: p.O[0] + p.O[1] * T,
  });

  /* orbital-plane position for eccentric anomaly E → 3D ecliptic coords */
  const eclFromE = (el, E) => {
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const w = (el.W - el.O) * D2R, Om = el.O * D2R;
    const cw = Math.cos(w), sw = Math.sin(w);
    const co = Math.cos(Om), so = Math.sin(Om);
    const ci = Math.cos(el.I), si = Math.sin(el.I);
    return {
      x: (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
      y: (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
      z: (sw * si) * xp + (cw * si) * yp,
    };
  };

  const positionAt = (p, T) => {
    const el = elementsAt(p, T);
    let M = mod360(el.L - el.W);
    if (M > 180) M -= 360;
    M *= D2R;
    let E = M + el.e * Math.sin(M);
    for (let k = 0; k < 8; k++) {
      const dE = (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-9) break;
    }
    const pos = eclFromE(el, E);
    return { ...pos, r: Math.hypot(pos.x, pos.y, pos.z), lon: mod360(Math.atan2(pos.y, pos.x) / D2R) };
  };

  /* orbit paths in AU, cached (element drift is invisible at this scale) */
  const T0 = centuries(Date.now());
  const paths = EL.map(p => {
    const el = elementsAt(p, T0);
    const pts = [];
    for (let i = 0; i <= 180; i++) pts.push(eclFromE(el, (i / 180) * TAU));
    return pts;
  });
  const periodDays = EL.map(p => 36525 * 360 / Math.abs(p.L[1]));

  /* ---------- chapters: the site's itinerary ---------- */
  const ZOOM = {
    sun: 1.7, mercury: 3.8, venus: 3.4, earth: 3.2, mars: 2.9,
    jupiter: 2.0, saturn: 1.65, uranus: 1.3, neptune: 1.12, system: 0.95,
  };
  const chapters = [...document.querySelectorAll(".chapter")].map(el => ({
    el, body: el.dataset.body, side: el.dataset.side || "l",
  }));
  const N = chapters.length;
  let centers = [];
  const recalcCenters = () => {
    centers = chapters.map(c => c.el.offsetTop + c.el.offsetHeight / 2);
  };

  /* fill each chapter's ephemeris line from the real elements */
  chapters.forEach(c => {
    const el = c.el.querySelector(".chapter__eph");
    const i = IDX[c.body];
    if (!el || i === undefined) return;
    const p = EL[i], e0 = elementsAt(p, T0), d = periodDays[i];
    const T = d < 1000 ? d.toFixed(1) + " d" : (d / 365.25).toFixed(1) + " yr";
    el.textContent = `${p.glyph} ${p.name} · a ${e0.a.toFixed(3)} AU · e ${e0.e.toFixed(3)} · T ${T}`;
  });

  /* ---------- sim state ---------- */
  let simMs = Date.now();
  let speed = reduced ? 0 : 1;                    /* days per real second */
  let hover = -1;

  /* ---------- camera ---------- */
  let yaw = -0.55;
  let elev = 56 * D2R;
  let userSpun = false;
  const ELEV_MIN = 8 * D2R, ELEV_MAX = 88 * D2R;

  const EXP = 0.42;
  let cw = 0, ch = 0, K = 1, dpr = 1, narrow = false;
  let stars = null;

  const mapR = r => K * Math.pow(r, EXP);
  const warp = pt => {
    const r = Math.hypot(pt.x, pt.y, pt.z) || 1e-9;
    const f = mapR(r) / r;
    return { x: pt.x * f, y: pt.y * f, z: pt.z * f };
  };

  const bodyPos = (body, T) => {
    const i = IDX[body];
    return i === undefined ? { x: 0, y: 0, z: 0 } : warp(positionAt(EL[i], T));
  };

  const anchorOf = c => {
    if (narrow) return { x: 0.5, y: c.body === "sun" ? 0.28 : c.body === "system" ? 0.55 : 0.24 };
    if (c.body === "sun") return { x: 0.64, y: 0.5 };
    if (c.body === "system") return { x: 0.5, y: 0.55 };
    return c.side === "l" ? { x: 0.74, y: 0.46 } : { x: 0.26, y: 0.46 };
  };

  /* scroll → continuous chapter coordinate, eased between centres */
  const smooth = f => f * f * (3 - 2 * f);
  const chapterAt = () => {
    const sc = window.scrollY + window.innerHeight / 2;
    if (!centers.length || sc <= centers[0]) return 0;
    if (sc >= centers[N - 1]) return N - 1;
    let k = 0;
    while (k < N - 2 && sc > centers[k + 1]) k++;
    return k + smooth((sc - centers[k]) / (centers[k + 1] - centers[k]));
  };

  const camTargetOf = (k, T) => {
    const c = chapters[k];
    const a = anchorOf(c);
    return { F: bodyPos(c.body, T), zl: Math.log(ZOOM[c.body] || 1), ax: a.x, ay: a.y };
  };

  let cam = null;
  const camTarget = T => {
    const c = chapterAt();
    const k = Math.floor(c), f = c - k;
    const A = camTargetOf(k, T);
    if (f < 1e-4 || k >= N - 1) return A;
    const B = camTargetOf(k + 1, T);
    return {
      F: { x: A.F.x + (B.F.x - A.F.x) * f, y: A.F.y + (B.F.y - A.F.y) * f, z: A.F.z + (B.F.z - A.F.z) * f },
      zl: A.zl + (B.zl - A.zl) * f,
      ax: A.ax + (B.ax - A.ax) * f,
      ay: A.ay + (B.ay - A.ay) * f,
    };
  };

  /* project a 3D AU point through warp → camera → perspective */
  let zoom = 1, D = 1000;
  const project = pt => {
    const w = warp(pt);
    const rx = (w.x - cam.F.x) * zoom, ry = (w.y - cam.F.y) * zoom, rz = (w.z - cam.F.z) * zoom;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const x1 = rx * cyaw - ry * syaw;
    const y1 = rx * syaw + ry * cyaw;
    const se = Math.sin(elev), ce = Math.cos(elev);
    const y2 = y1 * se + rz * ce;
    const zd = -y1 * ce + rz * se;
    const clip = zd > D * 0.72;
    const s = D / (D - Math.min(zd, D * 0.72));
    return { x: cam.ax * cw + x1 * s, y: cam.ay * ch - y2 * s, s, zd, clip };
  };

  const mulberry = s => () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const makeStars = () => {
    stars = document.createElement("canvas");
    stars.width = cw * dpr;
    stars.height = ch * dpr;
    const sc = stars.getContext("2d");
    sc.scale(dpr, dpr);
    const rnd = mulberry(20260707);
    const n = Math.round((cw * ch) / 5200);
    for (let i = 0; i < n; i++) {
      const x = rnd() * cw, y = rnd() * ch, s = 0.4 + rnd() * 1.1;
      const tint = rnd();
      sc.fillStyle = tint > 0.92 ? "oklch(82% 0.09 85)" : tint > 0.84 ? "oklch(78% 0.05 245)" : "oklch(92% 0.01 85)";
      sc.globalAlpha = 0.12 + rnd() * 0.5;
      sc.beginPath();
      sc.arc(x, y, s, 0, TAU);
      sc.fill();
    }
    sc.globalAlpha = 1;
  };

  const resize = () => {
    cw = window.innerWidth;
    ch = window.innerHeight;
    narrow = cw <= 780;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    K = (Math.min(cw * 0.5, ch * 0.58) - 30) / Math.pow(30.4, EXP);
    D = mapR(30.4) * 3.1;
    makeStars();
    recalcCenters();
  };

  /* ---------- HUD ---------- */
  const dateEl = document.getElementById("solar-date");
  const speedBtns = [...document.querySelectorAll(".orrery__speeds button[data-speed]")];
  const gotoBtns = [...document.querySelectorAll(".orrery__planets button[data-goto]")];

  const setSpeed = s => {
    speed = s;
    speedBtns.forEach(b => b.classList.toggle("is-active", Number(b.dataset.speed) === s));
  };
  setSpeed(speed);
  speedBtns.forEach(b => b.addEventListener("click", () => setSpeed(Number(b.dataset.speed))));
  document.getElementById("solar-today").addEventListener("click", () => { simMs = Date.now(); });

  const flyTo = el => el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  gotoBtns.forEach(b => b.addEventListener("click", () => {
    const t = document.querySelector(b.dataset.goto === "#top" ? "main" : b.dataset.goto);
    flyTo(b.dataset.goto === "#top" ? chapters[0].el : t);
  }));

  /* ---------- pointer: drag rotates, a clean click flies to a planet ---------- */
  const screenPos = EL.map(() => ({ x: -99, y: -99, clip: true }));
  let sunPos = { x: -99, y: -99 };
  const nearest = (mx, my) => {
    let best = -1, bd = 26;
    screenPos.forEach((s, i) => {
      if (s.clip) return;
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bd + EL[i].px) { bd = d; best = i; }
    });
    if (Math.hypot(sunPos.x - mx, sunPos.y - my) < 30) best = 8;
    return best;
  };
  const chapterOfBody = body =>
    chapters.find(c => c.body === (body === 8 ? "sun" : EL[body].name.toLowerCase()));

  let dragging = false, moved = 0, px0 = 0, py0 = 0;
  canvas.addEventListener("pointerdown", e => {
    dragging = true;
    moved = 0;
    px0 = e.clientX;
    py0 = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  });
  canvas.addEventListener("pointermove", e => {
    if (dragging) {
      const dx = e.clientX - px0, dy = e.clientY - py0;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        userSpun = true;
        yaw += dx * 0.006;
        elev = Math.min(ELEV_MAX, Math.max(ELEV_MIN, elev + dy * 0.004));
        canvas.style.cursor = "grabbing";
      }
      px0 = e.clientX;
      py0 = e.clientY;
    } else {
      hover = nearest(e.clientX, e.clientY);
      canvas.style.cursor = hover >= 0 ? "pointer" : "grab";
    }
  });
  const endDrag = e => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "grab";
    if (moved <= 4 && e.clientX !== undefined) {
      const i = nearest(e.clientX, e.clientY);
      const c = i >= 0 && chapterOfBody(i);
      if (c) flyTo(c.el);
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { dragging = false; canvas.style.cursor = "grab"; });
  canvas.addEventListener("pointerleave", () => { if (!dragging) hover = -1; });
  canvas.style.cursor = "grab";

  /* ---------- draw ---------- */
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  let lastDateStr = "";

  const draw = (T, focusBody) => {
    const ink = css("--ink"), muted = css("--muted"), brass = css("--red");
    const rpx = Math.sqrt(zoom);

    ctx.clearRect(0, 0, cw, ch);
    if (stars) ctx.drawImage(stars, 0, 0, cw, ch);

    /* orbits, pen up where the path passes behind the camera */
    const focusIdx = IDX[focusBody] ?? -1;
    for (let i = 0; i < EL.length; i++) {
      ctx.beginPath();
      let pen = false;
      for (const pt of paths[i]) {
        const s = project(pt);
        if (s.clip) { pen = false; continue; }
        pen ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
        pen = true;
      }
      ctx.strokeStyle = i === focusIdx
        ? "color-mix(in oklab, " + brass + " 55%, transparent)"
        : "color-mix(in oklab, " + ink + " 13%, transparent)";
      ctx.lineWidth = i === focusIdx ? 1.2 : 1;
      ctx.stroke();
    }

    /* bodies, painter-sorted far → near */
    const showAll = focusBody === "system" || Math.min(cw, ch) > 500;
    const se = Math.sin(elev);
    const bodies = EL.map((p, i) => {
      const pos = positionAt(p, T);
      const s = project(pos);
      screenPos[i] = s;
      return { i, p, s };
    });
    const sunS = project({ x: 0, y: 0, z: 0 });
    sunPos = sunS;
    bodies.push({ sun: true, s: sunS });
    bodies.sort((a, b) => a.s.zd - b.s.zd);

    ctx.font = "10.5px " + (css("--font-mono") || "monospace");
    for (const b of bodies) {
      if (b.s.clip) continue;
      if (b.sun) {
        const R = Math.min(60, 30 * b.s.s * rpx);
        const g = ctx.createRadialGradient(b.s.x, b.s.y, 0, b.s.x, b.s.y, R);
        g.addColorStop(0, "oklch(93% 0.08 85)");
        g.addColorStop(0.28, "oklch(85% 0.12 80 / 0.55)");
        g.addColorStop(1, "oklch(85% 0.12 80 / 0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.s.x, b.s.y, R, 0, TAU); ctx.fill();
        ctx.fillStyle = "oklch(96% 0.05 90)";
        ctx.beginPath(); ctx.arc(b.s.x, b.s.y, Math.min(12, 5.5 * b.s.s * rpx), 0, TAU); ctx.fill();
        if (focusBody === "sun" || focusBody === "system") {
          ctx.fillStyle = focusBody === "sun" ? ink : muted;
          ctx.fillText("sun", b.s.x + R * 0.5 + 6, b.s.y + 3.5);
        }
        continue;
      }
      const { i, p, s } = b;
      const R = Math.min(30, p.px * s.s * rpx);
      if (p.ring) {
        ctx.strokeStyle = "color-mix(in oklab, " + p.col + " 65%, transparent)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, R * 2.1, Math.max(R * 0.24, R * 2.1 * se * 0.92), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(s.x, s.y, R + (hover === i ? 1 : 0), 0, TAU);
      ctx.fill();
      if (i === focusIdx) {
        ctx.strokeStyle = brass;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, R + 5, 0, TAU);
        ctx.stroke();
      }
      if (showAll || i === focusIdx || i === hover) {
        ctx.fillStyle = hover === i || i === focusIdx ? ink : muted;
        ctx.fillText(p.name.toLowerCase(), s.x + R + 6, s.y + 3.5);
      }
    }

    const ds = fmt.format(new Date(simMs));
    if (ds !== lastDateStr) { lastDateStr = ds; dateEl.textContent = ds; }
  };

  /* ---------- loop ---------- */
  let prev = performance.now();
  const tick = now => {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    simMs += dt * speed * 86400000;
    const T = centuries(simMs);

    const c = chapterAt();
    const focus = chapters[Math.round(c)];
    const t = camTarget(T);
    if (!cam) cam = { F: { ...t.F }, zl: t.zl, ax: t.ax, ay: t.ay };
    const k = 1 - Math.exp(-dt * 5);
    cam.F.x += (t.F.x - cam.F.x) * k;
    cam.F.y += (t.F.y - cam.F.y) * k;
    cam.F.z += (t.F.z - cam.F.z) * k;
    cam.zl += (t.zl - cam.zl) * k;
    cam.ax += (t.ax - cam.ax) * k;
    cam.ay += (t.ay - cam.ay) * k;
    zoom = Math.exp(cam.zl);

    if (focus.body === "system" && !userSpun && !dragging && !reduced) yaw += dt * 0.02;

    gotoBtns.forEach((b, i) => b.classList.toggle("is-active", i === Math.round(c) && i < gotoBtns.length));

    draw(T, focus.body);
    requestAnimationFrame(tick);
  };

  resize();
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(recalcCenters).observe(document.body);
  window.addEventListener("load", recalcCenters);
  requestAnimationFrame(tick);

  /* debug / verification handle — also for the curious */
  window.orrery = {
    date: () => new Date(simMs),
    view: () => ({ yaw, elevDeg: elev / D2R, zoom }),
    chapter: () => chapterAt(),
    screen: name => name === "sun" ? sunPos : screenPos[IDX[String(name).toLowerCase()]],
    state: (name, when) => {
      const i = IDX[String(name).toLowerCase()];
      if (i === undefined) return null;
      const T = centuries(when ? new Date(when).getTime() : simMs);
      const pos = positionAt(EL[i], T);
      return { rAU: pos.r, lonDeg: pos.lon, zAU: pos.z, periodDays: periodDays[i] };
    },
  };
})();
