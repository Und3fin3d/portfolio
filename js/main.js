/* Reveal-on-scroll with document-order stagger.
   Falls back to manual scroll checks if IntersectionObserver is missing
   or never reports (some in-app webviews). */
// @ts-check
(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targets = new Set(/** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".reveal")));

  /** @param {HTMLElement} el  @param {number} [delay] */
  const show = (el, delay = 0) => {
    if (!targets.has(el)) return;
    targets.delete(el);
    el.style.transitionDelay = `${delay}ms`;
    el.classList.add("is-visible");
    el.addEventListener("transitionend", () => (el.style.transitionDelay = ""), { once: true });
  };

  /* The hero is the initial screen, so it must not depend on each individual
     child crossing the observer threshold. In a short viewport the lower
     actions and facts can begin below the fold. */
  document.querySelectorAll(".chapter--hero .reveal").forEach((el, i) => {
    show(/** @type {HTMLElement} */ (el), Math.min(i * 90, 450));
  });

  if (reduced || !("IntersectionObserver" in window)) {
    targets.forEach(el => show(el));
    return;
  }

  let ioAlive = false;
  const io = new IntersectionObserver(entries => {
    ioAlive = true;
    const incoming = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    incoming.forEach((entry, i) => {
      io.unobserve(entry.target);
      show(/** @type {HTMLElement} */ (entry.target), Math.min(i * 90, 450));
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

  targets.forEach(el => io.observe(el));

  /* safety valve: if IO never fires, reveal manually as the user scrolls */
  const manualCheck = () => {
    const vh = window.innerHeight;
    [...targets]
      .filter(el => { const r = el.getBoundingClientRect(); return r.top < vh * 0.94 && r.bottom > 0; })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .forEach((el, i) => show(el, Math.min(i * 90, 450)));
  };
  setTimeout(() => {
    if (ioAlive) return;
    io.disconnect();
    manualCheck();
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { manualCheck(); ticking = false; });
    }, { passive: true });
  }, 2000);
})();

/* The home-page chapter menu uses native <details> so it still works without
   JavaScript. These listeners only close it after a choice or Escape. */
(() => {
  const sections = /** @type {HTMLDetailsElement | null} */ (document.querySelector(".site-head__sections"));
  if (!sections) return;
  const compactHeader = window.matchMedia("(max-width: 900px)");
  sections.open = !compactHeader.matches;
  compactHeader.addEventListener("change", event => { sections.open = !event.matches; });

  sections.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    if (compactHeader.matches) sections.open = false;
  }));

  document.addEventListener("keydown", event => {
    if (!compactHeader.matches || event.key !== "Escape" || !sections.open) return;
    sections.open = false;
    /** @type {HTMLElement | null} */ (sections.querySelector("summary"))?.focus();
  });

  document.addEventListener("pointerdown", event => {
    if (compactHeader.matches && sections.open && event.target instanceof Node && !sections.contains(event.target)) sections.open = false;
  });
})();

(() => {
  const controls = /** @type {HTMLDetailsElement | null} */ (document.querySelector(".orrery__disclosure"));
  if (!controls) return;
  const compactHud = window.matchMedia("(max-width: 780px)");
  controls.open = !compactHud.matches;
  compactHud.addEventListener("change", event => { controls.open = !event.matches; });
})();
