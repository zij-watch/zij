import { Suspense, type ReactNode } from "react";
import Nav from "@/components/Nav";

// The pages people read: the top bar, the no-script line and the credits. /studio has none of these.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<header className="nav"><a href="/" className="wordmark">Zij</a><nav aria-label="Pages"><a href="/">Explore</a><a href="/downloads">Downloads</a><a href="/how-it-works">How it works</a></nav></header>}>
        <Nav />
      </Suspense>
      <noscript>
        <p className="noscript">
          The map, the calendar and the downloads need JavaScript. Without it, <a href="/how-it-works">How it works</a> shows the
          method and all the numbers.
        </p>
      </noscript>
      {children}
      <footer className="credits">
        Fire data: NASA FIRMS (MODIS and VIIRS active fires). Imagery: NASA GIBS. Map: made with Natural Earth.
        Zij is not affiliated with or endorsed by NASA.
      </footer>
    </>
  );
}
