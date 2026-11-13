"use client";

import { useEffect } from "react";
import { CloudMap } from "@/components/ErrorArt";
import ErrorPage from "@/components/ErrorPage";

const TITLE = "The map is under cloud · Zij";

// Explore failed to draw: the map is under cloud. Explore draws its own strip, so the site layout
// shows none here: this page brings its own. The one way on is home.
export default function ExploreError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
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
      plate="The Nile Delta, under cloud"
    >
      <p>The map or its data could not be drawn this time.</p>
      <p className="note">
        When cloud covers a field, the satellites cannot see its fires; here something kept the map from loading.
      </p>
    </ErrorPage>
  );
}
