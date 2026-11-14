"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import Icon from "./icons";
import { Seal } from "./Shell";
import { Pop, TooltipProvider } from "./ui";

const PAGES = [
  { href: "/explore", label: "Explore" },
  { href: "/downloads", label: "Downloads" },
];

/**
 * The running head of the reading pages. Links carry the query string, so the chosen area and dates
 * follow you between pages. Help holds the tour and How it works. Explore (/explore) has its own
 * head, with the live readout (components/Explore.tsx).
 */
export default function Nav() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [help, setHelp] = useState(false);
  if (pathname === "/explore") return null;
  const withQuery = (href: string) => (query ? `${href}?${query}` : href);
  return (
    <TooltipProvider>
      <header className="strip">
        {/* A plain link: the landing page is its own document, outside the app. */}
        <a href="/" className="brand" aria-label="Zij, home"><Seal /></a>
        <nav aria-label="Pages">
          {PAGES.map((page) => (
            <Link key={page.href} href={withQuery(page.href)} aria-current={pathname === page.href ? "page" : undefined}>
              {page.label}
            </Link>
          ))}
          <Pop open={help} onOpenChange={setHelp} side="bottom" align="end" label="Help"
            trigger={<button type="button" className={`nav-menu${help ? " is-open" : ""}${pathname === "/how-it-works" ? " is-current" : ""}`} aria-label="Help: the tour, and how it works">Help <Icon name="chevron" size={16} /></button>}>
            <div className="menu">
              <Link className="menu-link" href="/explore?tour=1" onClick={() => setHelp(false)}>Take the tour</Link>
              <Link className="menu-link" href={withQuery("/how-it-works")} aria-current={pathname === "/how-it-works" ? "page" : undefined} onClick={() => setHelp(false)}>How it works</Link>
            </div>
          </Pop>
        </nav>
      </header>
    </TooltipProvider>
  );
}
