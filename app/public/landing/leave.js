// Leaving the landing page for the app (the map, Roro's Fire Diary, the reading pages): the lamp
// goes out here and comes up there, instead of a cut. A veil of the night ground with the Seal on it
// fades in over this page; the app's first frame is the same veil (app/veil.css), which lifts once
// the page under it is ready. The destination is fetched ahead, as soon as a link is pointed at, so
// the dark is short. With reduced motion, or a new tab, the link is an ordinary link.
(() => {
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]still\b/.test(location.search);
  const APP = /^\/(explore|diary|downloads|how-it-works|brief)(\/|$)/;
  const FLAG = 'zij.veil';
  const OUT = 620;   // the veil's fade, with additions.css

  const target = (a) => {
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return null;
    let url;
    try { url = new URL(a.href, location.href); } catch { return null; }
    return url.origin === location.origin && APP.test(url.pathname) ? url : null;
  };

  const veil = document.createElement('div');
  veil.className = 'veil';
  veil.setAttribute('aria-hidden', 'true');
  veil.innerHTML = '<img src="/landing/logo/zij-seal-small-night.svg" alt="" width="306" height="255"><i></i>';
  document.body.appendChild(veil);

  // Fetch the page ahead: once per address, when a link to it is first pointed at or focused.
  const warmed = new Set();
  const warm = (url) => {
    if (warmed.has(url.href)) return;
    warmed.add(url.href);
    const link = document.createElement('link');
    link.rel = 'prefetch'; link.href = url.href; link.as = 'document';
    document.head.appendChild(link);
  };
  for (const kind of ['pointerenter', 'focusin', 'touchstart']) {
    document.addEventListener(kind, (e) => { const url = target(e.target.closest && e.target.closest('a[href]')); if (url) warm(url); }, { capture: true, passive: true });
  }

  let leaving = false;
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = target(e.target.closest && e.target.closest('a[href]'));
    if (!url) return;
    if (still) return;   // an ordinary link
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    try { sessionStorage.setItem(FLAG, '1'); } catch { /* the app then opens without its veil */ }
    warm(url);
    root.classList.add('is-leaving');
    setTimeout(() => { location.href = url.href; }, OUT);
  });

  // Back to this page from the browser's history: it is shown as it was left, so lift the veil.
  addEventListener('pageshow', () => {
    leaving = false;
    root.classList.remove('is-leaving');
    try { sessionStorage.removeItem(FLAG); } catch { /* nothing was kept */ }
  });
})();
