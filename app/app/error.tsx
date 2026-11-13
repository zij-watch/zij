"use client";

import { useEffect } from "react";
import { InkBook } from "@/components/ErrorArt";
import ErrorPage from "@/components/ErrorPage";

const TITLE = "The ink ran over this page · Zij";

// 500: something failed while a page was being written. The ink ran over it; the satellite's
// downlink broke. "Try again" renders the page once more, as the next pass would.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    document.title = TITLE;
  }, [error]);
  return (
    <ErrorPage
      variant="ink"
      code="500 · Downlink lost"
      title="The ink ran over this page"
      art={<InkBook />}
      plate="Folios 499 and 500, under the ink"
      log={[
        { label: "Downlink", value: "Lost while the page was written", bad: true },
        { label: "Satellite", value: "Safe mode: ready for the next pass" },
        { label: "Reference", value: error.digest ? <code>{error.digest}</code> : "None given" },
      ]}
      actions={
        <>
          <button type="button" className="err-btn is-primary" onClick={reset}>Try again</button>
          <a className="err-btn" href="/explore">Open the map</a>
          <a className="err-btn" href="/">The first page</a>
        </>
      }
    >
      <p>Something failed while this page was being written, and it could not be shown.</p>
      <p className="note">
        The record is safe: the data behind every area is unchanged. Try again; if the ink runs again, quote the
        reference below when you tell us.
      </p>
    </ErrorPage>
  );
}
