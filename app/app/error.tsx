"use client";

import { useEffect } from "react";
import { InkBook } from "@/components/ErrorArt";
import ErrorPage from "@/components/ErrorPage";

const TITLE = "The ink ran over this page · Zij";

// 500: something failed while a page was being written. The ink ran over it; the satellite's
// downlink broke. The one way on is home.
export default function PageError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
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
    >
      <p>Something failed while this page was being written, and it could not be shown.</p>
      <p className="note">The record is safe: the data behind every area is unchanged.</p>
    </ErrorPage>
  );
}
