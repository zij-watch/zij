"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Seal } from "./Shell";

const PAGES = [
  { href: "/", label: "Explore" },
  { href: "/downloads", label: "Downloads" },
  { href: "/how-it-works", label: "How it works" },
];

/**
 * The top strip of the reading pages. Links carry the query string, so the chosen area and dates
 * follow you between pages. Explore has its own strip, with the live readout (components/Explore.tsx).
 */
export default function Nav() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  if (pathname === "/") return null;
  return (
    <header className="strip paper">
      <Link href={query ? `/?${query}` : "/"} className="brand" aria-label="Zij, Explore"><Seal /></Link>
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
