"use client";

import { useEffect } from "react";
import { CloudMap } from "@/components/ErrorArt";
import ErrorPage from "@/components/ErrorPage";

const TITLE = "The map is under cloud · Zij";

// Explore failed to draw: the map is under cloud. Explore draws its own strip, so the site layout
// shows none here: this page brings its own. The area and dates stay in the address, so "Try again"
// brings them back.
export default function ExploreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    document.title = TITLE;
  }, [error]);
  return (
    <ErrorPage
      variant="cloud"
      credits={false}
      code="Error · Cloud over the scene"
      title="The map is under cloud"
      art={<CloudMap />}
      log={[
        { label: "Scene", value: "Covered: the map did not draw", bad: true },
        { label: "Fires", value: "Not seen, which is not the same as absent" },
        { label: "Reference", value: error.digest ? <code>{error.digest}</code> : "None given" },
      ]}
      actions={
        <>
          <button type="button" className="err-btn is-primary" onClick={reset}>Try again</button>
          <a className="err-btn" href="/downloads">Downloads</a>
          <a className="err-btn" href="/how-it-works">How it works</a>
        </>
      }
    >
      <p>The map or its data could not be drawn this time.</p>
      <p className="note">
        When cloud covers a field, the satellites cannot see its fires; here something kept the map from loading. Your
        area and dates are still in the address, so trying again brings them back. The numbers can also be downloaded
        as CSV.
      </p>
    </ErrorPage>
  );
}
