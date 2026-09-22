/* The site's framework: a solar system the page travels through.
   Every planet's position is computed, not drawn: JPL approximate
   Keplerian elements (Standish, valid 1800–2050) propagated to the
   simulated date, Kepler's equation solved by Newton's method each
   frame, positions rotated from each orbital plane to the ecliptic,
   inclinations included. A hand-rolled camera (focus point, zoom,
   yaw + elevation, perspective divide, painter's sort) projects onto
   a fixed canvas; there is no 3D library.

   Camera orientation and axial tilt determine the sampled longitude and
   latitude on each global texture. The backdrop is the Milky Way (ESO/S. Brunier).

   Each .chapter element declares the body it lives on (data-body).
   Scroll drives the camera: it holds close on a chapter's planet,
   pulls out through the orbits between chapters, snaps in on the
   next, and ends on the whole system, where clicking a planet flies
   you back to its section. The camera is a dolly: apparent size is
   size × focal length ÷ distance, and "zoom" means moving closer.
   Body radii follow one square-root scale. Orbital distances use a
   logarithmic display scale; orbital angles retain the calculated values. */
// @ts-check
(() => {
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById("solar-canvas"));
  if (!canvas) return;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** @param {string} n */
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  /** @param {number} x */
  const mod360 = x => ((x % 360) + 360) % 360;

  /** @typedef {{ x: number, y: number, z: number }} Vec3 */
  /** @typedef {{ a: number, e: number, I: number, L: number, W: number, O: number }} Elements */
  /** @typedef {{ x: number, y: number, s: number, zd: number, clip: boolean }} Proj */

  /* [value at J2000, rate per Julian century] */
  const EL = [
    { name: "Mercury", col: "oklch(74% 0.015 60)",  px: 2.6,
      a: [0.38709927, 0.00000037],  e: [0.20563593, 0.00001906],  I: [7.00497902, -0.00594749],
      L: [252.25032350, 149472.67411175], W: [77.45779628, 0.16047689],  O: [48.33076593, -0.12534081] },
    { name: "Venus", col: "oklch(85% 0.055 85)",  px: 4.1,
      a: [0.72333566, 0.00000390],  e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890],
      L: [181.97909950, 58517.81538729],  W: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
    { name: "Earth", col: "oklch(72% 0.09 235)",  px: 4.2,
      a: [1.00000261, 0.00000562],  e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668],
      L: [100.46457166, 35999.37244981],  W: [102.93768193, 0.32327364], O: [0, 0] },
    { name: "Mars",  col: "oklch(66% 0.13 40)",   px: 3.15,
      a: [1.52371034, 0.00001847],  e: [0.09339410, 0.00007882],  I: [1.84969142, -0.00813131],
      L: [-4.55343205, 19140.30268499],   W: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
    { name: "Jupiter", col: "oklch(77% 0.065 70)",  px: 13.9,
      a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714],
      L: [34.39644051, 3034.74612775],    W: [14.72847983, 0.21252668],  O: [100.47390909, 0.20469106] },
    { name: "Saturn", col: "oklch(83% 0.075 90)",  px: 12.7,
      a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609],
      L: [49.95424423, 1222.49362201],    W: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
    { name: "Uranus", col: "oklch(80% 0.055 200)", px: 8.4,
      a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939],
      L: [313.23810451, 428.48202785],    W: [170.95427630, 0.40805281], O: [74.01692503, 0.04240589] },
    { name: "Neptune", col: "oklch(64% 0.10 260)",  px: 8.3,
      a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105],  I: [1.77004347, 0.00035372],
      L: [-55.12002969, 218.45945325],    W: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664] },
  ];
  const IDX = Object.fromEntries(EL.map((p, i) => [p.name.toLowerCase(), i]));

  const surfaces = new OrrerySurfaces();
  let ringPixels = null;

  const ringMap = new Image();
  ringMap.addEventListener("load", () => {
    const c = document.createElement("canvas");
    c.width = ringMap.naturalWidth;
    c.height = ringMap.naturalHeight;
    const cctx = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
    cctx.drawImage(ringMap, 0, 0);
    ringPixels = cctx.getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
  });
  ringMap.src = "assets/planets/textures/saturn-ring.png";
  const drawSphere = (name, x, y, R) => surfaces.draw(ctx, name, x, y, R, yaw, elev, dpr);

  /** @param {number} x  @param {number} y  @param {number} R  @param {boolean} front */
  const drawSaturnRings = (x, y, R, front) => {
    if (!ringPixels) return;
    const tilt = surfaces.tilts.saturn * D2R;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elev), se = Math.sin(elev);
    const depthX = -sy * ce;
    const depthY = -cy * Math.cos(tilt) * ce - Math.sin(tilt) * se;
    const start = Math.atan2(depthY, depthX) + (front ? -Math.PI / 2 : Math.PI / 2);
    const ring = Array.from({ length: 129 }, (_, i) => {
      const angle = start + i / 128 * Math.PI;
      const rx = Math.cos(angle), ry = Math.sin(angle) * Math.cos(tilt), rz = -Math.sin(angle) * Math.sin(tilt);
      return { x: rx * cy - ry * sy, y: -((rx * sy + ry * cy) * se + rz * ce), z: -(rx * sy + ry * cy) * ce + rz * se };
    });
    const samples = ringPixels.length / 4;
    for (let band = 0; band < 72; band++) {
      const t = band / 71;
      const si = Math.min(samples - 1, Math.round(t * (samples - 1))) * 4;
      const a = ringPixels[si + 3] / 255;
      if (a < 0.025) continue;
      const rr = R * (1.2 + t * 1.05);
      ctx.strokeStyle = `rgba(${ringPixels[si]}, ${ringPixels[si + 1]}, ${ringPixels[si + 2]}, ${a * 0.82})`;
      ctx.lineWidth = R * 0.018;
      ctx.beginPath();
      let pen = false;
      for (const p of ring) {
        if (pen) ctx.lineTo(x + p.x * rr, y + p.y * rr);
        else ctx.moveTo(x + p.x * rr, y + p.y * rr);
        pen = true;
      }
      ctx.stroke();
    }
  };

  /** @param {number} x  @param {number} y  @param {number} R */
  const drawSaturn = (x, y, R) => {
    if (surfaces.pedro) return drawSphere("saturn", x, y, R);
    if (!surfaces.maps.saturn || !ringPixels) return false;
    drawSaturnRings(x, y, R, false);
    drawSphere("saturn", x, y, R);
    drawSaturnRings(x, y, R, true);
    return true;
  };

  /** @param {number} ms */
  const centuries = ms => (ms / 86400000 + 2440587.5 - 2451545.0) / 36525;

  /** @param {(typeof EL)[number]} p  @param {number} T  @returns {Elements} */
  const elementsAt = (p, T) => ({
    a: p.a[0] + p.a[1] * T,
    e: p.e[0] + p.e[1] * T,
    I: (p.I[0] + p.I[1] * T) * D2R,
    L: p.L[0] + p.L[1] * T,
    W: p.W[0] + p.W[1] * T,
    O: p.O[0] + p.O[1] * T,
  });

  /* orbital-plane position for eccentric anomaly E → 3D ecliptic coords */
  /** @param {Elements} el  @param {number} E  @returns {Vec3} */
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

  /** @param {(typeof EL)[number]} p  @param {number} T */
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
    /** @type {Vec3[]} */
    const pts = [];
    for (let i = 0; i <= 360; i++) pts.push(eclFromE(el, (i / 360) * TAU));
    return pts;
  });
  const periodDays = EL.map(p => 36525 * 360 / Math.abs(p.L[1]));

  /* ---------- chapters: the site's itinerary ---------- */
  /* honest camera: apparent size is always size × focal length ÷ distance
    : a dolly, not a scale factor. A chapter's camera distance is whatever
     makes ITS body fill the frame, so neighbours keep true relative scale;
     the farthest camera distance frames the complete system */
  const BODY_SCALE = 1.0;
  const SUNPX = 44;                          /* √(real radius) scale, like the planets */
  /** @param {string} body */
  const distOf = body => {
    if (body === "system") return mapR(31.6) * Math.hypot(1, FL / (0.40 * Math.min(cw, ch)));
    const frac = narrow ? 0.20 : 0.30;
    const px = body === "sun" ? SUNPX : EL[IDX[body]].px;
    return px * BODY_SCALE * FL / (frac * Math.min(cw, ch));
  };
  /** @type {Record<string, number>} */
  const SEMI = { sun: 0, mercury: 0.39, venus: 0.72, earth: 1.0, mars: 1.52,
                 jupiter: 5.2, saturn: 9.54, uranus: 19.19, neptune: 30.07 };
  const chapters = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".chapter"))].map(el => ({
    el, body: el.dataset.body || "sun", side: el.dataset.side || "l",
  }));
  const N = chapters.length;
  /** @type {number[]} */
  let bounds = [];                           /* document Y where each chapter begins */
  const recalcCenters = () => {
    /* getBoundingClientRect: offsetTop would be relative to <main> */
    bounds = chapters.map(c => c.el.getBoundingClientRect().top + window.scrollY);
  };

  /* fill each chapter's ephemeris line from the real elements */
  chapters.forEach(c => {
    const el = c.el.querySelector(".chapter__eph");
    const i = IDX[c.body];
    if (!el || i === undefined) return;
    const p = EL[i], e0 = elementsAt(p, T0), d = periodDays[i];
    const T = d < 1000 ? d.toFixed(1) + " d" : (d / 365.25).toFixed(1) + " yr";
    el.textContent = `${p.name} · a ${e0.a.toFixed(3)} AU · e ${e0.e.toFixed(3)} · T ${T}`;
  });

  /* ---------- sim state ---------- */
  let simMs = Date.now();
  let speed = reduced ? 0 : 1;                    /* days per real second */
  let hover = -1;

  /* ---------- camera ---------- */
  let yaw = -0.55;
  let elev = 56 * D2R;
  let yawTarget = yaw, elevTarget = elev;
  let zoomOffset = 0, zoomTarget = 0;
  let zoomChapter = -1;
  let userSpun = false;
  const ZOOM_MIN = -1.35;

  const ORBIT_CORE = 0.12;
  const K = 90;
  let cw = 0, ch = 0, FL = 1000, dpr = 1, narrow = false;
  const backdrop = new Image();

  /** @param {number} r */
  const mapR = r => K * Math.log1p(r / ORBIT_CORE);
  /** @param {Vec3} pt */
  const warp = pt => {
    const r = Math.hypot(pt.x, pt.y, pt.z) || 1e-9;
    const f = mapR(r) / r;
    return { x: pt.x * f, y: pt.y * f, z: pt.z * f };
  };

  /** @param {string} body  @param {number} T  @returns {Vec3} */
  const bodyPos = (body, T) => {
    const i = IDX[body];
    return i === undefined ? { x: 0, y: 0, z: 0 } : warp(positionAt(EL[i], T));
  };

  /** @param {{ body: string, side: string }} c */
  const anchorOf = c => {
    if (narrow) return { x: 0.5, y: c.body === "sun" ? 0.26 : c.body === "system" ? 0.55 : 0.22 };
    if (c.body === "sun") return { x: 0.68, y: 0.5 };
    if (c.body === "system") return { x: 0.5, y: 0.52 };
    return c.side === "l" ? { x: 0.74, y: 0.46 } : { x: 0.26, y: 0.46 };
  };

  /* scroll → continuous chapter coordinate. The camera HOLDS its planet the
     whole time a chapter occupies the viewport (however tall the panel) and
     flies only in a window around the boundary to the next chapter: so
     reading the top of a tall section never drags the focus away */
  /** @param {number} f */
  const smooth = f => f * f * (3 - 2 * f);
  const chapterAt = () => {
    const vh = window.innerHeight;
    const sc = window.scrollY + vh / 2;
    const w = 0.45 * vh;
    let c = 0;
    for (let k = 1; k < N; k++) {
      const b = bounds[k];
      if (sc >= b + w) { c = k; continue; }
      if (sc > b - w) c = k - 1 + smooth((sc - (b - w)) / (2 * w));
      break;
    }
    return c;
  };

  /** @param {number} k  @param {number} T */
  const camTargetOf = (k, T) => {
    const c = chapters[k];
    const a = anchorOf(c);
    return { F: bodyPos(c.body, T), zl: Math.log(distOf(c.body)), ax: a.x, ay: a.y };
  };

  /* the camera is derived EXACTLY from a smoothed chapter coordinate each
     frame: smoothing the scalar, not the position, means the focused
     planet is tracked with zero lag while it moves along its orbit.

     A transition is phased like a real camera move: dolly OUT with the
     focus still on the old planet, pan the focus across near the apex
     (where a big focus move costs little on screen), have it locked on
     the target by ~70%: so the final approach is a pure zoom onto an
     already-centred planet, never a last-moment sideways catch-up */
  let cam = { F: { x: 0, y: 0, z: 0 }, zl: Math.log(1000), ax: 0.5, ay: 0.5 };
  /** @param {number} c  @param {number} T */
  const camFrom = (c, T) => {
    const k = Math.floor(c);
    const f = c - k;
    const A = camTargetOf(k, T);
    if (f < 1e-4 || k >= N - 1) return A;
    const B = camTargetOf(k + 1, T);
    const fF = smooth(Math.max(0, Math.min(1, (f - 0.35) / 0.37)));  /* focus pan */
    const g = smooth(f);                                             /* dolly, zero-slope ends */
    const out = {
      F: { x: A.F.x + (B.F.x - A.F.x) * fF, y: A.F.y + (B.F.y - A.F.y) * fF, z: A.F.z + (B.F.z - A.F.z) * fF },
      zl: A.zl + (B.zl - A.zl) * g,
      ax: A.ax + (B.ax - A.ax) * fF,
      ay: A.ay + (B.ay - A.ay) * fF,
    };
    /* dolly out to see both orbits mid-flight, then close in */
    const bodyA = chapters[k].body, bodyB = chapters[k + 1].body;
    if (bodyA !== "system" && bodyB !== "system") {
      const aMax = Math.max(SEMI[bodyA] || 0.4, SEMI[bodyB] || 0.4) * 1.06;
      const zlMid = Math.log(mapR(aMax) * FL / (0.40 * Math.min(cw, ch)));
      if (zlMid > Math.max(A.zl, B.zl)) {
        const zlC = 2 * zlMid - (A.zl + B.zl) / 2;
        out.zl = (1 - g) * (1 - g) * A.zl + 2 * g * (1 - g) * zlC + g * g * B.zl;
      }
    }
    return out;
  };

  /* project a 3D AU point through warp → dolly camera → perspective divide */
  let dCam = 1000;
  /** @param {Vec3} pt  @returns {Proj} */
  const project = pt => {
    const w = warp(pt);
    const rx = w.x - cam.F.x, ry = w.y - cam.F.y, rz = w.z - cam.F.z;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const x1 = rx * cyaw - ry * syaw;
    const y1 = rx * syaw + ry * cyaw;
    const se = Math.sin(elev), ce = Math.cos(elev);
    const y2 = y1 * se + rz * ce;
    const zd = -y1 * ce + rz * se;                 /* toward the camera */
    const den = dCam - zd;
    const near = dCam * 0.02;                      /* near plane scales with the dolly */
    const clip = den < near;
    const s = FL / Math.max(den, near);
    return { x: cam.ax * cw + x1 * s, y: cam.ay * ch - y2 * s, s, zd, clip };
  };

  function updateCameraDistance() {
    const maximum = Math.max(distOf("system"), Math.exp(cam.zl));
    dCam = Math.min(maximum, Math.exp(cam.zl + zoomOffset));
  }

  const resize = () => {
    cw = window.innerWidth;
    ch = window.innerHeight;
    narrow = cw <= 780;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    FL = 3 * Math.min(cw, ch);
    recalcCenters();
  };

  backdrop.src = "assets/space.jpg";

  /* ---------- HUD ---------- */
  const dateEl = /** @type {HTMLElement} */ (document.getElementById("solar-date"));
  const orbitSummary = /** @type {HTMLElement} */ (document.getElementById("orrery-summary"));
  const speedBtns = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".orrery__speeds button[data-speed]"))];
  const planetBtns = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".orrery__planets button[data-goto]"))];
  const navLinks = [.../** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll(".site-head__nav--home a[href^='#']"))];
  const menuCurrent = /** @type {HTMLElement} */ (document.getElementById("site-menu-current"));
  const gotoBtns = [
    .../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".site-head__name[data-goto]")),
    ...planetBtns,
  ];

  /** @param {number} s */
  const setSpeed = s => {
    speed = s;
    speedBtns.forEach(b => {
      const active = Number(b.dataset.speed) === s;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    const activeButton = speedBtns.find(b => Number(b.dataset.speed) === s);
    orbitSummary.textContent = s === 0 ? "Orbit paused" : `Orbit · ${activeButton?.textContent?.trim() || "running"}`;
  };
  setSpeed(speed);
  speedBtns.forEach(b => b.addEventListener("click", () => setSpeed(Number(b.dataset.speed))));
  /** @type {HTMLElement} */ (document.getElementById("solar-today")).addEventListener("click", () => { simMs = Date.now(); });

  /** @param {Element} el */
  const flyTo = el => el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  gotoBtns.forEach(b => b.addEventListener("click", event => {
    /* Keep the anchor's native Cmd/Ctrl-click and context-menu behaviour so
       opening it in a new tab still loads /#top. */
    if (event instanceof MouseEvent &&
        (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;

    const sel = b.dataset.goto;
    if (!sel) return;

    event.preventDefault();
    if (sel === "#top") {
      if (location.hash !== "#top") history.pushState(null, "", "#top");
      window.scrollTo({ top: 0, left: 0, behavior: reduced ? "auto" : "smooth" });
      return;
    }

    const t = document.querySelector(sel);
    if (t) flyTo(t);
  }));

  /* ---------- pointer: drag rotates, a clean click flies to a planet ---------- */
  /** @typedef {Proj & { R: number }} ScreenPt */
  /** @type {ScreenPt[]} */
  const screenPos = EL.map(() => ({ x: -99, y: -99, s: 0, zd: 0, clip: true, R: 0 }));
  /** @type {ScreenPt} */
  let sunPos = { x: -99, y: -99, s: 0, zd: 0, clip: true, R: 20 };
  /** @param {number} mx  @param {number} my */
  const nearest = (mx, my) => {
    let best = -1, bd = 22;
    screenPos.forEach((s, i) => {
      if (s.clip) return;
      const d = Math.hypot(s.x - mx, s.y - my) - s.R;
      if (d < bd) { bd = d; best = i; }
    });
    if (Math.hypot(sunPos.x - mx, sunPos.y - my) - sunPos.R < 22) best = 8;
    return best;
  };
  /** @param {number} body */
  const chapterOfBody = body =>
    chapters.find(c => c.body === (body === 8 ? "sun" : EL[body].name.toLowerCase()));

  let dragging = false, moved = 0, px0 = 0, py0 = 0, gestureActive = false;
  let pinchDistance = 0, pinchAngle = 0, pinchX = 0, pinchY = 0;
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  /** @param {number} value */
  const setZoom = value => {
    const limit = Math.log(distOf("system")) - cam.zl;
    zoomTarget = Math.min(Math.max(0, limit), Math.max(ZOOM_MIN, value));
  };
  const ZOOM_STEP = 0.28;
  /** @type {HTMLElement} */ (document.getElementById("solar-zoom-in")).addEventListener("click", () => {
    userSpun = true;
    setZoom(zoomTarget - ZOOM_STEP);
  });
  /** @type {HTMLElement} */ (document.getElementById("solar-zoom-out")).addEventListener("click", () => {
    userSpun = true;
    setZoom(zoomTarget + ZOOM_STEP);
  });
  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return null;
    return {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  };
  /** @param {number} angle */
  const shortestAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  canvas.addEventListener("pointerdown", e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      moved = 0;
      gestureActive = false;
      px0 = e.clientX;
      py0 = e.clientY;
    } else {
      const pinch = pinchState();
      if (pinch) {
        gestureActive = true;
        dragging = false;
        moved = 10;
        pinchDistance = pinch.distance;
        pinchAngle = pinch.angle;
        pinchX = pinch.x;
        pinchY = pinch.y;
        userSpun = true;
        canvas.style.cursor = "grabbing";
      }
    }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  });
  canvas.addEventListener("pointermove", e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      e.preventDefault();
      const pinch = pinchState();
      if (!pinch) return;
      setZoom(zoomTarget + Math.log(pinchDistance / pinch.distance));
      yawTarget += shortestAngle(pinch.angle - pinchAngle);
      yawTarget += (pinch.x - pinchX) * 0.0025;
      elevTarget += (pinch.y - pinchY) * 0.004;
      pinchDistance = pinch.distance;
      pinchAngle = pinch.angle;
      pinchX = pinch.x;
      pinchY = pinch.y;
      return;
    }
    if (dragging) {
      const dx = e.clientX - px0, dy = e.clientY - py0;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        userSpun = true;
        yawTarget += dx * 0.006;
        elevTarget += dy * 0.006;
        canvas.style.cursor = "grabbing";
      }
      px0 = e.clientX;
      py0 = e.clientY;
    } else {
      hover = nearest(e.clientX, e.clientY);
      canvas.style.cursor = hover >= 0 ? "pointer" : "grab";
    }
  });
  /** @param {PointerEvent} e */
  const endDrag = e => {
    const wasTracked = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (!wasTracked) return;
    if (pointers.size > 0) {
      const remaining = pointers.values().next().value;
      px0 = remaining.x;
      py0 = remaining.y;
      dragging = true;
      return;
    }
    dragging = false;
    canvas.style.cursor = "grab";
    if (!gestureActive && moved <= 4 && e.clientX !== undefined) {
      const i = nearest(e.clientX, e.clientY);
      const c = i >= 0 && chapterOfBody(i);
      if (c) flyTo(c.el);
    }
    gestureActive = false;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", e => {
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      dragging = false;
      gestureActive = false;
      canvas.style.cursor = "grab";
    }
  });
  canvas.addEventListener("pointerleave", () => { if (!dragging) hover = -1; });
  let nativeGesture = false, nativeScale = 1, nativeRotation = 0;
  canvas.addEventListener("gesturestart", e => {
    e.preventDefault();
    nativeGesture = true;
    nativeScale = e.scale;
    nativeRotation = e.rotation;
    userSpun = true;
  }, { passive: false });
  canvas.addEventListener("gesturechange", e => {
    e.preventDefault();
    setZoom(zoomTarget + Math.log(nativeScale / e.scale));
    yawTarget += (e.rotation - nativeRotation) * D2R;
    nativeScale = e.scale;
    nativeRotation = e.rotation;
  }, { passive: false });
  canvas.addEventListener("gestureend", e => {
    e.preventDefault();
    nativeGesture = false;
  }, { passive: false });
  canvas.addEventListener("wheel", e => {
    /* Trackpad pinch arrives as ctrl+wheel. Ordinary wheel remains page scroll. */
    if (!e.ctrlKey) return;
    e.preventDefault();
    userSpun = true;
    if (!nativeGesture) setZoom(zoomTarget + e.deltaY * 0.006);
  }, { passive: false });
  canvas.style.cursor = "grab";

  /* ---------- draw ---------- */
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  let lastDateStr = "";

  const drawBackdrop = () => {
    ctx.clearRect(0, 0, cw, ch);
    if (!backdrop.complete || !backdrop.naturalWidth) return;
    const iw = backdrop.naturalWidth, ih = backdrop.naturalHeight;
    const sc = Math.max(cw / iw, ch / ih) * 1.06;         /* slack for parallax */
    const dw = iw * sc, dh = ih * sc;
    const oxMax = (dw - cw) / 2, oyMax = (dh - ch) / 2;
    const ox = Math.max(-oxMax, Math.min(oxMax, Math.sin(yaw * 0.5) * 40));
    const oy = Math.max(-oyMax, Math.min(oyMax, Math.sin(elev - 0.9) * 30));
    ctx.drawImage(backdrop, (cw - dw) / 2 + ox, (ch - dh) / 2 + oy, dw, dh);
  };

  function drawOrbits(focusIdx) {
    const orbitGold = "oklch(78% 0.115 82)";
    /* orbit paths, pen up where they pass behind the camera */
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
        ? "color-mix(in oklab, " + orbitGold + " 78%, transparent)"
        : "color-mix(in oklab, " + orbitGold + " 38%, transparent)";
      ctx.lineWidth = i === focusIdx ? 1.35 : 1;
      ctx.stroke();
    }

  }

  function projectBodies(T) {
    /* one universal size rule: no body gets special treatment */
    /** @type {{ sun: boolean, i: number, p: (typeof EL)[number] | null, s: Proj, R: number }[]} */
    const bodies = EL.map((p, i) => {
      const pos = positionAt(p, T);
      const s = project(pos);
      const R = p.px * BODY_SCALE * s.s;
      screenPos[i] = { ...s, R };
      return { sun: false, i, p, s, R };
    });
    const sunS = project({ x: 0, y: 0, z: 0 });
    const sunR = SUNPX * BODY_SCALE * sunS.s;
    sunPos = { ...sunS, R: sunR };
    bodies.push({ sun: true, i: -1, p: null, s: sunS, R: sunR });
    bodies.sort((a, b) => a.s.zd - b.s.zd);

    return bodies;
  }

  function drawPlanet(b, focusBody, focusIdx, ink, muted) {
    const showAll = focusBody === "system" || Math.min(cw, ch) > 500;
    const { i, s, R } = b;
    const p = /** @type {(typeof EL)[number]} */ (b.p);
    const name = p.name.toLowerCase();
    if (s.x + R * 2.5 < 0 || s.x - R * 2.5 > cw || s.y + R * 2.5 < 0 || s.y - R * 2.5 > ch) return;
    const textured = name === "saturn" ? drawSaturn(s.x, s.y, R) : drawSphere(name, s.x, s.y, R);
    if (!textured) return;
    /* No ring around the focused planet: the label alone marks it, set in
       ink against the muted labels of the others. */
    const overSun = Math.hypot(s.x - sunPos.x, s.y - sunPos.y) < sunPos.R + 14;
    if (R < 60 && !overSun && (showAll || [focusIdx, hover].includes(i))) {
      ctx.fillStyle = hover === i || i === focusIdx ? ink : muted;
      ctx.fillText(name, s.x + R + 6, s.y + 3.5);
    }
  }

  function draw(T, c) {
    const ink = css("--ink"), muted = css("--muted");
    const focusBody = chapters[Math.round(c)].body;
    const focusIdx = IDX[focusBody] ?? -1;
    drawBackdrop();
    drawOrbits(focusIdx);
    ctx.font = "10.5px " + (css("--font-mono") || "monospace");
    for (const b of projectBodies(T)) {
      if (b.s.clip) continue;
      if (!b.sun) {
        drawPlanet(b, focusBody, focusIdx, ink, muted);
        continue;
      }
      if (!drawSphere("sun", b.s.x, b.s.y, b.R)) continue;
      if (focusBody === "sun" && b.R < 60) {
        ctx.fillStyle = ink;
        ctx.fillText("sun", b.s.x + b.R + 8, b.s.y + 3.5);
      }
    }
    const ds = fmt.format(new Date(simMs));
    if (ds !== lastDateStr) { lastDateStr = ds; dateEl.textContent = ds; }
  }

  /* ---------- loop ---------- */
  let initialised = false;
  /** @type {number | null} */
  let cSm = null;
  let prev = performance.now();
  /** @param {string} id */
  const navTargetFor = id => ({
    digits: "#digits",
    chess: "#digits",
    maze: "#digits",
    projects: "#projects",
    experience: "#projects",
    background: "#background",
    research: "#research",
    contact: "#contact",
  })[id] || "";
  /** @param {number} index */
  const updateChapterNav = index => {
    const chapter = chapters[index];
    const target = navTargetFor(chapter.el.id);
    let activeLabel = chapter.body === "sun" ? "Home" : "Sections";
    navLinks.forEach(link => {
      const active = link.getAttribute("href") === target;
      if (active) {
        link.setAttribute("aria-current", "location");
        activeLabel = link.dataset.label || link.textContent?.trim() || activeLabel;
      } else {
        link.removeAttribute("aria-current");
      }
    });
    menuCurrent.textContent = activeLabel;
  };
  /** @param {number} now */
  const tick = now => {
    if (!initialised) {
      requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    simMs += dt * speed * 86400000;
    if (!reduced && speed !== 0) surfaces.phase += dt * 0.045;
    const T = centuries(simMs);

    const cRaw = chapterAt();
    if (cSm === null) cSm = cRaw;
    /* a jump this big is an anchor navigation or a late layout shift, not a
       scroll: snap, so the camera never flies through every planet to get
       there. A smooth in-page scroll moves well under a chapter per frame. */
    if (reduced || Math.abs(cRaw - cSm) > 1.2) cSm = cRaw;
    else cSm += (cRaw - cSm) * (1 - Math.exp(-dt * 3.2));
    cam = camFrom(cSm, T);
    const activeChapter = Math.round(cSm);
    if (activeChapter !== zoomChapter) {
      zoomChapter = activeChapter;
      zoomOffset = zoomTarget = 0;
      updateChapterNav(activeChapter);
    }
    const inputBlend = 1 - Math.exp(-dt * 18);
    yaw += (yawTarget - yaw) * inputBlend;
    elev += (elevTarget - elev) * inputBlend;
    zoomOffset += (zoomTarget - zoomOffset) * inputBlend;
    updateCameraDistance();

    if (chapters[activeChapter].body === "system" && !userSpun && !dragging && !reduced) yawTarget += dt * 0.02;

    planetBtns.forEach((b, i) => b.classList.toggle("is-active", i === Math.round(cRaw)));

    draw(T, cSm);
    requestAnimationFrame(tick);
  };

  resize();
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(recalcCenters).observe(document.body);
  window.addEventListener("load", () => {
    recalcCenters();
    const hash = location.hash;
    if (hash === "#top") {
      /* #top means the document origin, not the centre of the full-height
         hero chapter. Keep the fragment for new-tab fallback semantics. */
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } else if (hash) {
      const target = document.querySelector(hash);
      if (target) {
        /* behavior "auto" defers to CSS, and styles.css sets
           scroll-behavior: smooth, so this animated up from the top and
           dragged the camera through every planet on its way. Force a real
           jump by suspending smooth scrolling for the duration. */
        const root = document.documentElement;
        const prevBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        target.scrollIntoView({ behavior: "instant", block: "start" });
        root.style.scrollBehavior = prevBehavior;
      }
    }
    cSm = chapterAt();
    cam = camFrom(cSm, centuries(simMs));
    updateCameraDistance();
    initialised = true;
  });
  requestAnimationFrame(tick);

  /* debug / verification handle: also for the curious */
  /** @type {any} */ (window).orrery = {
    date: () => new Date(simMs),
    view: () => ({ yaw, elevDeg: elev / D2R, camDist: dCam, zoom: Math.exp(-zoomOffset) }),
    scale: () => ({ mercurySunDiameters: mapR(0.38709927) / (2 * SUNPX * BODY_SCALE) }),
    chapter: () => chapterAt(),
    /** @param {string} name */
    screen: name => name === "sun" ? sunPos : screenPos[IDX[String(name).toLowerCase()]],
    /** @param {string} name  @param {string | number | Date} [when] */
    state: (name, when) => {
      const i = IDX[String(name).toLowerCase()];
      if (i === undefined) return null;
      const T = centuries(when ? new Date(when).getTime() : simMs);
      const pos = positionAt(EL[i], T);
      return { rAU: pos.r, lonDeg: pos.lon, zAU: pos.z, periodDays: periodDays[i] };
    },
  };
})();
