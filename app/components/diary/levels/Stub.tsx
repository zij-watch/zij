"use client";

// A stand-in for a chapter still being built: Next ends it. Removed once every chapter exists.

import { useGame } from "../engine/context";

export default function Stub() {
  const g = useGame();
  return (
    <div className="lv">
      <button type="button" className="catchword" onClick={() => g.finish()}>{g.L["ui.next"]}</button>
    </div>
  );
}
