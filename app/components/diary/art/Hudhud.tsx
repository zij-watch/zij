// Roro, the hoopoe: an engraved ink drawing of a real bird, not a cartoon. A fan crest tipped in
// ink, a cinnamon head and breast, wings and tail barred black and white, a long curved bill. He
// stands on the fire diary, bound in brass. He shows feeling with his body only: the crest rises
// when pleased, the head tilts for a hint, a short step, a flight.
// Layers are divs around SVGs, so each pose is a transform on a plain element (app/app/diary/diary.css).

import { useId, type CSSProperties } from "react";

export type HudhudPose = { fly?: boolean; crest?: boolean; tilt?: boolean; stone?: boolean; book?: boolean };

// The crest: nine feathers fanned from the crown, each with its angle up (pleased) and down (resting,
// laid back behind the head like the bill's own shadow).
const FEATHERS = [
  { len: 19, up: -172, down: -179 },
  { len: 22, up: -158, down: -177 },
  { len: 25, up: -143, down: -175 },
  { len: 27, up: -128, down: -173 },
  { len: 28, up: -113, down: -171 },
  { len: 27, up: -98, down: -169 },
  { len: 25, up: -84, down: -167 },
  { len: 21, up: -71, down: -165 },
  { len: 16, up: -59, down: -163 },
];
const CROWN = { x: 80, y: 41 };

function Crest() {
  const { x, y } = CROWN;
  return (
    <svg className="hh-crest" viewBox="0 0 120 120" aria-hidden="true">
      {FEATHERS.map((f, i) => {
        const a = x + f.len * 0.62, b = x + f.len * 0.76, tip = x + f.len;
        return (
          <g key={i} className="hh-feather" style={{ "--up": `${f.up}deg`, "--down": `${f.down}deg` } as CSSProperties}>
            {/* the shaft widens to a rounded blade: buff, a pale band, then the ink tip */}
            <path className="hh-buff hh-line" d={`M${x} ${y - 0.9}C${x + f.len * 0.3} ${y - 1.4} ${a - 3} ${y - 2.9} ${a} ${y - 2.9}L${a} ${y + 2.9}C${a - 3} ${y + 2.9} ${x + f.len * 0.3} ${y + 1.4} ${x} ${y + 0.9}Z`} />
            <path className="hh-pale hh-line" d={`M${a} ${y - 2.9}L${b} ${y - 2.9}L${b} ${y + 2.9}L${a} ${y + 2.9}Z`} />
            <path className="hh-ink hh-line" d={`M${b} ${y - 2.9}C${tip - 1} ${y - 2.9} ${tip + 0.6} ${y - 1.4} ${tip + 0.6} ${y}C${tip + 0.6} ${y + 1.4} ${tip - 1} ${y + 2.9} ${b} ${y + 2.9}Z`} />
          </g>
        );
      })}
    </svg>
  );
}

function Head() {
  return (
    <svg className="hh-headart" viewBox="0 0 120 120" aria-hidden="true">
      {/* the bill: long, slender and curved down, dark, paler at its root */}
      <path className="hh-ink hh-line" d="M92.4 45C101 46 110 51 117.6 60.6C109 54.6 100.6 51.6 92.2 50.6Z" />
      <path className="hh-bill-root" d="M92.6 45.6C95.6 46 98.4 46.8 101 48L100.2 50.4C97.6 50 95 49.6 92.4 49.6Z" />
      {/* the head: small and round, running into the neck */}
      <path className="hh-buff hh-line" d="M71.6 51C70.6 42.6 76.4 36 84 36C90.2 36 94.2 40.6 93.6 47C93 53.4 90.4 58.6 86.6 61.6C80.6 63.4 74 59.6 71.6 51Z" />
      {/* the engraver's shading: under the cheek and down the nape */}
      <path className="hh-hatch" d="M75.6 55.6L80 59.6M78.6 54.8L83.4 59.4M82 54.6L86.6 58.4M85.6 53.6L89 56.4M73.4 47L75.4 50.6M73.6 43.4L76 47" />
      <path className="hh-ink-line is-fine" d="M88.6 48.6C90 49.4 91.4 49.6 92.6 49.4" />
      <circle className="hh-ink" cx={86.6} cy={45.6} r={1.9} />
      <circle className="hh-glint" cx={87.2} cy={45} r={0.6} />
    </svg>
  );
}

/** The fire diary he stands on: a closed book bound in leather, its corners and clasp in brass. */
function Book() {
  return (
    <g className="hh-book">
      <path className="hh-leather hh-line" d="M34 105.4H88V115.4H34Z" />
      <path className="hh-paper" d="M36 107.2H88V113.6H36Z" />
      <path className="hh-hatch" d="M38 108.8H88M38 110.4H88M38 112H88" />
      <path className="hh-leather hh-line" d="M32.6 104H86.6V106.4H32.6ZM32.6 114.4H86.6V116.8H32.6ZM32.6 104H35.6V116.8H32.6Z" />
      <path className="hh-brass hh-line" d="M80.6 104H86.6V106.4H80.6ZM80.6 114.4H86.6V116.8H80.6ZM58 106.4H63V114.4H58Z" />
    </g>
  );
}

