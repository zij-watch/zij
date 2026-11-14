// MODIS and VIIRS, drawn as brass instruments rather than spacecraft photos. MODIS is the older,
// heavier one: a wide square aperture on a lapis ring. VIIRS is the younger: a fine round aperture
// on a rubric ring. The colour is never the only sign: each carries its name in words.

export type Sat = "modis" | "viirs";

export function Satellite({ kind, name, beam = false, className = "" }: { kind: Sat; name?: string; beam?: boolean; className?: string }) {
  const modis = kind === "modis";
  return (
    <div className={`sat is-${kind} ${className}`}>
      {beam && <div className="sat-beam" aria-hidden="true" />}
      <svg viewBox="-56 -30 112 60" data-theme="folio" aria-hidden="true">
        {/* solar panels, ruled like a page */}
        <rect className="sat-panel" x={modis ? -54 : -54} y={modis ? -9 : -6} width={modis ? 30 : 34} height={modis ? 18 : 12} />
        <rect className="sat-panel" x={modis ? 24 : 20} y={modis ? -9 : -6} width={modis ? 30 : 34} height={modis ? 18 : 12} />
        <path className="sat-rule" d={modis ? "M-44 -9V9M-34 -9V9M34 -9V9M44 -9V9M-54 0H-24M24 0H54" : "M-43 -6V6M-32 -6V6M31 -6V6M42 -6V6"} />
        <path className="sat-line" d={modis ? "M-24 0H-14M14 0H24" : "M-20 0H-9M9 0H20"} />
        {modis ? (
          <>
            {/* the heavy body and its wide square eye */}
            <rect className="sat-brass sat-line" x={-14} y={-16} width={28} height={30} />
            <path className="sat-hatch" d="M-14 6L-6 14M-14 0L0 14M-8 -2L8 14M2 2L14 14" />
            <rect className="sat-eye sat-line" x={-8} y={-10} width={16} height={14} />
            <rect className="sat-pupil" x={-4} y={-6} width={8} height={6} />
            <path className="sat-line" d="M0 14V22M-6 22H6" />
          </>
        ) : (
          <>
            {/* the slim body and its fine round eye */}
            <rect className="sat-brass sat-line" x={-9} y={-13} width={18} height={24} />
            <path className="sat-hatch" d="M-9 5L-3 11M-9 -1L3 11M-4 -2L9 11" />
            <circle className="sat-eye sat-line" cx={0} cy={-3} r={6.2} />
            <circle className="sat-pupil" cx={0} cy={-3} r={2.4} />
            <path className="sat-line" d="M0 11V19M-3 19H3" />
          </>
        )}
      </svg>
      {name && <span className="sat-name">{name}</span>}
    </div>
  );
}

/**
 * An orbit drawn as the brass ring of an astrolabe's rete, in the satellite's colour, with ticks.
 * The ring is flattened by its wrapper (a div), so the satellite can turn along it on the compositor.
 */
export function OrbitRing({ kind, className = "" }: { kind: Sat; className?: string }) {
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2, r0 = i % 3 ? 96 : 92;
    return `M${(100 + Math.cos(a) * r0).toFixed(1)} ${(100 + Math.sin(a) * r0).toFixed(1)}L${(100 + Math.cos(a) * 99).toFixed(1)} ${(100 + Math.sin(a) * 99).toFixed(1)}`;
  }).join("");
  return (
    <svg className={`orbit is-${kind} ${className}`} viewBox="0 0 200 200" aria-hidden="true">
      <circle className="orbit-ring" cx={100} cy={100} r={99} />
      <circle className="orbit-inner" cx={100} cy={100} r={92} />
      <path className="orbit-ticks" d={ticks} />
    </svg>
  );
}
