/* Hero — a working orrery.
   Planet positions are computed, not drawn: JPL approximate Keplerian
   elements (Standish, valid 1800–2050) propagated to the simulated date,
   Kepler's equation solved by Newton's method each frame, positions
   rotated from the orbital plane to the ecliptic and projected top-down.
   Radial distances are compressed with r^0.42 so Mercury and Neptune can
   share one canvas; angles are true. */
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

  const elementsAt = (p, T) => {
    const e = p.e[0] + p.e[1] * T;
    return {
      a: p.a[0] + p.a[1] * T, e,
      I: (p.I[0] + p.I[1] * T) * D2R,
      L: p.L[0] + p.L[1] * T,
      W: p.W[0] + p.W[1] * T,
      O: p.O[0] + p.O[1] * T,
    };
  };

  /* orbital-plane position for eccentric anomaly E, rotated to the ecliptic */
  const eclFromE = (el, E) => {
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const w = (el.W - el.O) * D2R, Om = el.O * D2R;
    const cw = Math.cos(w), sw = Math.sin(w);
    const co = Math.cos(Om), so = Math.sin(Om), ci = Math.cos(el.I);
    return {
      x: (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
      y: (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
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
    return { ...pos, r: Math.hypot(pos.x, pos.y), lon: mod360(Math.atan2(pos.y, pos.x) / D2R) };
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

  /* ---------- screen mapping ---------- */
  const EXP = 0.42;
  let cw = 0, ch = 0, cx = 0, cy = 0, K = 1, dpr = 1;
  let stars = null;

  const mapR = r => K * Math.pow(r, EXP);
  const toScreen = pt => {
    const r = Math.hypot(pt.x, pt.y) || 1e-9;
    const R = mapR(r);
    return { x: cx + (pt.x / r) * R, y: cy - (pt.y / r) * R };
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
    K = (Math.min(wide ? cw * 0.5 : cw * 0.5, ch * 0.5) - 30) / Math.pow(30.4, EXP);
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
    const T = centuries(simMs);
    const el = elementsAt(p, T);
    panel.a.textContent = el.a.toFixed(3) + " AU";
    panel.e.textContent = el.e.toFixed(4);
    const d = periodDays[i];
    panel.period.textContent = d < 1000 ? d.toFixed(1) + " d" : (d / 365.25).toFixed(1) + " yr";
  };

  speedBtns.forEach(b => b.addEventListener("click", () => setSpeed(Number(b.dataset.speed))));
  planetBtns.forEach(b => b.addEventListener("click", () => select(Number(b.dataset.planet))));
  document.getElementById("solar-today").addEventListener("click", () => { simMs = Date.now(); });

  /* pointer: hover + click-to-select the nearest planet */
  let screenPos = EL.map(() => ({ x: -99, y: -99 }));
  const nearest = (mx, my) => {
    let best = -1, bd = 26;
    screenPos.forEach((s, i) => {
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bd + EL[i].px) { bd = d; best = i; }
    });
    return best;
  };
  canvas.addEventListener("pointermove", e => {
    const r = canvas.getBoundingClientRect();
    hover = nearest(e.clientX - r.left, e.clientY - r.top);
    canvas.style.cursor = hover >= 0 ? "pointer" : "default";
  });
  canvas.addEventListener("pointerleave", () => { hover = -1; });
  canvas.addEventListener("click", e => {
    const r = canvas.getBoundingClientRect();
    const i = nearest(e.clientX - r.left, e.clientY - r.top);
    if (i >= 0) select(i);
  });

  /* ---------- draw ---------- */
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  let lastDateStr = "";

  const draw = () => {
    const T = centuries(simMs);
    const ink = css("--ink"), muted = css("--muted"), brass = css("--red");

    ctx.clearRect(0, 0, cw, ch);
    if (stars) ctx.drawImage(stars, 0, 0, cw, ch);

    /* orbits */
    for (let i = 0; i < EL.length; i++) {
      ctx.beginPath();
      paths[i].forEach((pt, j) => {
        const s = toScreen(pt);
        j ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
      });
      ctx.strokeStyle = i === sel
        ? "color-mix(in oklab, " + brass + " 60%, transparent)"
        : "color-mix(in oklab, " + ink + " 13%, transparent)";
      ctx.lineWidth = i === sel ? 1.2 : 1;
      ctx.stroke();
    }

    /* sun */
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    glow.addColorStop(0, "oklch(93% 0.08 85)");
    glow.addColorStop(0.28, "oklch(85% 0.12 80 / 0.55)");
    glow.addColorStop(1, "oklch(85% 0.12 80 / 0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = "oklch(96% 0.05 90)";
    ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, TAU); ctx.fill();

    /* planets */
    ctx.font = "10.5px " + (css("--font-mono") || "monospace");
    for (let i = 0; i < EL.length; i++) {
      const p = EL[i];
      const pos = positionAt(p, T);
      const s = toScreen(pos);
      screenPos[i] = s;

      if (p.ring) {
        ctx.strokeStyle = "color-mix(in oklab, " + p.col + " 65%, transparent)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, p.px * 2.1, p.px * 0.85, -0.45, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.px + (hover === i ? 1 : 0), 0, TAU);
      ctx.fill();
      if (i === sel) {
        ctx.strokeStyle = brass;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.px + 4.5, 0, TAU);
        ctx.stroke();
      }
      if (Math.min(cw, ch) > 500 || i === sel || i === hover) {
        ctx.fillStyle = hover === i || sel === i ? ink : muted;
        ctx.fillText(p.name.toLowerCase(), s.x + p.px + 6, s.y + 3.5);
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
    state: (name, when) => {
      const i = EL.findIndex(p => p.name.toLowerCase() === String(name).toLowerCase());
      if (i < 0) return null;
      const T = centuries(when ? new Date(when).getTime() : simMs);
      const pos = positionAt(EL[i], T);
      return { rAU: pos.r, lonDeg: pos.lon, periodDays: periodDays[i] };
    },
  };
})();
