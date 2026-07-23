/* The site's framework: a solar system the page travels through.
   Every planet's position is computed, not drawn: JPL approximate
   Keplerian elements (Standish, valid 1800–2050) propagated to the
   simulated date, Kepler's equation solved by Newton's method each
   frame, positions rotated from each orbital plane to the ecliptic,
   inclinations included. A hand-rolled camera (focus point, zoom,
   yaw + elevation, perspective divide, painter's sort) projects onto
   a fixed canvas; there is no 3D library.

   Close views use texture-mapped spheres for bodies where an evenly lit,
   high-resolution surface matters, with mission photographs retained for
   the remaining planets. The backdrop is the Milky Way (ESO/S. Brunier).

   Each .chapter element declares the body it lives on (data-body).
   Scroll drives the camera: it holds close on a chapter's planet,
   pulls out through the orbits between chapters, snaps in on the
   next, and ends on the whole system, where clicking a planet flies
   you back to its section. The camera is a dolly: apparent size is
   size × focal length ÷ distance, and "zoom" means moving closer.
   The scale is pinned to the Sun: Mercury's orbit sits at its true
   40 Sun diameters: with radial distances compressed by r^0.6 in AU
   so Neptune stays within one journey; angles are true. */
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
    { name: "Mercury", glyph: "☿", col: "oklch(74% 0.015 60)",  px: 2.6,
      a: [0.38709927, 0.00000037],  e: [0.20563593, 0.00001906],  I: [7.00497902, -0.00594749],
      L: [252.25032350, 149472.67411175], W: [77.45779628, 0.16047689],  O: [48.33076593, -0.12534081] },
    { name: "Venus",   glyph: "♀", col: "oklch(85% 0.055 85)",  px: 4.1,
      a: [0.72333566, 0.00000390],  e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890],
      L: [181.97909950, 58517.81538729],  W: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
    { name: "Earth",   glyph: "⊕", col: "oklch(72% 0.09 235)",  px: 4.2,
      a: [1.00000261, 0.00000562],  e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668],
      L: [100.46457166, 35999.37244981],  W: [102.93768193, 0.32327364], O: [0, 0] },
    { name: "Mars",    glyph: "♂", col: "oklch(66% 0.13 40)",   px: 3.15,
      a: [1.52371034, 0.00001847],  e: [0.09339410, 0.00007882],  I: [1.84969142, -0.00813131],
      L: [-4.55343205, 19140.30268499],   W: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
    { name: "Jupiter", glyph: "♃", col: "oklch(77% 0.065 70)",  px: 13.9,
      a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714],
      L: [34.39644051, 3034.74612775],    W: [14.72847983, 0.21252668],  O: [100.47390909, 0.20469106] },
    { name: "Saturn",  glyph: "♄", col: "oklch(83% 0.075 90)",  px: 12.7,
      a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609],
      L: [49.95424423, 1222.49362201],    W: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
    { name: "Uranus",  glyph: "♅", col: "oklch(80% 0.055 200)", px: 8.4,
      a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939],
      L: [313.23810451, 428.48202785],    W: [170.95427630, 0.40805281], O: [74.01692503, 0.04240589] },
    { name: "Neptune", glyph: "♆", col: "oklch(64% 0.10 260)",  px: 8.3,
      a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105],  I: [1.77004347, 0.00035372],
      L: [-55.12002969, 218.45945325],    W: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664] },
  ];
  const IDX = Object.fromEntries(EL.map((p, i) => [p.name.toLowerCase(), i]));

  /* Photograph billboards, for the bodies with no equirectangular map.
     Bodies that get a projected sphere are deliberately absent: painting a
     billboard first and swapping it for the sphere is what caused the blink. */
  /** @type {Record<string, { w: number, h: number, cx: number, cy: number, discR: number }>} */
  const SPRITES = {
    earth:   { w: 640, h: 636, cx: 322.3, cy: 320.3, discR: 313.3 },
    mars:    { w: 629, h: 640, cx: 314.3, cy: 320,   discR: 307.4 },
    uranus:  { w: 640, h: 626, cx: 320,   cy: 312.8, discR: 305.6 },
    neptune: { w: 622, h: 640, cx: 310.8, cy: 320,   discR: 303.9 },
  };
  /** @type {Record<string, HTMLImageElement>} */
  const IMG = {};
  for (const name of Object.keys(SPRITES)) {
    const im = new Image();
    im.src = "assets/planets/" + name + ".webp";
    IMG[name] = im;
  }

  /* High-resolution equirectangular maps are projected once into sphere
     sprites. Illumination stays deliberately broad: these chapter portraits
     are for recognition and texture, not a simulation of the current phase. */
  const SPHERE_SIZE = 1024;
  /** @type {Record<string, HTMLCanvasElement>} */
  const SPHERES = {};
  /** @type {HTMLCanvasElement | null} */
  let sunCorona = null;
  /** @type {Uint8ClampedArray | null} */
  let ringPixels = null;

  /** @param {HTMLImageElement} im */
  const buildSphere = im => {
    const source = document.createElement("canvas");
    source.width = im.naturalWidth;
    source.height = im.naturalHeight;
    const sctx = /** @type {CanvasRenderingContext2D} */ (source.getContext("2d", { willReadFrequently: true }));
    sctx.drawImage(im, 0, 0);
    const src = sctx.getImageData(0, 0, source.width, source.height).data;

    const out = document.createElement("canvas");
    out.width = out.height = SPHERE_SIZE;
    const octx = /** @type {CanvasRenderingContext2D} */ (out.getContext("2d"));
    const image = octx.createImageData(SPHERE_SIZE, SPHERE_SIZE);
    const dst = image.data;
    const sw = source.width, sh = source.height;

    for (let y = 0; y < SPHERE_SIZE; y++) {
      const ny = ((y + 0.5) / SPHERE_SIZE) * 2 - 1;
      for (let x = 0; x < SPHERE_SIZE; x++) {
        const nx = ((x + 0.5) / SPHERE_SIZE) * 2 - 1;
        const r2 = nx * nx + ny * ny;
        if (r2 >= 1) continue;
        const nz = Math.sqrt(1 - r2);
        const lon = Math.atan2(nx, nz);
        const lat = Math.asin(-ny);
        const u = Math.min(sw - 1, Math.max(0, Math.round((lon / TAU + 0.5) * (sw - 1))));
        const v = Math.min(sh - 1, Math.max(0, Math.round((lat / Math.PI + 0.5) * (sh - 1))));
        const si = (v * sw + u) * 4;
        const di = (y * SPHERE_SIZE + x) * 4;
        const light = 0.88 + nz * 0.12;
        dst[di] = Math.min(255, src[si] * light);
        dst[di + 1] = Math.min(255, src[si + 1] * light);
        dst[di + 2] = Math.min(255, src[si + 2] * light);
        dst[di + 3] = Math.min(255, (1 - r2) * 90 * 255);
      }
    }
    octx.putImageData(image, 0, 0);
    return out;
  };

  /** @param {HTMLImageElement} im */
  const buildSunAssets = im => {
    const source = document.createElement("canvas");
    source.width = im.naturalWidth;
    source.height = im.naturalHeight;
    const sctx = /** @type {CanvasRenderingContext2D} */ (source.getContext("2d", { willReadFrequently: true }));
    sctx.drawImage(im, 0, 0);
    const src = sctx.getImageData(0, 0, source.width, source.height).data;

    const disc = document.createElement("canvas");
    disc.width = disc.height = SPHERE_SIZE;
    const octx = /** @type {CanvasRenderingContext2D} */ (disc.getContext("2d"));
    const image = octx.createImageData(SPHERE_SIZE, SPHERE_SIZE);
    const dst = image.data;
    const cx = source.width * 0.5;
    const cy = source.height * 0.486;
    const solarR = source.height * 0.398;

    for (let y = 0; y < SPHERE_SIZE; y++) {
      const ny = ((y + 0.5) / SPHERE_SIZE) * 2 - 1;
      for (let x = 0; x < SPHERE_SIZE; x++) {
        const nx = ((x + 0.5) / SPHERE_SIZE) * 2 - 1;
        const r2 = nx * nx + ny * ny;
        if (r2 >= 1) continue;
        const sx = Math.min(source.width - 1, Math.max(0, Math.round(cx + nx * solarR)));
        const sy = Math.min(source.height - 1, Math.max(0, Math.round(cy + ny * solarR)));
        const si = (sy * source.width + sx) * 4;
        const di = (y * SPHERE_SIZE + x) * 4;
        dst[di] = Math.min(255, src[si] * 1.08);
        dst[di + 1] = Math.min(255, src[si + 1] * 0.72);
        dst[di + 2] = Math.min(255, src[si + 2] * 0.38);
        dst[di + 3] = Math.min(255, (1 - r2) * 180 * 255);
      }
    }
    octx.putImageData(image, 0, 0);

    /* The SDO frame already contains real prominences. Extract them instead
       of inventing a radial starburst; the solid disc is painted over this. */
    const corona = document.createElement("canvas");
    corona.width = corona.height = SPHERE_SIZE;
    const cctx = /** @type {CanvasRenderingContext2D} */ (corona.getContext("2d"));
    const coronaImage = cctx.createImageData(SPHERE_SIZE, SPHERE_SIZE);
    const cdst = coronaImage.data;
    const coronaR = solarR * 1.52;
    for (let y = 0; y < SPHERE_SIZE; y++) {
      const ny = ((y + 0.5) / SPHERE_SIZE) * 2 - 1;
      for (let x = 0; x < SPHERE_SIZE; x++) {
        const nx = ((x + 0.5) / SPHERE_SIZE) * 2 - 1;
        const r = Math.hypot(nx, ny);
        if (r >= 1) continue;
        const sx = Math.min(source.width - 1, Math.max(0, Math.round(cx + nx * coronaR)));
        const sy = Math.min(source.height - 1, Math.max(0, Math.round(cy + ny * coronaR)));
        const si = (sy * source.width + sx) * 4;
        const di = (y * SPHERE_SIZE + x) * 4;
        /* The 171 Å plasma is warm-coloured; neutral pixels are the source
           frame's timestamp and stars, so exclude them from the extraction. */
        const plasma = Math.max(0, src[si] - src[si + 2] * 1.2);
        const outerFade = Math.min(1, (1 - r) * 8);
        cdst[di] = Math.min(255, src[si] * 1.16);
        cdst[di + 1] = Math.min(255, src[si + 1] * 0.7);
        cdst[di + 2] = Math.min(255, src[si + 2] * 0.3);
        cdst[di + 3] = Math.min(210, Math.max(0, plasma - 4) * 3.35) * outerFade;
      }
    }
    cctx.putImageData(coronaImage, 0, 0);
    return { disc, corona };
  };

  for (const name of ["mercury", "venus", "jupiter", "saturn"]) {
    const im = new Image();
    im.addEventListener("load", () => { SPHERES[name] = buildSphere(im); });
    im.src = "assets/planets/textures/" + name + ".jpg";
  }

  const sunImage = new Image();
  sunImage.addEventListener("load", () => {
    const assets = buildSunAssets(sunImage);
    SPHERES.sun = assets.disc;
    sunCorona = assets.corona;
  });
  sunImage.src = "assets/planets/textures/sun-sdo.jpg";

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
  /** @param {string} name  @param {number} x  @param {number} y  @param {number} R  @param {number} [alpha] */
  const drawSprite = (name, x, y, R, alpha) => {
    const im = IMG[name], sp = SPRITES[name];
    if (!im || !sp || !im.complete || !im.naturalWidth) return false;
    const sc = R / sp.discR;
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(im, x - sp.cx * sc, y - sp.cy * sc, sp.w * sc, sp.h * sc);
    ctx.globalAlpha = 1;
    return true;
  };

  /** @param {string} name  @param {number} x  @param {number} y  @param {number} R */
  const drawSphere = (name, x, y, R) => {
    const sphere = SPHERES[name];
    if (!sphere) return false;
    ctx.drawImage(sphere, x - R, y - R, R * 2, R * 2);
    return true;
  };

  /** @param {number} x  @param {number} y  @param {number} R  @param {boolean} front */
  const drawSaturnRings = (x, y, R, front) => {
    if (!ringPixels) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - R * 2.5, front ? y : y - R, R * 5, R);
    ctx.clip();
    const samples = ringPixels.length / 4;
    for (let band = 0; band < 72; band++) {
      const t = band / 71;
      const si = Math.min(samples - 1, Math.round(t * (samples - 1))) * 4;
      const a = ringPixels[si + 3] / 255;
      if (a < 0.025) continue;
      const rr = R * (1.2 + t * 1.05);
      ctx.strokeStyle = `rgba(${ringPixels[si]}, ${ringPixels[si + 1]}, ${ringPixels[si + 2]}, ${a * 0.82})`;
      ctx.lineWidth = Math.max(0.55, R * 0.018);
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * 0.24, -0.035, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  };

  /** @param {number} x  @param {number} y  @param {number} R */
  const drawSaturn = (x, y, R) => {
    if (!SPHERES.saturn || !ringPixels) return false;
    drawSaturnRings(x, y, R, false);
    drawSphere("saturn", x, y, R);
    drawSaturnRings(x, y, R, true);
    return true;
  };

  /** @param {number} x  @param {number} y  @param {number} R */
  const drawSunCorona = (x, y, R) => {
    if (R < 8 || !sunCorona) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const coronaR = R * 1.52;
    ctx.drawImage(sunCorona, x - coronaR, y - coronaR, coronaR * 2, coronaR * 2);
    ctx.restore();
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
     at system distance the planets really are sub-pixel, so they get
     minimum-size chart dots */
  const SUNPX = 44;                          /* √(real radius) scale, like the planets */
  /** @param {string} body */
  const distOf = body => {
    if (body === "system") return mapR(31.6) * FL / (0.42 * Math.min(cw, ch));
    const frac = narrow ? 0.20 : 0.30;
    const px = body === "sun" ? SUNPX : EL[IDX[body]].px;
    return px * FL / (frac * Math.min(cw, ch));
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
  let zoomOffset = 0;
  let zoomChapter = -1;
  let userSpun = false;
  const ELEV_MIN = 8 * D2R, ELEV_MAX = 88 * D2R;
  const ZOOM_MIN = -1.35, ZOOM_MAX = 1.25;

  const EXP = 0.6;                            /* radial compression: r^0.6 in AU */
  /* Mercury's orbit ≈ 15 Sun diameters: the real figure is ~42, but this is
     enough that the Sun reads as a distant disc from every planet without
     stranding the inner system in empty black */
  const K = (15 * 2 * SUNPX) / Math.pow(0.38709927, EXP);
  let cw = 0, ch = 0, FL = 1000, dpr = 1, narrow = false;
  const backdrop = new Image();

  /** @param {number} r */
  const mapR = r => K * Math.pow(r, EXP);
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
    if (c.body === "system") return { x: 0.5, y: 0.55 };
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

  const resize = () => {
    cw = window.innerWidth;
    ch = window.innerHeight;
    narrow = cw <= 780;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    FL = 1.1 * Math.min(cw, ch);
    recalcCenters();
  };

  backdrop.src = "assets/space.jpg";

  /* ---------- HUD ---------- */
  const dateEl = /** @type {HTMLElement} */ (document.getElementById("solar-date"));
  const speedBtns = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".orrery__speeds button[data-speed]"))];
  const gotoBtns = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".orrery__planets button[data-goto]"))];

  /** @param {number} s */
  const setSpeed = s => {
    speed = s;
    speedBtns.forEach(b => b.classList.toggle("is-active", Number(b.dataset.speed) === s));
  };
  setSpeed(speed);
  speedBtns.forEach(b => b.addEventListener("click", () => setSpeed(Number(b.dataset.speed))));
  /** @type {HTMLElement} */ (document.getElementById("solar-today")).addEventListener("click", () => { simMs = Date.now(); });

  /** @param {Element} el */
  const flyTo = el => el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  gotoBtns.forEach(b => b.addEventListener("click", () => {
    const sel = b.dataset.goto || "#top";
    const t = sel === "#top" ? chapters[0].el : document.querySelector(sel);
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
    zoomOffset = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
  };
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
      setZoom(zoomOffset + Math.log(pinchDistance / pinch.distance));
      yaw += shortestAngle(pinch.angle - pinchAngle) * 0.82;
      yaw += (pinch.x - pinchX) * 0.0025;
      elev = Math.min(ELEV_MAX, Math.max(ELEV_MIN, elev + (pinch.y - pinchY) * 0.002));
      pinchDistance = pinch.distance;
      pinchAngle = pinch.angle;
      pinchX = pinch.x;
      pinchY = pinch.y;
      return;
    }
    if (gestureActive) return;
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
  /** @param {PointerEvent} e */
  const endDrag = e => {
    const wasTracked = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (!wasTracked || pointers.size > 0) return;
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
  canvas.addEventListener("wheel", e => {
    /* Trackpad pinch arrives as ctrl+wheel. Ordinary wheel remains page scroll. */
    if (!e.ctrlKey) return;
    e.preventDefault();
    userSpun = true;
    setZoom(zoomOffset + e.deltaY * 0.006);
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
    const oy = Math.max(-oyMax, Math.min(oyMax, (elev / ELEV_MAX - 0.6) * 30));
    ctx.drawImage(backdrop, (cw - dw) / 2 + ox, (ch - dh) / 2 + oy, dw, dh);
  };

  /** @param {number} T  @param {number} c */
  const draw = (T, c) => {
    const ink = css("--ink"), muted = css("--muted"), brass = css("--red");
    const orbitGold = "oklch(78% 0.115 82)";
    const focusBody = chapters[Math.round(c)].body;
    const focusIdx = IDX[focusBody] ?? -1;
    const maxR = Math.min(cw, ch) * 1.4;

    drawBackdrop();

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

    /* bodies, painter-sorted far → near */
    const showAll = focusBody === "system" || Math.min(cw, ch) > 500;
    /* one universal size rule: no body gets special treatment */
    /** @type {{ sun: boolean, i: number, p: (typeof EL)[number] | null, s: Proj, R: number }[]} */
    const bodies = EL.map((p, i) => {
      const pos = positionAt(p, T);
      const s = project(pos);
      const trueR = Math.min(maxR, p.px * s.s);
      const systemR = 4.5 + (p.px / 13.9) * 3.5;
      const R = focusBody === "system" ? Math.max(trueR, systemR) : trueR;
      screenPos[i] = { ...s, R };
      return { sun: false, i, p, s, R };
    });
    const sunS = project({ x: 0, y: 0, z: 0 });
    const sunTrueR = Math.min(maxR, SUNPX * sunS.s);
    // Preserve the Sun's visual hierarchy in the compressed whole-system chart.
    const sunR = focusBody === "system" ? Math.max(sunTrueR, 11.5) : sunTrueR;
    sunPos = { ...sunS, R: sunR };
    bodies.push({ sun: true, i: -1, p: null, s: sunS, R: sunR });
    bodies.sort((a, b) => a.s.zd - b.s.zd);

    ctx.font = "10.5px " + (css("--font-mono") || "monospace");
    for (const b of bodies) {
      if (b.s.clip) continue;
      if (b.sun) {
        /* the Sun never quite vanishes: below true size it stays a bright point */
        const R = Math.max(b.R, 2.2);
        drawSunCorona(b.s.x, b.s.y, R);
        const drewSun = R >= 6 && drawSphere("sun", b.s.x, b.s.y, R);
        if (!drewSun) {
          /* Below point size the Sun is legitimately a bright dot. Any larger
             and it waits for its own texture: no stand-in is drawn first. */
          if (R >= 6) continue;
          ctx.fillStyle = "oklch(80% 0.16 48)";
          ctx.beginPath(); ctx.arc(b.s.x, b.s.y, R, 0, TAU); ctx.fill();
        }
        if ((focusBody === "system" || focusBody === "sun") && b.R < 60) {
          ctx.fillStyle = focusBody === "sun" ? ink : muted;
          ctx.fillText("sun", b.s.x + b.R + 8, b.s.y + 3.5);
        }
        continue;
      }
      const { i, s, R } = b;
      const p = /** @type {(typeof EL)[number]} */ (b.p);
      const name = p.name.toLowerCase();
      const textured = R >= 4.5 && (name === "saturn"
        ? drawSaturn(s.x, s.y, R)
        : drawSphere(name, s.x, s.y, R));
      const photographed = !textured && R >= 4.5 && drawSprite(name, s.x, s.y, R);
      if (R < 4.5) {
        /* sub-pixel at this distance, as in reality: draw a chart dot */
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.max(R, 2.4) + (hover === i ? 1 : 0), 0, TAU);
        ctx.fill();
      } else if (!textured && !photographed) {
        /* Big enough on screen to need a real surface, but its map has not
           decoded yet: skip the body entirely rather than flashing the flat
           untextured disc. It appears on the first frame after it loads. */
        continue;
      }
      if (i === focusIdx && R < 60) {
        ctx.strokeStyle = brass;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, R + 5, 0, TAU);
        ctx.stroke();
      }
      const overSun = Math.hypot(s.x - sunPos.x, s.y - sunPos.y) < sunPos.R + 14;
      if (R < 60 && !overSun && (showAll || i === focusIdx || i === hover)) {
        ctx.fillStyle = hover === i || i === focusIdx ? ink : muted;
        ctx.fillText(name, s.x + R + 6, s.y + 3.5);
      }
    }

    const ds = fmt.format(new Date(simMs));
    if (ds !== lastDateStr) { lastDateStr = ds; dateEl.textContent = ds; }
  };

  /* ---------- loop ---------- */
  /** @type {number | null} */
  let cSm = null;
  let prev = performance.now();
  /** @param {number} now */
  const tick = now => {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    simMs += dt * speed * 86400000;
    const T = centuries(simMs);

    const cRaw = chapterAt();
    if (cSm === null) cSm = cRaw;
    cSm += (cRaw - cSm) * (1 - Math.exp(-dt * 3.2));
    cam = camFrom(cSm, T);
    const activeChapter = Math.round(cSm);
    if (activeChapter !== zoomChapter) {
      zoomChapter = activeChapter;
      zoomOffset = 0;
    }
    dCam = Math.exp(cam.zl + zoomOffset);

    if (chapters[activeChapter].body === "system" && !userSpun && !dragging && !reduced) yaw += dt * 0.02;

    gotoBtns.forEach((b, i) => b.classList.toggle("is-active", i === Math.round(cRaw) && i < gotoBtns.length));

    draw(T, cSm);
    requestAnimationFrame(tick);
  };

  resize();
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(recalcCenters).observe(document.body);
  window.addEventListener("load", recalcCenters);
  requestAnimationFrame(tick);

  /* debug / verification handle: also for the curious */
  /** @type {any} */ (window).orrery = {
    date: () => new Date(simMs),
    view: () => ({ yaw, elevDeg: elev / D2R, camDist: dCam, zoom: Math.exp(-zoomOffset) }),
    scale: () => ({ mercurySunDiameters: mapR(0.38709927) / (2 * SUNPX) }),
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
