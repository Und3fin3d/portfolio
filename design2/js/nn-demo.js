/* Fig. 1 — live MNIST classifier.
   Runs the exact weights trained by nn.py (784-20-10-10, ReLU + softmax).
   Weights are base64 little-endian float32, row-major. */
(() => {
  const canvas = document.getElementById("nn-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const hint = document.getElementById("nn-hint");
  const guessEl = document.getElementById("nn-guess");
  const confEl = document.getElementById("nn-conf");
  const barsEl = document.getElementById("nn-bars");

  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#22283f";

  /* ---- crisp canvas at device pixel ratio ---- */
  const SIZE = 280;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 19;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  /* ---- output DOM ---- */
  const bars = [];
  for (let d = 0; d <= 9; d++) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${d}</span><span class="bar"><i></i></span><span class="pct">–</span>`;
    barsEl.appendChild(li);
    bars.push({ li, fill: li.querySelector("i"), pct: li.querySelector(".pct") });
  }

  const layer1 = document.getElementById("nn-layer1");
  const layer2 = document.getElementById("nn-layer2");
  layer1.style.gridTemplateColumns = "repeat(2, auto)";
  layer2.style.gridTemplateColumns = "repeat(2, auto)";
  const dots1 = [], dots2 = [];
  for (let i = 0; i < 20; i++) { const s = document.createElement("span"); s.className = "nn-net__dot"; s.style.opacity = 0.08; layer1.appendChild(s); dots1.push(s); }
  for (let i = 0; i < 10; i++) { const s = document.createElement("span"); s.className = "nn-net__dot"; s.style.opacity = 0.08; layer2.appendChild(s); dots2.push(s); }

  /* ---- weights ---- */
  let net = null;
  const b64ToF32 = b64 => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  };

  fetch("assets/nn-weights.json")
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => {
      net = {};
      for (const l of json.layers) net[l.name] = { shape: l.shape, data: b64ToF32(l.data) };
    })
    .catch(() => { hint.textContent = "could not load network weights"; });

  const matvec = (w, x, b, out) => {
    const [rows, cols] = w.shape;
    const wd = w.data, bd = b.data;
    for (let r = 0; r < rows; r++) {
      let s = bd[r];
      const off = r * cols;
      for (let c = 0; c < cols; c++) s += wd[off + c] * x[c];
      out[r] = s;
    }
  };
  const relu = v => { for (let i = 0; i < v.length; i++) if (v[i] < 0) v[i] = 0; };

  const forward = x => {
    const a1 = new Float32Array(20), a2 = new Float32Array(10), a3 = new Float32Array(10);
    matvec(net.w1, x, net.b1, a1); relu(a1);
    matvec(net.w2, a1, net.b2, a2); relu(a2);
    matvec(net.w3, a2, net.b3, a3);
    let m = -Infinity;
    for (const v of a3) m = Math.max(m, v);
    let sum = 0;
    for (let i = 0; i < 10; i++) { a3[i] = Math.exp(a3[i] - m); sum += a3[i]; }
    for (let i = 0; i < 10; i++) a3[i] /= sum;
    return { a1, a2, probs: a3 };
  };

  /* ---- MNIST-style preprocessing: crop, fit to 20px, centre by mass ---- */
  const preprocess = () => {
    const full = ctx.getImageData(0, 0, SIZE * dpr, SIZE * dpr);
    const fw = SIZE * dpr;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < full.height; y += 2) {
      for (let x = 0; x < fw; x += 2) {
        if (full.data[(y * fw + x) * 4 + 3] > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const scale = 20 / Math.max(bw, bh);
    const dw = Math.max(1, Math.round(bw * scale)), dh = Math.max(1, Math.round(bh * scale));
    const off = document.createElement("canvas");
    off.width = 28; off.height = 28;
    const octx = off.getContext("2d", { willReadFrequently: true });
    octx.drawImage(canvas, minX, minY, bw, bh, (28 - dw) / 2, (28 - dh) / 2, dw, dh);

    const img = octx.getImageData(0, 0, 28, 28);
    let x = new Float32Array(784);
    let mass = 0, cx = 0, cy = 0;
    for (let i = 0; i < 784; i++) {
      const v = img.data[i * 4 + 3] / 255;
      x[i] = v;
      mass += v; cx += (i % 28) * v; cy += Math.floor(i / 28) * v;
    }
    if (mass === 0) return null;
    const dx = Math.round(13.5 - cx / mass), dy = Math.round(13.5 - cy / mass);
    if (dx || dy) {
      const shifted = new Float32Array(784);
      for (let yy = 0; yy < 28; yy++) {
        for (let xx = 0; xx < 28; xx++) {
          const sx = xx - dx, sy = yy - dy;
          if (sx >= 0 && sx < 28 && sy >= 0 && sy < 28) shifted[yy * 28 + xx] = x[sy * 28 + sx];
        }
      }
      x = shifted;
    }
    return x;
  };

  const setDots = (dots, acts) => {
    let max = 0;
    for (const v of acts) max = Math.max(max, v);
    dots.forEach((d, i) => { d.style.opacity = max > 0 ? 0.08 + 0.92 * (acts[i] / max) : 0.08; });
  };

  const predict = () => {
    if (!net) return;
    const x = preprocess();
    if (!x) return;
    const { a1, a2, probs } = forward(x);
    let best = 0;
    for (let i = 1; i < 10; i++) if (probs[i] > probs[best]) best = i;
    guessEl.textContent = best;
    confEl.textContent = `p = ${(probs[best] * 100).toFixed(1)}%`;
    bars.forEach((b, i) => {
      b.fill.style.width = `${(probs[i] * 100).toFixed(1)}%`;
      b.pct.textContent = `${(probs[i] * 100).toFixed(1)}%`;
      b.li.classList.toggle("is-top", i === best);
    });
    setDots(dots1, a1);
    setDots(dots2, a2);
    hint.textContent = "the network is live: keep drawing";
  };

  const reset = () => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    guessEl.textContent = "·";
    confEl.textContent = "";
    bars.forEach(b => { b.fill.style.width = "0%"; b.pct.textContent = "–"; b.li.classList.remove("is-top"); });
    [...dots1, ...dots2].forEach(d => (d.style.opacity = 0.08));
    hint.textContent = "draw a digit, 0–9";
  };

  /* ---- pointer drawing ---- */
  let drawing = false, last = null, raf = 0;
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (SIZE / r.width), y: (e.clientY - r.top) * (SIZE / r.height) };
  };
  const queuePredict = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; predict(); });
  };

  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    drawing = true;
    last = pos(e);
    ctx.beginPath();
    ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    queuePredict();
  });
  canvas.addEventListener("pointermove", e => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    queuePredict();
  });
  const stop = () => { if (drawing) { drawing = false; predict(); } };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);

  document.getElementById("nn-clear").addEventListener("click", reset);
})();
