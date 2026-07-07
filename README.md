# williamgreenfield — portfolio

A portfolio that proves instead of claims: the projects on the CV run live in the page.

- **Fig. 1** — the MNIST classifier from `nn MNIST/` running its *original trained weights* (784→20→10→10, ReLU + softmax), forward pass re-implemented in vanilla JS. Weights exported to `assets/nn-weights.json` as base64 float32 (96.5% on a 5,000-image sample). Drawing input is preprocessed MNIST-style: bounding-box crop, scale to 20 px, centre-of-mass shift.
- **Fig. 2** — 5×5 (Gardner) chess engine: iterative-deepening negamax, alpha-beta pruning, quiescence search, MVV-LVA move ordering, ~300 ms per move. Typically reaches depth 8–10, ~500k nodes.
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

Site appears at `https://und3fin3d.github.io/portfolio/`. For the cleaner `https://und3fin3d.github.io/`, name the repo `Und3fin3d.github.io` instead.

## Updating

- New CV: overwrite `assets/WilliamGreenfield_CV.pdf`.
- Retrained network: re-run the export against `nn MNIST/saved_network/` (see `arch` note inside `assets/nn-weights.json`).
