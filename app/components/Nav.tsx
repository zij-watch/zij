"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const PAGES = [
  { href: "/", label: "Explore" },
  { href: "/downloads", label: "Downloads" },
  { href: "/how-it-works", label: "How it works" },
];

/** The top bar. Links carry the query string, so the chosen area and dates follow you between pages. */
export default function Nav() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return (
    <header className="nav">
      <Link href={query ? `/?${query}` : "/"} className="wordmark">Zij</Link>
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
