// The veil the app opens under (app/veil.css, components/Veil.tsx). A page calls veilReady() when
// what it shows first is in place: the veil lifts. Calling it twice, or with no veil down, is fine.

export function veilReady(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root.classList.contains("is-arriving") || root.classList.contains("is-ready")) return;
  // Two frames, so the page under the veil has been painted once before the light comes up.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.add("is-ready");
    window.setTimeout(() => root.classList.remove("is-arriving", "is-ready"), 1400);
  }));
}

/** Lower the veil and go: for a link that leaves the app for the landing page. */
export function leaveTo(href: string): void {
  const root = document.documentElement;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { window.location.href = href; return; }
  root.classList.remove("is-arriving", "is-ready");
  root.classList.add("is-leaving");
  window.setTimeout(() => { window.location.href = href; }, 540);
}
