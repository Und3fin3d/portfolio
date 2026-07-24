/* Fig. 3: maze generation + graph search, animated.
   Recursive-backtracker maze; BFS, DFS and A* (Manhattan) run on the same
   grid graph so nodes-visited counts are comparable. */
// @ts-check
(() => {
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById("maze-canvas"));
  if (!canvas) return;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const W = 55, H = 35;                      // wall grid (cells 27×17)
  const START = { x: 1, y: 1 }, GOAL = { x: W - 2, y: H - 2 };
  /** @param {number} x  @param {number} y */
  const idx = (x, y) => y * W + x;

  /** @param {string} name */
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const COL = {
    wall: css("--blue") || "#2c437c",
    bg: css("--paper-high") || "#faf8f2",
    visited: "color-mix(in oklab, " + (css("--blue") || "#2c437c") + " 22%, " + (css("--paper-high") || "#faf8f2") + ")",
    path: css("--red") || "#c33b26",
    mark: css("--red") || "#c33b26",
  };

  const statVisited = /** @type {HTMLElement} */ (document.getElementById("maze-visited"));
  const statPath = /** @type {HTMLElement} */ (document.getElementById("maze-path"));
  const statFrontier = /** @type {HTMLElement} */ (document.getElementById("maze-frontier"));

  /** @typedef {{ order: number[], path: number[], frontierPeak: number }} Result */

  let walls = new Uint8Array(0), cell = 8;   // empty until the first maze is generated
  /** @type {Result | null} */
  let lastResult = null;                     // last completed solve
  let token = 0;                             // cancels in-flight animations
  let algo = "astar";

  /* ---------- sizing ---------- */
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.parentElement?.clientWidth || 600;
    cell = Math.max(4, Math.floor((cw * dpr) / W));
    canvas.width = cell * W;
    canvas.height = cell * H;
  };

  /* ---------- maze generation (recursive backtracker) ---------- */
  const generate = () => {
    walls = new Uint8Array(W * H).fill(1);
    /** @type {number[]} */
    const carveOrder = [];
    /** @param {number} x  @param {number} y */
    const carve = (x, y) => { walls[idx(x, y)] = 0; carveOrder.push(idx(x, y)); };
    /** @type {[number, number][]} */
    const stack = [[1, 1]];
    carve(1, 1);
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const options = [[2, 0], [-2, 0], [0, 2], [0, -2]]
        .map(([dx, dy]) => [x + dx, y + dy, x + dx / 2, y + dy / 2])
        .filter(([nx, ny]) => nx > 0 && nx < W && ny > 0 && ny < H && walls[idx(nx, ny)]);
      if (!options.length) { stack.pop(); continue; }
      const [nx, ny, wx, wy] = options[(Math.random() * options.length) | 0];
      carve(wx, wy); carve(nx, ny);
      stack.push([nx, ny]);
    }
    /* braid: knock through some dead ends so routes can compete and the
       shortest path is genuinely contested */
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const open = dirs.filter(([dx, dy]) => !walls[idx(x + dx, y + dy)]);
      if (open.length !== 1 || Math.random() > 0.35) continue;
      const sealed = dirs.filter(([dx, dy]) =>
        walls[idx(x + dx, y + dy)] && x + 2 * dx > 0 && x + 2 * dx < W && y + 2 * dy > 0 && y + 2 * dy < H);
      if (sealed.length) {
        const [dx, dy] = sealed[(Math.random() * sealed.length) | 0];
        carve(x + dx, y + dy);
      }
    }
    return carveOrder;
  };

  /* ---------- search algorithms ---------- */
  /** @param {number} x  @param {number} y  @param {(nx: number, ny: number) => void} fn */
  const neighbours = (x, y, fn) => {
    if (x > 0 && !walls[idx(x - 1, y)]) fn(x - 1, y);
    if (x < W - 1 && !walls[idx(x + 1, y)]) fn(x + 1, y);
    if (y > 0 && !walls[idx(x, y - 1)]) fn(x, y - 1);
    if (y < H - 1 && !walls[idx(x, y + 1)]) fn(x, y + 1);
  };

  /** @param {string} which  @returns {Result} */
  const solve = which => {
    const parent = new Int32Array(W * H).fill(-1);
    const seen = new Uint8Array(W * H);
    /** @type {number[]} */
    const order = [];
    let frontierPeak = 0;
    const s = idx(START.x, START.y), g = idx(GOAL.x, GOAL.y);

    if (which === "astar") {
      const dist = new Float64Array(W * H).fill(Infinity);
      /** @param {number} i */
      const h = i => Math.abs((i % W) - GOAL.x) + Math.abs(((i / W) | 0) - GOAL.y);
      /** @type {[number, number][]} */
      const open = [[h(s), s]];             // [f, idx] binary heap
      /** @param {number} i  @param {number} j */
      const swap = (i, j) => { const t = open[i]; open[i] = open[j]; open[j] = t; };
      /** @param {[number, number]} item */
      const pushHeap = item => { open.push(item); let i = open.length - 1; while (i && open[(i - 1) >> 1][0] > open[i][0]) { swap((i - 1) >> 1, i); i = (i - 1) >> 1; } };
      const popHeap = () => { const top = open[0], last = /** @type {[number, number]} */ (open.pop()); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; swap(i, m); i = m; } } return top; };
      dist[s] = 0;
      while (open.length) {
        frontierPeak = Math.max(frontierPeak, open.length);
        const [, cur] = popHeap();
        if (seen[cur]) continue;
        seen[cur] = 1;
        order.push(cur);
        if (cur === g) break;
        neighbours(cur % W, (cur / W) | 0, (nx, ny) => {
          const n = idx(nx, ny), nd = dist[cur] + 1;
          if (nd < dist[n]) { dist[n] = nd; parent[n] = cur; pushHeap([nd + h(n), n]); }
        });
      }
    } else {
      /** @type {number[]} */
      const frontier = [s];
      seen[s] = 1;
      while (frontier.length) {
        frontierPeak = Math.max(frontierPeak, frontier.length);
        const cur = /** @type {number} */ (which === "bfs" ? frontier.shift() : frontier.pop());
        order.push(cur);
        if (cur === g) break;
        neighbours(cur % W, (cur / W) | 0, (nx, ny) => {
          const n = idx(nx, ny);
          if (!seen[n]) { seen[n] = 1; parent[n] = cur; frontier.push(n); }
        });
      }
    }

    /** @type {number[]} */
    const path = [];
    for (let cur = g; cur !== -1; cur = parent[cur]) { path.push(cur); if (cur === s) break; }
    path.reverse();
    return { order, path: path[0] === s ? path : [], frontierPeak };
  };

  /* ---------- drawing ---------- */
  /** @param {number} i  @param {string} color  @param {number} [inset] */
  const rect = (i, color, inset = 0) => {
    ctx.fillStyle = color;
    ctx.fillRect((i % W) * cell + inset, ((i / W) | 0) * cell + inset, cell - 2 * inset, cell - 2 * inset);
  };

  const drawBase = () => {
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COL.wall;
    for (let i = 0; i < W * H; i++)
      if (walls[i]) ctx.fillRect((i % W) * cell, ((i / W) | 0) * cell, cell, cell);
    drawMarks();
  };

  const drawMarks = () => {
    rect(idx(START.x, START.y), COL.mark, cell * 0.18);
    rect(idx(GOAL.x, GOAL.y), COL.mark, cell * 0.18);
  };

  /** @param {number[]} pts */
  const drawPathSegment = pts => {
    ctx.strokeStyle = COL.path;
    ctx.lineWidth = Math.max(2, cell * 0.4);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach((i, k) => {
      const x = (i % W) * cell + cell / 2, y = ((i / W) | 0) * cell + cell / 2;
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  /* ---------- orchestration ---------- */
  /** @param {number | null} v  @param {number | null} p  @param {number | null} f */
  const setStats = (v, p, f) => {
    statVisited.textContent = v == null ? "–" : v.toLocaleString("en-GB");
    statPath.textContent = p == null ? "–" : p ? `${p} cells` : "searching…";
    statFrontier.textContent = f == null ? "–" : String(f);
  };

  const runSolve = () => {
    const my = ++token;
    const result = solve(algo);
    lastResult = result;
    drawBase();

    if (reduced) {
      result.order.forEach(i => { if (i !== idx(START.x, START.y)) rect(i, COL.visited); });
      drawMarks();
      drawPathSegment(result.path);
      setStats(result.order.length, result.path.length, result.frontierPeak);
      return;
    }

    setStats(0, 0, result.frontierPeak);
    const batch = Math.max(2, Math.ceil(result.order.length / 85));
    let i = 0;
    const stepVisit = () => {
      if (my !== token) return;
      for (let k = 0; k < batch && i < result.order.length; k++, i++) rect(result.order[i], COL.visited);
      drawMarks();
      setStats(i, 0, result.frontierPeak);
      if (i < result.order.length) requestAnimationFrame(stepVisit);
      else {
        let j = 2;
        const stepPath = () => {
          if (my !== token) return;
          drawPathSegment(result.path.slice(0, j));
          j += Math.max(2, Math.ceil(result.path.length / 40));
          if (j - 2 < result.path.length) requestAnimationFrame(stepPath);
          else {
            drawPathSegment(result.path);
            drawMarks();
            setStats(result.order.length, result.path.length, result.frontierPeak);
          }
        };
        requestAnimationFrame(stepPath);
      }
    };
    requestAnimationFrame(stepVisit);
  };

  const newMaze = (thenSolve = true) => {
    const my = ++token;
    size();
    const carveOrder = generate();
    setStats(null, null, null);
    if (reduced) { drawBase(); if (thenSolve) runSolve(); return; }
    ctx.fillStyle = COL.wall;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let i = 0;
    const batch = Math.ceil(carveOrder.length / 40);
    const step = () => {
      if (my !== token) return;
      ctx.fillStyle = COL.bg;
      for (let k = 0; k < batch && i < carveOrder.length; k++, i++)
        ctx.fillRect((carveOrder[i] % W) * cell, ((carveOrder[i] / W) | 0) * cell, cell, cell);
      if (i < carveOrder.length) requestAnimationFrame(step);
      else { drawMarks(); if (thenSolve) runSolve(); }
    };
    requestAnimationFrame(step);
  };

  /* ---------- controls ---------- */
  const algoBtns = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".maze-algos [data-algo]"));
  algoBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      algoBtns.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      algo = btn.dataset.algo || "astar";
      if (walls.length) runSolve();
    });
  });
  /** @type {HTMLElement} */ (document.getElementById("maze-new")).addEventListener("click", () => newMaze(true));
  /** @type {HTMLElement} */ (document.getElementById("maze-solve")).addEventListener("click", () => { if (walls.length) runSolve(); });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!walls.length) return;
      token++;
      size();
      drawBase();
      if (lastResult) {
        lastResult.order.forEach(i => rect(i, COL.visited));
        drawMarks();
        drawPathSegment(lastResult.path);
      }
    }, 150);
  });

  /* start when scrolled into view; fall back to a timer if the
     observer never reports (some in-app webviews) */
  let started = false;
  const begin = () => { if (!started) { started = true; newMaze(true); } };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); begin(); }
    }, { threshold: 0.25 });
    io.observe(canvas);
    setTimeout(() => {
      if (!started) {
        io.disconnect();
        const check = () => {
          const r = canvas.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) { begin(); return true; }
          return false;
        };
        if (!check()) window.addEventListener("scroll", function onScroll() {
          if (check()) window.removeEventListener("scroll", onScroll);
        }, { passive: true });
      }
    }, 2500);
  } else {
    begin();
  }
})();
