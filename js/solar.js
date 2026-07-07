/* Hero — a working orrery, in 3D.
   Planet positions are computed, not drawn: JPL approximate Keplerian
   elements (Standish, valid 1800–2050) propagated to the simulated date,
   Kepler's equation solved by Newton's method each frame, positions
   rotated from each orbital plane to the ecliptic — including z, so the
   orbital inclinations are real. A hand-rolled camera (yaw + elevation
   around the Sun, perspective divide, painter's sort) projects onto the
   canvas; there is no 3D library. Radial distances are compressed with
   r^0.42 so Mercury and Neptune share one view; angles are true. */
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

  /* ---------- sim state ---------- */
  let simMs = Date.now();
  let speed = reduced ? 0 : 1;                    /* days per real second */
  let sel = 2;                                    /* Earth */
  let hover = -1;

  /* ---------- camera: orbit around the Sun ---------- */
  let yaw = -0.55;                                /* rad, about the ecliptic pole */
  let elev = 56 * D2R;                            /* elevation above the ecliptic */
  let autoSpin = !reduced;                        /* gentle drift until the user grabs it */
  const ELEV_MIN = 8 * D2R, ELEV_MAX = 88 * D2R;

  /* ---------- screen mapping ---------- */
  const EXP = 0.42;
  let cw = 0, ch = 0, cx = 0, cy = 0, K = 1, dpr = 1;
  let stars = null;

  const mapR = r => K * Math.pow(r, EXP);

  /* radial compression is a scale along the Sun direction, so planes
     through the Sun (every orbit) stay planes */
  const project = pt => {
    const r = Math.hypot(pt.x, pt.y, pt.z) || 1e-9;
    const f = mapR(r) / r;
    const wx = pt.x * f, wy = pt.y * f, wz = pt.z * f;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const x1 = wx * cyaw - wy * syaw;
    const y1 = wx * syaw + wy * cyaw;
    const se = Math.sin(elev), ce = Math.cos(elev);
    const y2 = y1 * se + wz * ce;                 /* screen-up */
    const zd = -y1 * ce + wz * se;                /* toward camera */
    const D = mapR(30.4) * 3.1;
    const s = D / (D - zd);
    return { x: cx + x1 * s, y: cy - y2 * s, s, zd };
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
    const rect = canvas.getBoundingClientRect();
    cw = Math.max(1, rect.width);
    ch = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = window.innerWidth > 780;
    cx = wide ? cw * 0.60 : cw * 0.5;
    cy = ch * 0.52;
    K = (Math.min(cw * 0.5, ch * 0.58) - 30) / Math.pow(30.4, EXP);
    makeStars();
  };

  /* ---------- DOM ---------- */
  const dateEl = document.getElementById("solar-date");
  const panel = {
    glyph: document.getElementById("sp-glyph"),
    name: document.getElementById("sp-name"),
    a: document.getElementById("sp-a"),
    e: document.getElementById("sp-e"),
    period: document.getElementById("sp-period"),
    r: document.getElementById("sp-r"),
    lon: document.getElementById("sp-lon"),
  };
  const speedBtns = [...document.querySelectorAll(".orrery__speeds button[data-speed]")];
  const planetBtns = [...document.querySelectorAll(".orrery__planets button[data-planet]")];

  const setSpeed = s => {
    speed = s;
    speedBtns.forEach(b => b.classList.toggle("is-active", Number(b.dataset.speed) === s));
  };
  setSpeed(speed);

  const select = i => {
    sel = i;
    planetBtns.forEach(b => b.classList.toggle("is-active", Number(b.dataset.planet) === i));
    const p = EL[i];
    panel.glyph.textContent = p.glyph;
    panel.name.textContent = p.name;
    const el = elementsAt(p, centuries(simMs));
    panel.a.textContent = el.a.toFixed(3) + " AU";
    panel.e.textContent = el.e.toFixed(4);
    const d = periodDays[i];
    panel.period.textContent = d < 1000 ? d.toFixed(1) + " d" : (d / 365.25).toFixed(1) + " yr";
  };

  speedBtns.forEach(b => b.addEventListener("click", () => setSpeed(Number(b.dataset.speed))));
  planetBtns.forEach(b => b.addEventListener("click", () => select(Number(b.dataset.planet))));
  document.getElementById("solar-today").addEventListener("click", () => { simMs = Date.now(); });

  /* ---------- pointer: drag rotates the camera, a clean click selects ---------- */
  let screenPos = EL.map(() => ({ x: -99, y: -99 }));
  const nearest = (mx, my) => {
    let best = -1, bd = 26;
    screenPos.forEach((s, i) => {
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bd + EL[i].px) { bd = d; best = i; }
    });
    return best;
  };

  let dragging = false, moved = 0, px0 = 0, py0 = 0;

  canvas.addEventListener("pointerdown", e => {
    dragging = true;
    moved = 0;
    px0 = e.clientX;
    py0 = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  });
  canvas.addEventListener("pointermove", e => {
    const r = canvas.getBoundingClientRect();
    if (dragging) {
      const dx = e.clientX - px0, dy = e.clientY - py0;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        autoSpin = false;
        yaw += dx * 0.006;
        elev = Math.min(ELEV_MAX, Math.max(ELEV_MIN, elev + dy * 0.004));
        canvas.style.cursor = "grabbing";
      }
      px0 = e.clientX;
      py0 = e.clientY;
    } else {
      hover = nearest(e.clientX - r.left, e.clientY - r.top);
      canvas.style.cursor = hover >= 0 ? "pointer" : "grab";
    }
  });
  const endDrag = e => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "grab";
    if (moved <= 4 && e.clientX !== undefined) {
      const r = canvas.getBoundingClientRect();
      const i = nearest(e.clientX - r.left, e.clientY - r.top);
      if (i >= 0) select(i);
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { dragging = false; canvas.style.cursor = "grab"; });
  canvas.addEventListener("pointerleave", () => { if (!dragging) hover = -1; });
  canvas.style.cursor = "grab";

  /* ---------- draw ---------- */
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  let lastDateStr = "";

  const draw = () => {
    const T = centuries(simMs);
    const ink = css("--ink"), muted = css("--muted"), brass = css("--red");

    ctx.clearRect(0, 0, cw, ch);
    if (stars) ctx.drawImage(stars, 0, 0, cw, ch);

    /* orbit paths, behind everything */
    for (let i = 0; i < EL.length; i++) {
      ctx.beginPath();
      paths[i].forEach((pt, j) => {
        const s = project(pt);
        j ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
      });
      ctx.strokeStyle = i === sel
        ? "color-mix(in oklab, " + brass + " 60%, transparent)"
        : "color-mix(in oklab, " + ink + " 13%, transparent)";
      ctx.lineWidth = i === sel ? 1.2 : 1;
      ctx.stroke();
    }

    /* bodies, painter-sorted far → near */
    const showLabels = Math.min(cw, ch) > 500;
    const se = Math.sin(elev);
    const bodies = EL.map((p, i) => {
      const pos = positionAt(p, T);
      const s = project(pos);
      screenPos[i] = s;
      return { i, p, pos, s };
    });
    bodies.push({ sun: true, s: project({ x: 0, y: 0, z: 0 }) });
    bodies.sort((a, b) => a.s.zd - b.s.zd);

    ctx.font = "10.5px " + (css("--font-mono") || "monospace");
    for (const b of bodies) {
      if (b.sun) {
        const g = ctx.createRadialGradient(b.s.x, b.s.y, 0, b.s.x, b.s.y, 30 * b.s.s);
        g.addColorStop(0, "oklch(93% 0.08 85)");
        g.addColorStop(0.28, "oklch(85% 0.12 80 / 0.55)");
        g.addColorStop(1, "oklch(85% 0.12 80 / 0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.s.x, b.s.y, 30 * b.s.s, 0, TAU); ctx.fill();
        ctx.fillStyle = "oklch(96% 0.05 90)";
        ctx.beginPath(); ctx.arc(b.s.x, b.s.y, 5.5 * b.s.s, 0, TAU); ctx.fill();
        continue;
      }
      const { i, p, pos, s } = b;
      const R = p.px * s.s;
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
      if (i === sel) {
        ctx.strokeStyle = brass;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, R + 4.5, 0, TAU);
        ctx.stroke();
      }
      if (showLabels || i === sel || i === hover) {
        ctx.fillStyle = hover === i || sel === i ? ink : muted;
        ctx.fillText(p.name.toLowerCase(), s.x + R + 6, s.y + 3.5);
      }
      if (i === sel) {
        panel.r.textContent = pos.r.toFixed(3) + " AU";
        panel.lon.textContent = pos.lon.toFixed(1) + "°";
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
    if (autoSpin && !dragging) yaw += dt * 0.02;
    draw();
    requestAnimationFrame(tick);
  };

  resize();
  select(sel);
  window.addEventListener("resize", resize);
  requestAnimationFrame(tick);

  /* debug / verification handle — also for the curious */
  window.orrery = {
    date: () => new Date(simMs),
    view: () => ({ yaw, elevDeg: elev / D2R }),
    state: (name, when) => {
      const i = EL.findIndex(p => p.name.toLowerCase() === String(name).toLowerCase());
      if (i < 0) return null;
      const T = centuries(when ? new Date(when).getTime() : simMs);
      const pos = positionAt(EL[i], T);
      return { rAU: pos.r, lonDeg: pos.lon, zAU: pos.z, periodDays: periodDays[i] };
    },
  };
})();
