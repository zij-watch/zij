import type { Metadata } from "next";
import ScriptSheet from "@/components/diary/ScriptSheet";
import { readDiaryNumbers } from "@/lib/diary/load";
import "./studio-diary.css";

// Hudhud's Fire Diary, for review: ?script lists every line of the game with its word count.
// The art kit joins it here in stage 2. Not linked from the site.
export const metadata: Metadata = { title: "Zij: studio, Hudhud's Fire Diary", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (!("script" in query)) {
    return (
      <main className="ds" data-theme="folio">
        <header className="ds-head">
          <p className="t-eyebrow">studio · hudhud&rsquo;s fire diary</p>
          <h1>The art kit comes next</h1>
          <p className="ds-lede">The drawings arrive here in stage 2. For now, the words.</p>
          <a className="catchword" href="/studio/diary?script">Read the script</a>
        </header>
      </main>
    );
  }
  return <ScriptSheet numbers={await readDiaryNumbers()} />;
}
