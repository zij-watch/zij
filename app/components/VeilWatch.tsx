"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { leaveTo, veilReady } from "@/lib/veil";

// The pages that say for themselves when they are ready: the map (when its style is in) and the game.
const OWN = new Set(["/explore", "/diary"]);

export default function VeilWatch() {
  const pathname = usePathname();
  useEffect(() => {
    if (!OWN.has(pathname)) { veilReady(); return; }
    // Never left in the dark: the map may be slow, or may not come at all.
    const t = window.setTimeout(veilReady, pathname === "/explore" ? 2600 : 1500);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    // A plain link to the landing page (another document): the lamp goes out first.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.getAttribute("href") !== "/") return;
      e.preventDefault();
      leaveTo("/");
    };
    // Back from the browser's history: the page is shown as it was left, so the veil must be up.
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) document.documentElement.classList.remove("is-leaving", "is-arriving", "is-ready"); };
    document.addEventListener("click", onClick);
    window.addEventListener("pageshow", onShow);
    return () => { document.removeEventListener("click", onClick); window.removeEventListener("pageshow", onShow); };
  }, []);
  return null;
}
