import type { Metadata } from "next";
import { CutBook } from "@/components/ErrorArt";
import ErrorPage from "@/components/ErrorPage";
import MissingPath from "@/components/MissingPath";

export const metadata: Metadata = { title: "Not in the record · Zij", robots: { index: false } };

// 404: the leaf was cut from the book. Any address the app does not know lands here.
export default function NotFound() {
  return (
    <ErrorPage
      variant="cut"
      code="404 · Not in the record"
      title="This leaf was cut from the book"
      art={<CutBook />}
      log={[
        { label: "MODIS · Terra, Aqua", value: "No pixel at this address" },
        { label: "VIIRS · NOAA-20, NOAA-21", value: "No pixel at this address" },
        { label: "Status", value: "404: not in the record", bad: true },
      ]}
      actions={
        <>
          <a className="err-btn is-primary" href="/explore">Open the map</a>
          <a className="err-btn" href="/how-it-works">How it works</a>
          <a className="err-btn" href="/">The first page</a>
        </>
      }
    >
      <p>
        Zij has no page at <MissingPath />. The link may be mistyped, or the page has moved.
      </p>
      <p className="note">
        The record itself is whole: every area, every season and every number is where it was. As with a week no
        satellite flew over, this is no data, not an empty page.
      </p>
    </ErrorPage>
  );
}
