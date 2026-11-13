"use client";

import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/amiri/400.css";
import "./globals.css";
import "./ui.css";
import "./errors.css";
import { useEffect } from "react";
import { LooseLeaves } from "@/components/ErrorArt";
import ErrorPage from "@/components/ErrorPage";
import { tokensCss } from "@/lib/tokens";

// The last resort: the frame of the app itself failed, so this replaces the root layout and brings
// its own <html>, tokens and fonts. The binding broke and the leaves fell out of order; both
// satellites are in Earth's shadow.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <head>
        <title>Zij could not open</title>
        <style dangerouslySetInnerHTML={{ __html: tokensCss() }} />
      </head>
      <body>
        <ErrorPage
          variant="loose"
          code="Error · Both satellites in eclipse"
          title="The book came apart"
          art={<LooseLeaves />}
          log={[
            { label: "MODIS", value: "In Earth's shadow: no signal", bad: true },
            { label: "VIIRS", value: "In Earth's shadow: no signal", bad: true },
            { label: "Reference", value: error.digest ? <code>{error.digest}</code> : "None given" },
          ]}
          actions={
            <>
              <button type="button" className="err-btn is-primary" onClick={reset}>Open it again</button>
              <a className="err-btn" href="/">The first page</a>
            </>
          }
        >
          <p>Zij could not open at all: the frame of the page failed before anything was drawn.</p>
          <p className="note">
            Like a satellite passing through Earth&apos;s shadow, it should be back in a moment. The record and its numbers
            are not affected.
          </p>
        </ErrorPage>
      </body>
    </html>
  );
}
