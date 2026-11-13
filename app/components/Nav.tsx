"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Seal } from "./Shell";

const PAGES = [
  { href: "/explore", label: "Explore" },
  { href: "/downloads", label: "Downloads" },
  { href: "/how-it-works", label: "How it works" },
];

/**
 * The top strip of the reading pages. Links carry the query string, so the chosen area and dates
 * follow you between pages. Explore (/explore) has its own strip, with the live readout (components/Explore.tsx).
 */
export default function Nav() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  if (pathname === "/explore") return null;
  return (
    <header className="strip paper">
      {/* A plain link: the landing page is its own document, outside the app. */}
      <a href="/" className="brand" aria-label="Zij, home"><Seal /></a>
      <nav aria-label="Pages">
        {PAGES.map((page) => (
          <Link key={page.href} href={query ? `${page.href}?${query}` : page.href} aria-current={pathname === page.href ? "page" : undefined}>
            {page.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
