# PRODUCT.md — William Greenfield, portfolio

register: brand

## Product purpose

A personal portfolio site whose single job is to convert a skim into an interview. It exists to prove, not claim: William's story is that he builds things from first principles (a neural net in raw NumPy, a chess engine on bitboards, maze solvers from graph theory), so the site runs those things live in the page instead of describing them.

## Users

- Recruiters and university-talent screeners at UK tech, finance and security firms, skimming dozens of intern candidates in browser tabs. They give a page 20 seconds.
- Engineers doing the second-round look. They will open dev tools and view source. The code of the site is itself an exhibit.

## Brand voice

Three words: **mathematical, hand-built, competitive.**

The site reads like an engineer's working notebook: graph paper, ink, figures with captions, a marks table like a paper, one red pen for annotations and live results. Warm and precise, never corporate, never "webby". Copy is short, declarative, lightly confident ("Claims are cheap. Everything below runs live.").

## Anti-references

- Dark-neon developer portfolio with gradient hero text and skill-tag clouds.
- Template SaaS landing pages: card grids, icon-heading-blurb triples, testimonial sliders.
- Editorial-magazine affectation (italic display serif, drop caps, ruled three-column broadsheet).
- Anything that reads "generated": the bar is a visitor asking "how was this made?"

## Strategic principles

0. Public identity is first-name only: the site says "Will", never the surname. Full name lives only in the CV download and contact links. Info density stays josh.software-lean: one line where a paragraph would do; detail belongs in the CV, demos carry the persuasion.

1. Proof over prose. Every major claim on the CV is backed by something interactive or verifiable on the page.
2. Implementation quality over dependency dogma. Keep the site fast and view-source friendly, but use focused libraries when they materially improve fidelity or maintainability.
3. One page, long scroll, deliberate pacing. One idea per fold.
4. The neural network demo uses the exact weights from the real project (`nn MNIST/saved_network`), not a re-creation.
