/* Fig. 2 — "Chess Fragments" (COMP2321 coursework) ported to JavaScript.
   5×5 variant: back rank N-Q-K-B-Right, where the Right moves as rook+knight.
   Pawns have double-push from their start, en passant, and promote to queen.

   Faithful port of the Python agent: 25-bit bitboard move generation,
   Zobrist-hashed transposition table, MVV-LVA + killer + history move
   ordering, null-move pruning, check extensions, delta-pruned quiescence,
   iterative deepening. Piece values and piece-square tables are copied
   verbatim from the original engine. */
// @ts-check
(() => {
  const boardEl = document.getElementById("chess-board");
  if (!boardEl) return;

  /** @typedef {{ f: number, t: number, type: number }} Move */
  /** @typedef {{ capType: number, capSq: number, oldEp: number, promo: boolean, wasUnmoved: boolean, capUnmoved: boolean, oldHash: number }} Undo */
  /** @typedef {{ m: Move, u: Undo, color: number }} Played */

  /* ---------- bitboard constants (ported) ---------- */
  const MASK = (1 << 25) - 1;
  const FILE_A = 0b0000100001000010000100001;
  const FILE_E = FILE_A << 4;
  const F_AB = FILE_A | (FILE_A << 1);
  const F_DE = FILE_E | (FILE_E >> 1);

  const NE_MASKS = [17043520, 532608, 16640, 512, 0, 8521728, 17043456, 532480, 16384, 0, 4259840, 8519680, 17039360, 524288, 0, 2097152, 4194304, 8388608, 16777216, 0, 0, 0, 0, 0, 0];
  const NW_MASKS = [0, 32, 1088, 34944, 1118464, 0, 1024, 34816, 1118208, 2236416, 0, 32768, 1114112, 2228224, 4456448, 0, 1048576, 2097152, 4194304, 8388608, 0, 0, 0, 0, 0];
  const SE_MASKS = [0, 0, 0, 0, 0, 2, 4, 8, 16, 0, 68, 136, 272, 512, 0, 2184, 4368, 8704, 16384, 0, 69904, 139776, 278528, 524288, 0];
  const SW_MASKS = [0, 0, 0, 0, 0, 0, 1, 2, 4, 8, 0, 32, 65, 130, 260, 0, 1024, 2080, 4161, 8322, 0, 32768, 66560, 133152, 266305];

  const WHITE = 0, BLACK = 1;
  const P = 0, N = 1, B = 2, R = 3, Q = 4, K = 5, RIGHT = 6;
  const NUM_TYPES = 7;
  /* piece values from the original evaluate_fast */
  const EVAL_VALUES = [230, 270, 480, 400, 695, 0, 1310];
  const MATE = 100000;

  /* piece-square tables, copied verbatim (sq = y*5+x, y=0 is Black's home rank) */
  const PST_PAWN = [
    [50, 50, 45, 50, 45, 25, 30, 40, 25, -15, 10, 10, 15, 10, 20, -20, 5, 15, 15, 10, -5, 5, 35, 10, 0],   // white
    [0, 10, 35, 5, -5, 10, 15, 15, 5, -20, 20, 10, 15, 10, 10, -15, 25, 40, 30, 25, 45, 50, 45, 50, 50],   // black
  ];
  const PST_KNIGHT = [-20, -10, -5, -10, -20, -10, 5, 15, 5, -10, -5, 15, 25, 15, -5, -10, 5, 15, 5, -10, -20, -10, -5, -10, -20];
  const PST_BISHOP = [-10, -5, 0, -5, -10, -5, 10, 5, 10, -5, 0, 5, 15, 5, 0, -5, 10, 5, 10, -5, -10, -5, 0, -5, -10];
  const PST_QUEEN = [-5, 0, 0, 0, -5, 0, 5, 5, 5, 0, 0, 5, 10, 5, 0, 0, 5, 5, 5, 0, -5, 0, 0, 0, -5];
  const PST_RIGHT = [-5, 0, 5, 0, -5, 0, 10, 10, 10, 0, 5, 10, 15, 10, 5, 0, 10, 10, 10, 0, -5, 0, 5, 0, -5];
  const PST = [
    [PST_PAWN[0], PST_PAWN[1]],
    [PST_KNIGHT, PST_KNIGHT],
    [PST_BISHOP, PST_BISHOP],
    [PST_QUEEN, PST_QUEEN],   // (rook slot unused in this variant; queen tables reused)
    [PST_QUEEN, PST_QUEEN],
    [null, null],             // king handled separately (skipped, as in evaluate_fast)
    [PST_RIGHT, PST_RIGHT],
  ];
  // index PST by our type ints: P,N,B,R,Q,K,RIGHT
  const PST_BY_TYPE = [PST[0], PST[1], PST[2], [PST_QUEEN, PST_QUEEN], PST[3], PST[5], PST[6]];

  /** @param {number} x */
  const bitlen = x => 32 - Math.clz32(x);
  /** @param {number} x */
  const popcnt = x => { let c = 0; while (x) { x &= x - 1; c++; } return c; };

  /* ---------- attack tables ---------- */
  /** @type {number[]} */ const KNIGHT_ATT = new Array(25);
  /** @type {number[]} */ const KING_ATT = new Array(25);
  /** @type {number[]} */ const PAWN_ATT_W = new Array(25);
  /** @type {number[]} */ const PAWN_ATT_B = new Array(25);
  for (let sq = 0; sq < 25; sq++) {
    const bb = 1 << sq;
    let m = (bb << 3) & ~F_DE;
    m |= (bb << 7) & ~F_AB;
    m |= (bb << 9) & ~FILE_E;
    m |= (bb << 11) & ~FILE_A;
    m |= (bb >> 3) & ~F_AB;
    m |= (bb >> 7) & ~F_DE;
    m |= (bb >> 9) & ~FILE_A;
    m |= (bb >> 11) & ~FILE_E;
    KNIGHT_ATT[sq] = m & MASK;
    const na = bb & ~FILE_A, ne = bb & ~FILE_E;
    KING_ATT[sq] = ((ne >> 4) | (bb >> 5) | (na >> 6) | (na << 4) | (bb << 5) | (ne << 6) | (na >> 1) | (ne << 1)) & MASK;
    PAWN_ATT_W[sq] = (((bb & ~FILE_E) >> 4) | ((bb & ~FILE_A) >> 6)) & MASK;
    PAWN_ATT_B[sq] = (((bb & ~FILE_A) << 4) | ((bb & ~FILE_E) << 6)) & MASK;
  }

  /* ---------- sliding rays (ported blocker logic) ---------- */
  /** @param {number} mask  @param {number} occ */
  const rayHigh = (mask, occ) => {       // blocker is the highest set bit
    const blockers = occ & mask;
    if (blockers) {
      const blocked = 1 << (bitlen(blockers) - 1);
      return (mask & ~((blocked << 1) - 1)) | blocked;
    }
    return mask;
  };
  /** @param {number} mask  @param {number} occ */
  const rayLow = (mask, occ) => {        // blocker is the lowest set bit
    const blockers = occ & mask;
    if (blockers) {
      const blocked = blockers & -blockers;
      return (mask & (blocked - 1)) | blocked;
    }
    return mask;
  };
  /** @param {number} sq  @param {number} occ */
  const orthAttacks = (sq, occ) => {
    const fileMask = FILE_A << (sq % 5);
    const rankMask = 0b11111 << (((sq / 5) | 0) * 5);
    const north = fileMask & ((1 << sq) - 1);
    const south = fileMask & ~((1 << (sq + 1)) - 1) & MASK;
    const west = rankMask & ((1 << sq) - 1);
    const east = rankMask & ~((1 << (sq + 1)) - 1) & MASK;
    return rayHigh(north, occ) | rayLow(south, occ) | rayHigh(west, occ) | rayLow(east, occ);
  };
  /** @param {number} sq  @param {number} occ */
  const diagAttacks = (sq, occ) =>
    rayHigh(SE_MASKS[sq], occ) | rayHigh(SW_MASKS[sq], occ) | rayLow(NE_MASKS[sq], occ) | rayLow(NW_MASKS[sq], occ);

  /* ---------- Zobrist hashing (32-bit) ---------- */
  let rngSeed = 42;
  const rng = () => {
    rngSeed |= 0; rngSeed = (rngSeed + 0x6D2B79F5) | 0;
    let t = Math.imul(rngSeed ^ (rngSeed >>> 15), 1 | rngSeed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
  /** @type {number[][][]} */ const Z_PIECE = [];
  /** @type {number[][]} */ const Z_UNMOVED = [[], []];
  /** @type {number[]} */ const Z_EP = [];
  for (let p = 0; p < NUM_TYPES; p++) {
    Z_PIECE.push([[], []]);
    for (let sq = 0; sq < 25; sq++) { Z_PIECE[p][0][sq] = rng(); Z_PIECE[p][1][sq] = rng(); }
  }
  for (let sq = 0; sq < 25; sq++) { Z_UNMOVED[0][sq] = rng(); Z_UNMOVED[1][sq] = rng(); Z_EP[sq] = rng(); }
  const Z_SIDE = rng();

  /* ---------- position ---------- */
  // bb[type][color], occ[color], unmoved[color] (pawns), ep bit, hash, turn
  /** @type {number[][]} */ let bb = [];
  /** @type {number[]} */ let occ = [0, 0];
  /** @type {number[]} */ let unmoved = [0, 0];
  let ep = 0, hash = 0, turn = WHITE;
  /** @type {Played[]} */ let history = [];

  const startPos = () => {
    bb = Array.from({ length: NUM_TYPES }, () => [0, 0]);
    occ = [0, 0]; unmoved = [0, 0]; ep = 0; hash = 0; turn = WHITE; history = [];
    // sample0: y=0 (top, black): N Q K B Right / y=4 (bottom, white): Right B K Q N
    /** @param {number} type  @param {number} color  @param {number} sq */
    const place = (type, color, sq) => {
      bb[type][color] |= 1 << sq;
      occ[color] |= 1 << sq;
      hash ^= Z_PIECE[type][color][sq];
    };
    [N, Q, K, B, RIGHT].forEach((t, x) => place(t, BLACK, x));
    [RIGHT, B, K, Q, N].forEach((t, x) => place(t, WHITE, 20 + x));
    for (let x = 0; x < 5; x++) { place(P, BLACK, 5 + x); place(P, WHITE, 15 + x); }
    unmoved[WHITE] = bb[P][WHITE]; unmoved[BLACK] = bb[P][BLACK];
    for (let sq = 15; sq < 20; sq++) hash ^= Z_UNMOVED[WHITE][sq];
    for (let sq = 5; sq < 10; sq++) hash ^= Z_UNMOVED[BLACK][sq];
  };

  /** @param {number} sq  @param {number} color */
  const typeAt = (sq, color) => {
    const bit = 1 << sq;
    for (let t = 0; t < NUM_TYPES; t++) if (bb[t][color] & bit) return t;
    return -1;
  };

  /* ---------- move generation ---------- */
  // white moves toward y=0 (index decreasing), as in the original.
  /** @param {number} type  @param {number} sq  @param {number} color */
  const pieceTargets = (type, sq, color) => {
    const friend = occ[color], all = occ[0] | occ[1];
    switch (type) {
      case N: return KNIGHT_ATT[sq] & ~friend;
      case K: return KING_ATT[sq] & ~friend;
      case B: return diagAttacks(sq, all) & ~friend & MASK;
      case Q: return (diagAttacks(sq, all) | orthAttacks(sq, all)) & ~friend & MASK;
      case RIGHT: return (orthAttacks(sq, all) | KNIGHT_ATT[sq]) & ~friend & MASK;
      case P: {
        const bit = 1 << sq, empty = ~all & MASK;
        let m;
        if (color === WHITE) {
          const single = (bit >> 5) & empty;
          const dbl = (unmoved[WHITE] & bit) ? ((single >> 5) & empty) : 0;
          m = single | dbl | (PAWN_ATT_W[sq] & (occ[BLACK] | ep));
        } else {
          const single = (bit << 5) & empty & MASK;
          const dbl = (unmoved[BLACK] & bit) ? ((single << 5) & empty & MASK) : 0;
          m = single | dbl | (PAWN_ATT_B[sq] & (occ[WHITE] | ep));
        }
        return m;
      }
    }
    return 0;
  };

  /** @param {number} color  @param {boolean} capturesOnly */
  const genMoves = (color, capturesOnly) => {
    /** @type {Move[]} */
    const moves = [];
    const enemyOcc = occ[color ^ 1];
    for (let t = 0; t < NUM_TYPES; t++) {
      let pieces = bb[t][color];
      while (pieces) {
        const lsb = pieces & -pieces;
        const from = bitlen(lsb) - 1;
        let targets = pieceTargets(t, from, color);
        if (capturesOnly) targets &= t === P ? (enemyOcc | ep) : enemyOcc;
        while (targets) {
          const tb = targets & -targets;
          moves.push({ f: from, t: bitlen(tb) - 1, type: t });
          targets ^= tb;
        }
        pieces ^= lsb;
      }
    }
    return moves;
  };

  /** @param {number} sq  @param {number} byColor */
  const attacked = (sq, byColor) => {
    if (byColor === WHITE ? (PAWN_ATT_B[sq] & bb[P][WHITE]) : (PAWN_ATT_W[sq] & bb[P][BLACK])) return true;
    if (KNIGHT_ATT[sq] & (bb[N][byColor] | bb[RIGHT][byColor])) return true;
    if (KING_ATT[sq] & bb[K][byColor]) return true;
    const all = occ[0] | occ[1];
    if (diagAttacks(sq, all) & (bb[B][byColor] | bb[Q][byColor])) return true;
    if (orthAttacks(sq, all) & (bb[Q][byColor] | bb[RIGHT][byColor])) return true;
    return false;
  };
  /** @param {number} color */
  const inCheck = color => {
    const kbb = bb[K][color];
    return kbb ? attacked(bitlen(kbb) - 1, color ^ 1) : false;
  };

  /* ---------- make / unmake ---------- */
  /** @param {Move} m  @param {number} color  @returns {Undo} */
  const make = (m, color) => {
    const enemy = color ^ 1;
    const fromBit = 1 << m.f, toBit = 1 << m.t;
    const u = { capType: -1, capSq: -1, oldEp: ep, promo: false, wasUnmoved: false, capUnmoved: false, oldHash: hash };

    hash ^= Z_PIECE[m.type][color][m.f];

    if (occ[enemy] & toBit) {
      u.capSq = m.t;
      u.capType = typeAt(m.t, enemy);
      bb[u.capType][enemy] &= ~toBit;
      occ[enemy] &= ~toBit;
      hash ^= Z_PIECE[u.capType][enemy][m.t];
      if (u.capType === P && (unmoved[enemy] & toBit)) {
        unmoved[enemy] &= ~toBit;
        hash ^= Z_UNMOVED[enemy][m.t];
        u.capUnmoved = true;
      }
    } else if (m.type === P && toBit === ep) {
      u.capSq = color === WHITE ? m.t + 5 : m.t - 5;
      u.capType = P;
      const capBit = 1 << u.capSq;
      bb[P][enemy] &= ~capBit;
      occ[enemy] &= ~capBit;
      hash ^= Z_PIECE[P][enemy][u.capSq];
    }

    bb[m.type][color] = (bb[m.type][color] & ~fromBit) | toBit;
    occ[color] = (occ[color] & ~fromBit) | toBit;
    hash ^= Z_PIECE[m.type][color][m.t];

    if (m.type === P && ((color === WHITE && m.t <= 4) || (color === BLACK && m.t >= 20))) {
      u.promo = true;
      bb[P][color] &= ~toBit;
      bb[Q][color] |= toBit;
      hash ^= Z_PIECE[P][color][m.t] ^ Z_PIECE[Q][color][m.t];
    }

    if (ep) hash ^= Z_EP[bitlen(ep) - 1];
    ep = 0;
    if (m.type === P && Math.abs(m.f - m.t) === 10) {
      ep = 1 << ((m.f + m.t) >> 1);
      hash ^= Z_EP[(m.f + m.t) >> 1];
    }
    if (m.type === P && (unmoved[color] & fromBit)) {
      u.wasUnmoved = true;
      unmoved[color] &= ~fromBit;
      hash ^= Z_UNMOVED[color][m.f];
    }
    hash ^= Z_SIDE;
    return u;
  };

  /** @param {Move} m  @param {number} color  @param {Undo} u */
  const unmake = (m, color, u) => {
    const enemy = color ^ 1;
    const fromBit = 1 << m.f, toBit = 1 << m.t;
    hash = u.oldHash;
    if (u.promo) bb[Q][color] &= ~toBit; else bb[m.type][color] &= ~toBit;
    bb[m.type][color] |= fromBit;
    occ[color] = (occ[color] & ~toBit) | fromBit;
    if (u.capType >= 0) {
      const capBit = 1 << u.capSq;
      bb[u.capType][enemy] |= capBit;
      occ[enemy] |= capBit;
      if (u.capUnmoved) unmoved[enemy] |= capBit;
    }
    ep = u.oldEp;
    if (u.wasUnmoved) unmoved[color] |= fromBit;
  };

  /** @param {number} color */
  const legalMoves = color => genMoves(color, false).filter(m => {
    const u = make(m, color);
    const ok = !inCheck(color);
    unmake(m, color, u);
    return ok;
  });

  /* ---------- evaluation (ported evaluate_fast) ---------- */
  /** @param {number} color */
  const evaluate = color => {
    let score = 0;
    for (let t = 0; t < NUM_TYPES; t++) {
      if (t === K) continue;
      const value = EVAL_VALUES[t];
      let f = bb[t][color], e = bb[t][color ^ 1];
      const pstF = /** @type {number[]} */ (PST_BY_TYPE[t][color]), pstE = /** @type {number[]} */ (PST_BY_TYPE[t][color ^ 1]);
      while (f) { const sq = bitlen(f & -f) - 1; score += value + pstF[sq]; f &= f - 1; }
      while (e) { const sq = bitlen(e & -e) - 1; score -= value + pstE[sq]; e &= e - 1; }
    }
    return score;
  };

  /* ---------- search (ported: TT, killers, history, null move, LMR, qsearch) ---------- */
  const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;
  /** @typedef {{ depth: number, score: number, flag: number, move: Move | null }} TTEntry */
  /** @type {Map<number, TTEntry>} */
  let tt = new Map();
  /** @type {(Move | null)[][]} */ let killers = [];
  /** @type {Int32Array[]} */ let historyTable = [];
  let nodes = 0, deadline = 0, aborted = false;

  const MVV_VICTIM = [85, 385, 465, 0, 545, 10000, 750];
  const MVV_ATTACKER = [85, 385, 465, 0, 545, 800, 750];
  const DELTA_MARGIN = 700;

  const resetTables = () => {
    killers = Array.from({ length: 32 }, () => [null, null]);
    historyTable = Array.from({ length: 25 }, () => new Int32Array(25));
    if (tt.size > 300000) tt = new Map();
  };

  /** @param {Move} m  @param {number} color */
  const mvvLva = (m, color) => {
    const enemy = color ^ 1, toBit = 1 << m.t;
    let victim = -1;
    if (occ[enemy] & toBit) victim = typeAt(m.t, enemy);
    else if (m.type === P && toBit === ep) victim = P;
    if (victim < 0) return 0;
    return MVV_VICTIM[victim] * 10 - MVV_ATTACKER[m.type];
  };

  const checkTime = () => { if (!(nodes & 1023) && performance.now() > deadline) aborted = true; };

  /** @param {number} alpha  @param {number} beta  @param {number} color  @param {number} ply  @returns {number} */
  const qsearch = (alpha, beta, color, ply) => {
    nodes++; checkTime();
    if (aborted) return alpha;
    const stand = evaluate(color);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply >= 4) return stand;

    const caps = genMoves(color, true)
      .map(m => ({ m, s: mvvLva(m, color) }))
      .sort((a, b) => b.s - a.s);
    let checked = 0;
    for (const { m, s } of caps) {
      if (checked >= 6) break;
      if (stand + DELTA_MARGIN < alpha) break;
      if (s < 0) continue;
      const u = make(m, color);
      if (inCheck(color)) { unmake(m, color, u); continue; }
      checked++;
      const score = -qsearch(-beta, -alpha, color ^ 1, ply + 1);
      unmake(m, color, u);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  /** @param {number} depth  @param {number} alpha  @param {number} beta  @param {number} color  @param {number} ply  @param {Move[]} pv  @returns {number} */
  const negamax = (depth, alpha, beta, color, ply, pv) => {
    nodes++; checkTime();
    if (aborted) return alpha;

    const ttKey = hash ^ (color === BLACK ? Z_SIDE : 0);
    const entry = tt.get(ttKey);
    /** @type {Move | null} */
    let hashMove = null;
    if (entry) {
      hashMove = entry.move;
      if (entry.depth >= depth && ply > 0) {
        if (entry.flag === TT_EXACT) return entry.score;
        if (entry.flag === TT_LOWER) alpha = Math.max(alpha, entry.score);
        else if (entry.flag === TT_UPPER) beta = Math.min(beta, entry.score);
        if (alpha >= beta) return entry.score;
      }
    }

    const checked = inCheck(color);
    if (checked && depth <= 3) depth += 1;           // check extension
    if (depth <= 0) { pv.length = 0; return qsearch(alpha, beta, color, 0); }

    /* null-move pruning */
    if (depth >= 4 && !checked && ply > 0) {
      const R = depth >= 6 ? 3 : 2;
      const oldEp = ep, oldHash = hash;
      ep = 0; hash ^= Z_SIDE;
      const nullScore = -negamax(depth - 1 - R, -beta, -beta + 1, color ^ 1, ply + 1, []);
      ep = oldEp; hash = oldHash;
      if (!aborted && nullScore >= beta) return beta;
    }

    const moves = genMoves(color, false);
    const enemyOcc = occ[color ^ 1];
    const k1 = killers[Math.min(ply, 31)][0], k2 = killers[Math.min(ply, 31)][1];
    const scored = moves.map(m => {
      let s;
      if (hashMove && m.f === hashMove.f && m.t === hashMove.t) s = 200000;
      else if ((enemyOcc & (1 << m.t)) || (m.type === P && (1 << m.t) === ep)) s = 100000 + mvvLva(m, color);
      else if (k1 && m.f === k1.f && m.t === k1.t) s = 90000;
      else if (k2 && m.f === k2.f && m.t === k2.t) s = 80000;
      else s = historyTable[m.f][m.t];
      return { m, s };
    }).sort((a, b) => b.s - a.s);

    let best = -Infinity, legal = 0;
    /** @type {Move | null} */
    let bestMove = null;
    const origAlpha = alpha;
    /** @type {Move[]} */
    const childPv = [];
    for (const { m, s } of scored) {
      const isQuiet = s < 100000;
      const u = make(m, color);
      if (inCheck(color)) { unmake(m, color, u); continue; }
      legal++;

      /* late move reduction */
      let reduction = 0;
      if (legal > 3 && depth >= 3 && isQuiet && !checked) {
        reduction = legal > 6 ? 2 : 1;
        if (historyTable[m.f][m.t] > 1000) reduction = Math.max(0, reduction - 1);
      }

      let score;
      if (legal === 1) {
        score = -negamax(depth - 1, -beta, -alpha, color ^ 1, ply + 1, childPv);
      } else {
        score = -negamax(depth - 1 - reduction, -alpha - 1, -alpha, color ^ 1, ply + 1, childPv);
        if (score > alpha && (reduction > 0 || score < beta)) {
          score = -negamax(depth - 1, -beta, -alpha, color ^ 1, ply + 1, childPv);
        }
      }
      unmake(m, color, u);
      if (aborted) return alpha;

      if (score > best) { best = score; bestMove = m; }
      if (score > alpha) {
        alpha = score;
        pv.length = 0;
        pv.push(m, ...childPv);
      }
      if (alpha >= beta) {
        if (isQuiet) {
          const kl = killers[Math.min(ply, 31)];
          if (!kl[0] || kl[0].f !== m.f || kl[0].t !== m.t) { kl[1] = kl[0]; kl[0] = m; }
          historyTable[m.f][m.t] += depth * depth;
        }
        break;
      }
    }

    if (!legal) { pv.length = 0; return checked ? -MATE + ply : 0; }

    let flag = TT_EXACT;
    if (best <= origAlpha) flag = TT_UPPER;
    else if (best >= beta) flag = TT_LOWER;
    tt.set(ttKey, { depth, score: best, flag, move: bestMove });
    return best;
  };

  /** @param {number} color  @param {number} ms */
  const search = (color, ms) => {
    nodes = 0; aborted = false;
    deadline = performance.now() + ms;
    resetTables();
    const t0 = performance.now();
    let bestScore = 0, depthDone = 0;
    /** @type {Move | null} */
    let best = null;
    /** @type {Move[]} */
    let bestPv = [];
    for (let depth = 1; depth <= 20 && !aborted; depth++) {
      /** @type {Move[]} */
      const pv = [];
      const score = negamax(depth, -Infinity, Infinity, color, 0, pv);
      if (!aborted && pv.length) {
        best = pv[0]; bestScore = score; bestPv = [...pv]; depthDone = depth;
        if (Math.abs(score) > MATE - 100) break;
      }
    }
    return { move: best, score: bestScore, depth: depthDone, nodes, ms: performance.now() - t0, pv: bestPv };
  };

  /* ---------- UI ---------- */
  const statusEl = /** @type {HTMLElement} */ (document.getElementById("chess-status"));
  const readout = {
    depth: /** @type {HTMLElement} */ (document.getElementById("ce-depth")),
    nodes: /** @type {HTMLElement} */ (document.getElementById("ce-nodes")),
    time: /** @type {HTMLElement} */ (document.getElementById("ce-time")),
    eval: /** @type {HTMLElement} */ (document.getElementById("ce-eval")),
    line: /** @type {HTMLElement} */ (document.getElementById("ce-line")),
  };

  const GLYPHS = [
    ["♙", "♟"], ["♘", "♞"], ["♗", "♝"], ["♖", "♜"], ["♕", "♛"], ["♔", "♚"], ["♖", "♜"],
  ];
  const NAMES = ["pawn", "knight", "bishop", "rook", "queen", "king", "right"];
  /** @param {number} sq */
  const coord = sq => "abcde"[sq % 5] + (5 - ((sq / 5) | 0));
  /** @param {Move} m  @param {boolean} wasCapture */
  const moveStr = (m, wasCapture) => coord(m.f) + (wasCapture ? "×" : "–") + coord(m.t);

  /** @type {HTMLButtonElement[]} */
  const squares = [];
  for (let sq = 0; sq < 25; sq++) {
    const btn = document.createElement("button");
    btn.type = "button";
    const y = (sq / 5) | 0, x = sq % 5;
    if ((x + y) % 2 === 1) btn.classList.add("sq-dark");
    btn.dataset.sq = String(sq);
    boardEl.appendChild(btn);
    squares[sq] = btn;
  }

  let selected = -1, thinking = false, gameOver = false;
  /** @type {Move[]} */ let targets = [];
  /** @type {Move | null} */ let lastMove = null;

  const render = () => {
    for (let sq = 0; sq < 25; sq++) {
      const btn = squares[sq];
      let color = -1, type = -1;
      if (occ[WHITE] & (1 << sq)) { color = WHITE; type = typeAt(sq, WHITE); }
      else if (occ[BLACK] & (1 << sq)) { color = BLACK; type = typeAt(sq, BLACK); }
      if (type >= 0) {
        btn.innerHTML = GLYPHS[type][color] + "︎" + (type === RIGHT ? '<i class="right-mark">†</i>' : "");
        btn.setAttribute("aria-label", `${coord(sq)}: ${color === WHITE ? "white" : "black"} ${NAMES[type]}`);
      } else {
        btn.textContent = "";
        btn.setAttribute("aria-label", `${coord(sq)}, empty`);
      }
      btn.classList.toggle("sq-selected", sq === selected);
      btn.classList.toggle("sq-last", !!lastMove && (sq === lastMove.f || sq === lastMove.t));
      const tgt = targets.find(m => m.t === sq);
      const occupied = (occ[0] | occ[1]) & (1 << sq);
      btn.classList.toggle("sq-move", !!tgt && !occupied);
      btn.classList.toggle("sq-capture", !!tgt && !!occupied);
    }
  };

  /** @param {string} txt */
  const setStatus = txt => { statusEl.textContent = txt; };

  /** @param {number} color */
  const endCheck = color => {
    if (legalMoves(color).length === 0) {
      gameOver = true;
      if (inCheck(color)) setStatus(color === WHITE ? "Checkmate. The engine wins." : "Checkmate! You beat the engine.");
      else setStatus("Stalemate. Draw.");
      return true;
    }
    if (popcnt(occ[0] | occ[1]) === 2) { gameOver = true; setStatus("Draw: bare kings."); return true; }
    return false;
  };

  const engineMove = () => {
    thinking = true;
    setStatus("Engine is thinking…");
    setTimeout(() => {
      const res = search(BLACK, 350);
      if (res.move) {
        const wasCapture = !!(occ[WHITE] & (1 << res.move.t)) || (res.move.type === P && (1 << res.move.t) === ep);
        const u = make(res.move, BLACK);
        history.push({ m: res.move, u, color: BLACK });
        lastMove = res.move;
        turn = WHITE;
        const whiteEval = -res.score / 100;
        readout.depth.textContent = String(res.depth);
        readout.nodes.textContent = res.nodes.toLocaleString("en-GB");
        readout.time.textContent = `${(res.ms / 1000).toFixed(2)} s`;
        readout.eval.textContent = Math.abs(res.score) > MATE - 100
          ? `mate in ${Math.ceil((MATE - Math.abs(res.score)) / 2)}`
          : `${whiteEval >= 0 ? "+" : ""}${whiteEval.toFixed(2)}`;
        readout.line.textContent = res.pv.slice(0, 4).map(m => moveStr(m, false)).join(" ") || moveStr(res.move, wasCapture);
        render();
        if (!endCheck(WHITE)) setStatus(inCheck(WHITE) ? "Check. Your move." : "Your move.");
      }
      thinking = false;
      render();
    }, 30);
  };

  boardEl.addEventListener("click", e => {
    const btn = /** @type {HTMLElement} */ (e.target).closest("button");
    if (!btn || thinking || gameOver || turn !== WHITE) return;
    const sq = Number(btn.dataset.sq);
    const chosen = targets.find(m => m.t === sq);
    if (chosen) {
      const u = make(chosen, WHITE);
      history.push({ m: chosen, u, color: WHITE });
      lastMove = chosen;
      selected = -1; targets = [];
      turn = BLACK;
      render();
      if (!endCheck(BLACK)) engineMove();
      return;
    }
    if (occ[WHITE] & (1 << sq)) {
      selected = sq;
      targets = legalMoves(WHITE).filter(m => m.f === sq);
    } else {
      selected = -1; targets = [];
    }
    render();
  });

  /** @type {HTMLElement} */ (document.getElementById("chess-new")).addEventListener("click", () => {
    startPos();
    selected = -1; targets = []; lastMove = null; gameOver = false; thinking = false;
    tt = new Map();
    Object.values(readout).forEach(el => (el.textContent = "–"));
    setStatus("Your move.");
    render();
  });

  /** @type {HTMLElement} */ (document.getElementById("chess-undo")).addEventListener("click", () => {
    if (thinking || history.length === 0) return;
    let h = /** @type {Played} */ (history.pop());
    unmake(h.m, h.color, h.u);
    if (history.length && h.color === BLACK) {
      h = /** @type {Played} */ (history.pop());
      unmake(h.m, h.color, h.u);
    }
    turn = WHITE; gameOver = false;
    selected = -1; targets = [];
    lastMove = history.length ? history[history.length - 1].m : null;
    setStatus("Your move.");
    render();
  });

  startPos();
  render();
})();
