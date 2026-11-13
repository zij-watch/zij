import { Suspense, type ReactNode } from "react";
import Nav from "@/components/Nav";
import { Seal } from "@/components/Shell";

// The pages people read: the top strip, the no-script line and the credits. /studio has none of these.
// Explore draws its own strip (with the live readout) and hides the credits line: its credit is on the map.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<header className="strip paper"><a href="/" className="brand"><Seal /></a><nav aria-label="Pages"><a href="/">Explore</a><a href="/downloads">Downloads</a><a href="/how-it-works">How it works</a></nav></header>}>
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