function Body({ fly, stone, book, uid }: { fly?: boolean; stone?: boolean; book?: boolean; uid: string }) {
  const wing = `hh-wing-${uid}`, tail = `hh-tail-${uid}`, far = `hh-far-${uid}`, nearw = `hh-near-${uid}`;
  return (
    <svg className="hh-bodyart" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id={wing}><path d="M67 62.6C57 59.6 45 63 37 71C31 77 27.6 83.6 26.6 89.6C37 90.4 51 87 61 80C67 75.4 69.4 68.6 67 62.6Z" /></clipPath>
        <clipPath id={tail}><path d="M37 77L11.6 94.6L16.6 102L41.6 86.4Z" /></clipPath>
        <clipPath id={far}><path d="M54 63C47 45 38 30 23 17C36 22 53 30 64 45C66.6 51 64.6 59 60 65Z" /></clipPath>
        <clipPath id={nearw}><path d="M48 68C54 51 66 35 87 22C77 37 73 51 71 63C65 69.6 56 71.6 48 68Z" /></clipPath>
      </defs>
      {book && !fly && <Book />}
      {fly ? (
        <>
          {/* in flight: the far wing behind, the body stretched out, the near wing in front, feet tucked */}
          <g clipPath={`url(#${far})`}>
            <path className="hh-ink" d="M10 10H80V70H10Z" />
            <path className="hh-bar" d="M26 26L40 18M33 35L49 25M41 45L58 33M49 55L64 43" />
          </g>
          <path className="hh-line hh-none" d="M54 63C47 45 38 30 23 17C36 22 53 30 64 45C66.6 51 64.6 59 60 65Z" />
          <g clipPath={`url(#${tail})`} transform="translate(-4 -3) rotate(-14 37 77)">
            <path className="hh-ink" d="M0 60H50V110H0Z" />
            <path className="hh-bar is-wide" d="M21.6 82.6L30.6 97.4" />
          </g>
          <path className="hh-buff hh-line" d="M30 75C34 63 50 56 68 58C80 59.6 85.6 66 84 73C81 81 63 85.6 47 84.4C38 83.8 30.6 80.6 30 75Z" />
          <path className="hh-belly" d="M40 82.4C50 85.4 64 84.6 74 80C64 82 50 82.6 40 82.4Z" />
          <path className="hh-hatch" d="M42 80.6L48 83.4M48 81.2L55 84M55 81.6L62 84M62 81L69 82.8" />
          <g clipPath={`url(#${nearw})`}>
            <path className="hh-ink" d="M40 10H95V80H40Z" />
            <path className="hh-bar" d="M52 60L68 68M56 50L72 58M62 41L77 48M69 32L82 38" />
          </g>
          <path className="hh-line hh-none" d="M48 68C54 51 66 35 87 22C77 37 73 51 71 63C65 69.6 56 71.6 48 68Z" />
          <path className="hh-ink-line" d="M58 84L61 89M64 83.6L68 88" />
        </>
      ) : (
        <>
          {/* the tail: black, with one white band */}
          <g clipPath={`url(#${tail})`}>
            <path className="hh-ink" d="M0 60H50V110H0Z" />
            <path className="hh-bar is-wide" d="M21.6 82.6L30.6 97.4" />
          </g>
          <path className="hh-line hh-none" d="M37 77L11.6 94.6L16.6 102L41.6 86.4Z" />
          {/* the legs, short and grey, standing on the diary */}
          <path className="hh-ink-line" d="M54.6 90L53.4 103.6M63.4 89.4L65 103.6M48.6 104H58.6M60.6 104H70.6" />
          {/* the body: breast to rump, the neck running up under the head */}
          <path className="hh-buff hh-line" d="M87 60C85.6 72 79 84 71 89C63 93.6 50 94.4 41.6 91C35.6 88 32.4 83 33.6 78C37.6 70 46.6 64.6 56.6 61.6C64 59 69.6 56 72 50L87 55Z" />
          {/* the pale belly, streaked at the flank */}
          <path className="hh-belly" d="M42.6 90.6C51 94 63 93.4 71 89C76 86 80 80.6 83 74C76 82 62 88.6 42.6 90.6Z" />
          <path className="hh-hatch" d="M48 90L53 92.6M54 90.4L59.6 92.6M60.6 90L66 91.6M67.6 88L72 88.8M76 80.4L79.6 79.6M79 75L82.4 73.6M81.6 69L84.6 67.4M83.6 63.4L86 61.6" />
          {/* the folded wing: black, barred white, the shoulder left buff */}
          <g clipPath={`url(#${wing})`}>
            <path className="hh-ink" d="M20 55H75V95H20Z" />
            <path className="hh-bar" d="M55.6 58L64 76M48 60L57.6 80M40.6 63L50.6 84M33.6 68L43.6 88M27.6 75L36 91" />
            <path className="hh-buff" d="M70 58C63 58 58 61 60 66C63 69 68 68 70 64Z" />
          </g>
          <path className="hh-line hh-none" d="M67 62.6C57 59.6 45 63 37 71C31 77 27.6 83.6 26.6 89.6C37 90.4 51 87 61 80C67 75.4 69.4 68.6 67 62.6Z" />
        </>
      )}
      {stone && (
        <g>
          <circle className="hh-lens" cx={104} cy={78} r={9} />
          <circle className="hh-brass-line is-bold" cx={104} cy={78} r={9} />
          <path className="hh-brass-line is-bold" d="M97.6 84.4L90 92" />
          <path className="hh-glint-line" d="M99.6 74.6C101 72.6 103 71.6 105.6 71.6" />
        </g>
      )}
    </svg>
  );
}

export default function Hudhud({ fly, crest, tilt, stone, book = true, className = "", label }: HudhudPose & { className?: string; label?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cls = ["hh", fly && "is-fly", crest && "is-crest-up", tilt && "is-tilt", className].filter(Boolean).join(" ");
  return (
    <div className={cls} data-theme="folio" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div className="hh-body"><Body fly={fly} stone={stone} book={book} uid={uid} /></div>
      <div className="hh-head">
        <div className="hh-crestwrap"><Crest /></div>
        <Head />
      </div>
    </div>
  );
}
