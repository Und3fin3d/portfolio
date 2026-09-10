/* Teal is the default; URL overrides allow previews without saving a preference. */
(() => {
  const root = document.documentElement;
  const requested = new URLSearchParams(location.search).get('theme');
  const name = ['classic', 'teal', 'plum', 'midnight'].includes(requested) ? requested : 'teal';
  root.dataset.demoTheme = name;
  if (requested === 'teal') {
    const url = new URL(location.href);
    url.searchParams.delete('theme');
    history.replaceState(history.state, '', url);
  }
  const colours = new Map();
  window.DemoTheme = {
    name,
    colour(role) {
      if (!colours.has(role)) colours.set(role, getComputedStyle(root).getPropertyValue(`--demo-${role}`).trim());
      return colours.get(role);
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.demo-sequence a').forEach(link => {
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname.includes('/animations/')) {
        if (name === 'teal') url.searchParams.delete('theme');
        else url.searchParams.set('theme', name);
        link.href = url.href;
      }
    });
  });
})();
