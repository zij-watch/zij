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
      plate="Folio 404, cut from the book close to the binding"
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
