// Hudhud, the hoopoe: an engraved ink drawing of a real bird, not a cartoon. A fan crest tipped in
// ink, barred wings, a long curved bill and a small brass-bound notebook. He shows feeling with his
// body only: the crest rises when pleased, the head tilts for a hint, a short step, a flight.
// Layers are divs around SVGs, so each pose is a transform on a plain element (app/app/diary/diary.css).

import { useId, type CSSProperties } from "react";

export type HudhudPose = { fly?: boolean; crest?: boolean; tilt?: boolean; stone?: boolean; book?: boolean };

// The crest: seven feathers fanned from the crown, each with its angle up (pleased) and down (resting).
const FEATHERS = [
  { len: 17, up: -168, down: -176 },
  { len: 20, up: -150, down: -170 },
  { len: 22, up: -132, down: -164 },
  { len: 22, up: -113, down: -158 },
  { len: 21, up: -95, down: -152 },
  { len: 18, up: -78, down: -146 },
  { len: 14, up: -62, down: -140 },
];
const CROWN = { x: 81, y: 44 };

function Crest() {
  return (
    <svg className="hh-crest" viewBox="0 0 120 120" aria-hidden="true">
      {FEATHERS.map((f, i) => (
        <g key={i} className="hh-feather" style={{ "--up": `${f.up}deg`, "--down": `${f.down}deg` } as CSSProperties}>
          <path className="hh-buff hh-line" d={`M${CROWN.x} ${CROWN.y - 1.6}L${CROWN.x + f.len * 0.7} ${CROWN.y - 2.4}L${CROWN.x + f.len * 0.7} ${CROWN.y + 2.4}L${CROWN.x} ${CROWN.y + 1.6}Z`} />
          <path className="hh-pale hh-line" d={`M${CROWN.x + f.len * 0.7} ${CROWN.y - 2.4}L${CROWN.x + f.len * 0.8} ${CROWN.y - 2.4}L${CROWN.x + f.len * 0.8} ${CROWN.y + 2.4}L${CROWN.x + f.len * 0.7} ${CROWN.y + 2.4}Z`} />
          <path className="hh-ink hh-line" d={`M${CROWN.x + f.len * 0.8} ${CROWN.y - 2.4}L${CROWN.x + f.len} ${CROWN.y}L${CROWN.x + f.len * 0.8} ${CROWN.y + 2.4}Z`} />
        </g>
      ))}
    </svg>
  );
}

function Head() {
  return (
    <svg className="hh-headart" viewBox="0 0 120 120" aria-hidden="true">
      {/* the bill: long, thin and curved down, dark */}
      <path className="hh-ink hh-line" d="M91 50.5C99 52 107 56 116.5 64.5C107.5 58.8 99.5 55.6 90.5 54.6Z" />
      <path className="hh-buff hh-line" d="M72.5 53C72 45 78.5 40.5 85.5 41.6C92 42.7 94.6 48.6 92.4 55C90.4 60.4 82 62.6 76.6 60.4C74.2 59.2 72.8 56.8 72.5 53Z" />
      {/* hatching under the cheek */}
      <path className="hh-hatch" d="M76 57L80 59.6M79 57.4L83.6 60M82.6 57.4L87.4 59.2M86.4 56.4L90 57.6" />
      <circle className="hh-ink" cx={86.4} cy={48.6} r={1.5} />
      <circle className="hh-glint" cx={86.9} cy={48.1} r={0.45} />
    </svg>
  );
}

function Body({ fly, stone, book, uid }: { fly?: boolean; stone?: boolean; book?: boolean; uid: string }) {
  const bars = `hh-bars-${uid}`;
  return (
    <svg className="hh-bodyart" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        {/* the black-and-white barring of the wings and tail, as an engraver cuts it */}
        <pattern id={bars} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
          <rect className="hh-pale" width="7" height="7" />
          <rect className="hh-ink" width="7" height="3.6" />
        </pattern>
      </defs>
      {fly ? (
        <>
          {/* wings raised: the far one behind, the near one in front */}
          <path className="hh-line" fill={`url(#${bars})`} d="M52 62C46 44 38 28 24 16C36 22 52 30 62 44C64 50 62 58 58 64Z" />
          <path className="hh-ink hh-line" d="M30 74L4 82L8 90L34 82Z" />
          <path className="hh-pale" d="M10 82.6L30 77.6L31 80L11 85.4Z" />
          <path className="hh-buff hh-line" d="M30 74C34 62 50 55 68 57C80 58.6 84.6 65.6 82.4 72.6C79.4 80.6 62 84.6 46 83.4C37.6 82.8 30.4 79.6 30 74Z" />
          <path className="hh-hatch" d="M40 80L46 82.6M46 80.6L53 83.4M53 81L60 83.6M60 80.6L67 82.4" />
          <path className="hh-line" fill={`url(#${bars})`} d="M48 66C54 50 66 34 86 22C76 36 72 50 70 62C64 68 56 70 48 66Z" />
          <path className="hh-ink-line" d="M58 82L60 88M64 82L67 88" />
        </>
      ) : (
        <>
          {/* the tail: black with one white band */}
          <path className="hh-ink hh-line" d="M35 73L9 91L13.6 98.6L39.6 81.6Z" />
          <path className="hh-pale" d="M15.6 88.2L33 76.2L35 79L17.6 91.2Z" />
          <path className="hh-buff hh-line" d="M30 75C33.6 61.6 51.6 53.6 69.6 56.6C80.4 58.4 85.4 66 82.6 74.6C79 85 61.4 90.4 45 88.6C36.4 87.6 29.6 82.4 30 75Z" />
          <path className="hh-hatch" d="M40 84L46 87M46 85L53 88M53 85.6L60 88.4M60 85.4L67 87.6M67 84.4L73 86" />
          {/* the folded wing, barred */}
          <path className="hh-line" fill={`url(#${bars})`} d="M38.6 66C48 58.6 63.6 59.6 72.6 66.6C68 76.6 53 82.6 35 80.6C34.6 75 35.6 69.6 38.6 66Z" />
          <path className="hh-ink-line" d="M55 88L53.4 102.4M63.6 87.4L65.6 102.4M49.4 102.6L57.6 102.6M61.6 102.6L70 102.6" />
        </>
      )}
      {book && !fly && (
        <g>
          <rect className="hh-paper hh-line" x={72} y={95} width={18} height={9} />
          <path className="hh-brass-line" d="M72 95.4H90M72 103.6H90M81 95V104" />
        </g>
      )}
      {stone && (
        <g>
          <circle className="hh-lens" cx={104} cy={76} r={9} />
          <circle className="hh-brass-line" cx={104} cy={76} r={9} />
          <path className="hh-brass-line" d="M97.6 82.4L92 88" />
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
