# portfolio

A portfolio that proves instead of claims: the site is one live solar system, and the projects on the CV run in the page.

- **The system** (`js/solar.js`) — every section lives on a planet. Positions are computed from JPL Keplerian elements (Kepler's equation solved by Newton's method each frame, inclinations included); the camera is a hand-rolled dolly (apparent size = size × focal length ÷ distance) driven by scroll. Close views use high-resolution texture-mapped spheres, while mission photographs remain for the other bodies, all over ESO's Milky Way.
- **Mercury** — the MNIST classifier from `nn MNIST/` running its *original trained weights* (784→20→10→10, ReLU + softmax), forward pass re-implemented in vanilla JS; input preprocessed MNIST-style (crop, scale to 20 px, centre-of-mass shift).
- **Venus** — the COMP2321 *Chess Fragments* engine ported piece for piece: 25-bit magic bitboards, Zobrist-hashed transposition table, killer/history ordering, null-move pruning, LMR, check extensions, delta-pruned quiescence. Piece values and square tables verbatim from the Python original.
- **Earth** — maze generation (recursive backtracker, lightly braided) with BFS / DFS / A* animated on the same grid graph.

No frameworks, no build step, no analytics. Hand-written HTML/CSS/JS, type-checked with `tsc` in strict mode via JSDoc annotations.

## Run locally

Any static server, e.g.:

```sh
npx serve .
```

(A server is needed because weights and sprites load via `fetch`.)

## Type check

```sh
npx tsc --project jsconfig.json
```

Zero-emit: `tsc` is used purely as a checker; the JS in `js/` is the code that ships.

## Deploy to GitHub Pages

```sh
gh api repos/Und3fin3d/portfolio/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

Site appears at `https://und3fin3d.github.io/portfolio/`. For the cleaner `https://und3fin3d.github.io/`, name the repo `Und3fin3d.github.io` instead.

## Updating

- New CV: overwrite `assets/WilliamGreenfield_CV.pdf`.
- Retrained network: re-run the export against `nn MNIST/saved_network/` (see `arch` note inside `assets/nn-weights.json`).
- Imagery credits: NASA / ESA / ESO / [Solar System Scope](https://www.solarsystemscope.com/textures) (Milky Way panorama: ESO/S. Brunier, CC BY 4.0; Mars: ESA/Rosetta, CC BY-SA 3.0 IGO; close-view texture maps: Solar System Scope, CC BY 4.0; remaining NASA imagery public domain).
