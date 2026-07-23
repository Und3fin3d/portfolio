# DESIGN.md — engineer's notebook system

## Theme

Light, always. Scene: a recruiter in a bright London office at 11am, skimming 40 intern portfolios in Chrome tabs; 39 of them are dark neon. This one is a crisp sheet of graph paper.

## Color (strategy: Committed — ink blue carries the page)

- `--paper`:      oklch(96.5% 0.009 85)   warm paper ground
- `--paper-high`: oklch(98.2% 0.006 85)   raised paper (inputs, boards)
- `--ink`:        oklch(24% 0.025 262)    body text, near-black blue ink
- `--blue`:       oklch(37% 0.115 258)    committed ink blue: display type, section numerals, footer drench
- `--red`:        oklch(52% 0.19 27)      red pen: annotations, live results, hovers. Small doses only.
- `--muted`:      oklch(46% 0.025 262)    captions, metadata
- `--grid-line`:  blue at ~8% alpha       graph-paper grid, one CSS gradient

Never #000/#fff. Footer is drenched solid `--blue` with paper-colored text.

## Typography

- Display: **Archivo** (variable, width axis to 125, weights 600–900). Tight tracking on large sizes.
- Body: **STIX Two Text** (the mathematical typesetting family). 400/500/700 + italic. Max 70ch.
- Labels/code/data: **Spline Sans Mono** 400/500.
- Scale: fluid clamp, ratio ≥1.3. H1 clamp(3.2rem → 7rem).

## Layout

- Graph paper background sitewide (24px minor grid). Content on a 12-col fluid grid, left-aligned, asymmetric: main column + notebook margin column (marginalia in mono).
- Sections numbered like a paper ("01", "02"...). Interactive demos are figures with STIX italic captions: "Fig. 1 — ...".
- No cards. Ledger rows (full hairline separators) for experience; a real table for module marks.

## Motion

- `--ease: cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo family). 500–700ms reveals, translateY(20px) + fade, 70ms stagger.
- Canvas animations for demos (maze search frontier, NN activations). Respect prefers-reduced-motion: reveal instantly, keep demos manual.

## Components

- Red-pen annotation: small rotated mono note + hand-drawn SVG stroke (circle/arrow), stroke-dasharray draw-in on reveal.
- Stamp: rotated red double-border round stamp for the CTF win.
- Buttons: paper-high, 1px ink border, mono uppercase, red fill on hover.
- Chess board: paper-high light squares, blue-tint dark squares; last move tinted, legal moves dotted.
