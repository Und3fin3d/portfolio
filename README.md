# williamgreenfield — portfolio

A portfolio that proves instead of claims: the projects on the CV run live in the page. This is the notebook design, kept on the `blueprint` branch; the solar-system design lives on `solar`.

- **Fig. 1** — the MNIST classifier from `nn MNIST/` running its *original trained weights* (784→20→10→10, ReLU + softmax), forward pass re-implemented in vanilla JS. Weights exported to `assets/nn-weights.json` as base64 float32 (96.5% on a 5,000-image sample). Drawing input is preprocessed MNIST-style: bounding-box crop, scale to 20 px, centre-of-mass shift.
- **Fig. 2** — the COMP2321 *Chess Fragments* engine ported piece for piece: 25-bit magic bitboards, Zobrist-hashed transposition table, killer/history ordering, null-move pruning, LMR, check extensions, delta-pruned quiescence. Piece values and square tables verbatim from the Python original. ~350 ms per move, typically depth 10–11.
- **Fig. 3** — maze generation (recursive backtracker, lightly braided) with BFS / DFS / A* animated on the same grid graph.

No frameworks, no build step, no analytics. Hand-written HTML/CSS/JS.

## Run locally

Any static server, e.g.:

```sh
npx serve .
```

(A server is needed because the weights load via `fetch`.)

## Deploy to GitHub Pages

```sh
git add -A && git commit -m "Portfolio"
gh repo create Und3fin3d/portfolio --public --source . --push
gh api repos/Und3fin3d/portfolio/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

Previewable at `https://williamgreenfield.com/design2/` (the copy carried on the `solar` branch).

## Updating

- New CV: overwrite `assets/WilliamGreenfield_CV.pdf`.
- Retrained network: re-run the export against `nn MNIST/saved_network/` (see `arch` note inside `assets/nn-weights.json`).
