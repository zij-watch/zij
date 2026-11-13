// Drawings that sit on the map, and where they sit.
//
// A drawing is SVG written in code from the palette: ink outline, paper fill, hatch shading on
// the side away from the lamp (upper left). To add your own, append to DRAWINGS (paste the inner
// SVG of a hand-drawn piece and swap its colours for palette values) and give it a PLACEMENT.
//
// Drawings never take the sheet over: each has a zoom range, they rank below every label and
// below the data slots, MapLibre hides any that collide, and close in they shrink back to signs.
import type { AtlasImage } from './images';
import type { Palette } from './palette';
import { mix } from './palette';

export interface Drawing {
  id: string;
  name: string;
  kind: 'sign' | 'landmark';
  note?: string;
  draw: (p: Palette) => AtlasImage;
}

export interface Placement {
  /** Drawing id. */
  icon: string;
  name: string;
  lngLat: [number, number];
  /** Shown from this zoom… */
  minzoom: number;
  /** …up to (not including) this one. */
  maxzoom: number;
  /** Scale at full size (1 = the drawing's own pixel size). */
  size?: number;
  /** Lower wins when two drawings collide. */
  priority?: number;
  /** Which point of the drawing sits on the coordinate. A landmark beside a city stands off to one side of its sign. */
  anchor?: 'bottom' | 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'center' | 'top';
  /** Nudge in the drawing's own pixels, [right, down]. */
  offset?: [number, number];
}

const pen = (p: Palette, w = 1.4) => `fill="none" stroke="${p.ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const body = (p: Palette, fill: string, w = 1.4) => `fill="${fill}" stroke="${p.ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const hatch = (p: Palette, w = 0.8) => `fill="none" stroke="${p.inkMuted}" stroke-width="${w}" stroke-linecap="round" opacity="0.8"`;
const stone = (p: Palette) => mix(p.groundRaised, p.ochre, 0.16);
const waves = (p: Palette, y: number, x0: number, n: number) =>
  `<path d="M${x0} ${y} q3 -2.4 6 0 ${'t6 0 '.repeat(n)}" fill="none" stroke="${p.waterInk}" stroke-width="1" stroke-linecap="round" opacity="0.8"/>`;
/** Crenellations along a wall top from x0 to x1 at height y. */
function merlons(x0: number, x1: number, y: number, step = 4, h = 3): string {
  let d = `M${x0} ${y}`;
  let up = true;
  for (let x = x0; x < x1 - 0.01; x += step) {
    const nx = Math.min(x1, x + step);
    d += up ? ` V${y - h} H${nx} V${y}` : ` H${nx}`;
    up = !up;
  }
  return d;
}

export const DRAWINGS: Drawing[] = [
  {
    id: 'zij-art-dhow',
    name: 'Dhow',
    kind: 'sign',
    note: 'Open water, far out.',
    draw: (p) => ({
      id: 'zij-art-dhow', width: 72, height: 60,
      svg: `
        <path d="M17 30 Q32 30 51 8 Q48 28 37 41 Q26 37 17 30 Z" ${body(p, p.groundRaised)}/>
        <path d="M40 22 L36 38 M44 17 L39 33 M47 13 L43 27" ${hatch(p)}/>
        <path d="M34 45 V9 M15 31 L53 6" ${pen(p, 1.5)}/>
        <path d="M8 40 Q14 52 34 52 Q54 52 64 38 Q50 45 34 45 Q18 45 8 40 Z" ${body(p, mix(p.groundRaised, p.wood, 0.4))}/>
        <path d="M18 47.5 Q34 50 52 46.5" ${hatch(p)}/>
        ${waves(p, 56, 3, 4)}${waves(p, 58.5, 38, 4)}`,
    }),
  },
  {
    id: 'zij-art-palm',
    name: 'Date palm',
    kind: 'sign',
    note: 'Oases.',
    draw: (p) => ({
      id: 'zij-art-palm', width: 42, height: 56,
      svg: `
        <ellipse cx="21" cy="15" rx="17" ry="12" fill="${p.field}" opacity="0.3"/>
        <path d="M20 53 C19 40 23 28 21 17" ${pen(p, 2.2)}/>
        <path d="M17.5 46 h5 M18 40 h5 M19 34 h5 M19.5 28 h4.6 M19.6 22 h4" ${hatch(p)}/>
        <path d="M21 17 C14 9 7 11 3 18 M21 17 C16 5 9 3 4 7 M21 17 C22 5 28 1 35 3 M21 17 C28 9 36 11 39 19 M21 17 C27 15 33 20 35 28 M21 17 C15 15 9 20 7 28" ${pen(p, 1.5)}/>
        <path d="M19 19 l-1.4 2.6 M22.6 19.4 l1.2 2.6" ${pen(p, 2)}/>
        <path d="M9 53.5 H33" ${pen(p, 1.3)}/>`,
    }),
  },
  {
    id: 'zij-art-reeds',
    name: 'Reeds',
    kind: 'sign',
    note: 'Marsh and lagoon.',
    draw: (p) => ({
      id: 'zij-art-reeds', width: 46, height: 36,
      svg: `
        <ellipse cx="23" cy="24" rx="20" ry="9" fill="${p.field}" opacity="0.26"/>
        <path d="M10 30 C10 22 8 16 9 10 M16 30 C16 20 18 12 17 5 M23 30 C23 22 22 16 24 9 M30 30 C30 22 32 14 31 7 M36 30 C36 24 38 18 37 13" ${pen(p, 1.3)}/>
        <path d="M9 12 v-4 M17 8 v-5 M24 11 v-4.5 M31 10 v-5 M37 15 v-4" ${pen(p, 2.6)}/>
        <path d="M12 30 C13 26 15 24 18 23 M26 30 C27 26 28 25 32 23" ${hatch(p, 0.9)}/>
        ${waves(p, 32.5, 3, 5)}`,
    }),
  },
  {
    id: 'zij-art-dunes',
    name: 'Dunes',
    kind: 'sign',
    note: 'Sand seas.',
    draw: (p) => ({
      id: 'zij-art-dunes', width: 66, height: 28,
      svg: `
        <path d="M2 25 C10 12 20 8 29 20 C35 10 45 7 53 17 C57 14 61 18 64 25 Z" fill="${p.ochre}" opacity="0.26"/>
        <path d="M2 25 C10 12 20 8 29 20 C35 10 45 7 53 17 C57 14 61 18 64 25" ${pen(p, 1.3)}/>
        <path d="M17 11 C20 15 21 20 20 25 M42 9.5 C45 13 46 19 45 25" ${pen(p, 0.9)}/>
        <path d="M22 14 l2 8 M25 16.5 l1.4 6 M47 12 l2 9 M50 14.5 l1.6 7" ${hatch(p)}/>`,
    }),
  },
  {
    id: 'zij-art-pine',
    name: 'Stone pine',
    kind: 'sign',
    note: 'Pine country (Pinhal).',
    draw: (p) => ({
      id: 'zij-art-pine', width: 34, height: 44,
      svg: `
        <path d="M17 42 C16.5 34 18 26 17 19" ${pen(p, 2)}/>
        <path d="M17 26 C13 23 11 21 9 20 M17.4 23 C21 21 23 19.6 25 19" ${pen(p, 1.1)}/>
        <path d="M3 17 C2 11 8 9 10 10 C11 4 20 3 22 8 C27 6 32 10 31 15 C32 19 27 21 24 19.5 C20 22 13 22 10 19.5 C7 21 3 20 3 17 Z" ${body(p, mix(p.groundRaised, p.field, 0.45), 1.3)}/>
        <path d="M21 10 C24 11 26 14 25 17 M14 8 C17 9 18 12 17 16" ${hatch(p)}/>
        <path d="M9 42.5 H26" ${pen(p, 1.2)}/>`,
    }),
  },
  {
    id: 'zij-art-pyramids',
    name: 'The pyramids of Giza',
    kind: 'landmark',
    draw: (p) => ({
      id: 'zij-art-pyramids', width: 88, height: 52,
      svg: `
        <path d="M46 46 L64 19 L84 46 Z" ${body(p, stone(p))}/>
        <path d="M64 19 L84 46 L72 46 Z" fill="${p.reliefShade}" opacity="0.28"/>
        <path d="M66 24 L74 46 M69 28 L78 46 M72 32 L81 45" ${hatch(p)}/>
        <path d="M8 46 L35 7 L62 46 Z" ${body(p, stone(p))}/>
        <path d="M35 7 L62 46 L46 46 Z" fill="${p.reliefShade}" opacity="0.3"/>
        <path d="M35 7 L46 46" ${pen(p, 1)}/>
        <path d="M38 13 L50 46 M41 18 L54 46 M45 24 L57 45 M49 30 L59 45" ${hatch(p)}/>
        <path d="M2 46 L12 31 L23 46 Z" ${body(p, stone(p), 1.2)}/>
        <path d="M12 31 L23 46 L17 46 Z" fill="${p.reliefShade}" opacity="0.3"/>
        <path d="M1 46.6 H87" ${pen(p, 1.3)}/>
        <path d="M6 49.5 h10 M24 50 h14 M50 49.5 h9 M68 50 h12" ${hatch(p)}/>`,
    }),
  },
  {
    id: 'zij-art-qaitbay',
    name: 'The citadel of Qaitbay, Alexandria',
    kind: 'landmark',
    draw: (p) => ({
      id: 'zij-art-qaitbay', width: 84, height: 58,
      svg: `
        <path d="M28 44 V16 H56 V44 Z" ${body(p, stone(p))}/>
        <path d="${merlons(28, 56, 16)}" ${body(p, stone(p), 1.2)}/>
        <path d="M24 44 V13 A4 4 0 0 1 32 13 V44 Z M52 44 V13 A4 4 0 0 1 60 13 V44 Z" ${body(p, stone(p))}/>
        <path d="M38 44 V34 A4 4 0 0 1 46 34 V44 Z" fill="${p.ink}" fill-opacity="0.85"/>
        <path d="M36 22 h3 v5 h-3 Z M45 22 h3 v5 h-3 Z" fill="${p.ink}" fill-opacity="0.7"/>
        <path d="M54.5 16 V43 M57 14 V43 M49 30 V43" ${hatch(p)}/>
        <path d="M8 50 V34 H76 V50 Z" ${body(p, stone(p))}/>
        <path d="${merlons(8, 76, 34)}" ${body(p, stone(p), 1.2)}/>
        <path d="M4 50 V31 A5 5 0 0 1 14 31 V50 Z M70 50 V31 A5 5 0 0 1 80 31 V50 Z" ${body(p, stone(p))}/>
        <path d="M62 37 V49 M66 37 V49 M74 33 V49 M77.5 32 V49 M56 39 V49" ${hatch(p)}/>
        <path d="M2 50.6 H82" ${pen(p, 1.3)}/>
        ${waves(p, 54.5, 4, 5)}${waves(p, 56.5, 42, 5)}`,
    }),
  },
  {
    id: 'zij-art-cairo-gate',
    name: 'Bab al-Futuh, Cairo',
    kind: 'landmark',
    note: 'The Fatimid city gate. Cairo is drawn by its walls.',
    draw: (p) => ({
      id: 'zij-art-cairo-gate', width: 76, height: 60,
      svg: `
        <path d="M26 54 V20 H50 V54 Z" ${body(p, stone(p))}/>
        <path d="${merlons(26, 50, 20)}" ${body(p, stone(p), 1.2)}/>
        <path d="M31 54 V40 A7 7 0 0 1 45 40 V54 Z" fill="${p.ink}" fill-opacity="0.85"/>
        <path d="M29.5 40 A8.5 8.5 0 0 1 46.5 40" ${pen(p, 1)}/>
        <path d="M30 27 H46" ${pen(p, 0.9)}/>
        <path d="M6 54 V22 Q6 12 16 12 Q26 12 26 22 V54 Z" ${body(p, stone(p))}/>
        <path d="M50 54 V22 Q50 12 60 12 Q70 12 70 22 V54 Z" ${body(p, stone(p))}/>
        <path d="${merlons(8, 24, 13.5, 4, 3)}" ${body(p, stone(p), 1.1)}/>
        <path d="${merlons(52, 68, 13.5, 4, 3)}" ${body(p, stone(p), 1.1)}/>
        <path d="M6 30 H26 M50 30 H70 M6 42 H26 M50 42 H70" ${pen(p, 0.8)}/>
        <path d="M20 18 V53 M23 20 V53 M64 18 V53 M67 20 V53 M61 32 V41 M17 32 V41" ${hatch(p)}/>
        <path d="M14 34 v5 M58 34 v5" ${pen(p, 1.6)}/>
        <path d="M2 54.6 H74" ${pen(p, 1.3)}/>
        <path d="M8 57.5 h12 M30 58 h16 M54 57.5 h12" ${hatch(p)}/>`,
    }),
  },
  {
    id: 'zij-art-columns',
    name: 'The temples of Thebes (Luxor)',
    kind: 'landmark',
    draw: (p) => {
      let cols = '';
      for (let i = 0; i < 5; i++) {
        const x = 12 + i * 12.5;
        cols += `<path d="M${x - 3} 42 V19 M${x + 3} 42 V19" ${pen(p, 1.2)}/><path d="M${x - 3} 42 V19 H${x + 3} V42 Z" fill="${stone(p)}"/>`;
        cols += `<path d="M${x - 3} 42 V19 M${x + 3} 42 V19" ${pen(p, 1.2)}/>`;
        cols += `<path d="M${x - 4.6} 15 Q${x} 21 ${x + 4.6} 15 Z" ${body(p, stone(p), 1.1)}/>`;
        cols += `<path d="M${x + 1.2} 21 V41" ${hatch(p)}/>`;
      }
      return {
        id: 'zij-art-columns', width: 74, height: 52,
        svg: `
          ${cols}
          <path d="M5 15 V9 H69 V15 Z" ${body(p, stone(p))}/>
          <path d="M3 9 H71" ${pen(p, 1.5)}/>
          <path d="M9 12 h8 M22 12 h9 M36 12 h8 M49 12 h9" ${hatch(p)}/>
          <path d="M5 42 H69 V46 H5 Z" ${body(p, stone(p))}/>
          <path d="M1 46 H73 V50 H1 Z" ${body(p, stone(p))}/>`,
      };
    },
  },
  {
    id: 'zij-art-belem',
    name: 'The tower of Belém, Lisbon',
    kind: 'landmark',
    draw: (p) => ({
      id: 'zij-art-belem', width: 60, height: 74,
      svg: `
        <path d="M22 46 V16 H42 V46 Z" ${body(p, stone(p))}/>
        <path d="${merlons(22, 42, 16, 4, 3)}" ${body(p, stone(p), 1.2)}/>
        <path d="M26 13 V6 H38 V13" ${body(p, stone(p), 1.2)}/>
        <path d="${merlons(26, 38, 6, 3, 2.4)}" ${body(p, stone(p), 1.1)}/>
        <path d="M20 30 H44 M20 33 H44" ${pen(p, 1)}/>
        <path d="M30 38 h4 v6 h-4 Z M30 21 h4 v5 h-4 Z" fill="${p.ink}" fill-opacity="0.75"/>
        <path d="M18 19 a3 3 0 0 1 6 0 v5 h-6 Z M40 19 a3 3 0 0 1 6 0 v5 h-6 Z" ${body(p, stone(p), 1.1)}/>
        <path d="M38.5 18 V45 M40.5 26 V45 M36 35 V45" ${hatch(p)}/>
        <path d="M6 64 V48 H54 V64 Z" ${body(p, stone(p))}/>
        <path d="${merlons(6, 54, 48)}" ${body(p, stone(p), 1.2)}/>
        <path d="M3 50 a3.5 3.5 0 0 1 7 0 v6 h-7 Z M50 50 a3.5 3.5 0 0 1 7 0 v6 h-7 Z" ${body(p, stone(p), 1.1)}/>
        <path d="M14 55 h4 v4 h-4 Z M28 55 h4 v4 h-4 Z" fill="${p.ink}" fill-opacity="0.7"/>
        <path d="M44 51 V63 M48 51 V63 M40 54 V63" ${hatch(p)}/>
        <path d="M2 64.6 H58" ${pen(p, 1.3)}/>
        ${waves(p, 68.5, 3, 4)}${waves(p, 71, 26, 4)}`,
    }),
  },
];

export const DRAWING_BY_ID: Record<string, Drawing> = Object.fromEntries(DRAWINGS.map((d) => [d.id, d]));

/** The starter set. Coordinates are the real places. */
export const PLACEMENTS: Placement[] = [
  // landmarks
  { icon: 'zij-art-pyramids', name: 'Giza', lngLat: [31.134, 29.979], minzoom: 4.6, maxzoom: 12, size: 1, priority: 1, anchor: 'bottom-right', offset: [-14, 8] },
  { icon: 'zij-art-qaitbay', name: 'Alexandria', lngLat: [29.885, 31.214], minzoom: 6.2, maxzoom: 12, size: 0.9, priority: 2, anchor: 'bottom-right', offset: [-12, -6] },
  { icon: 'zij-art-cairo-gate', name: 'Cairo', lngLat: [31.2625, 30.0555], minzoom: 7.8, maxzoom: 12, size: 0.9, priority: 3, anchor: 'bottom-left', offset: [14, -10] },
  { icon: 'zij-art-columns', name: 'Luxor', lngLat: [32.64, 25.7], minzoom: 5.2, maxzoom: 12, size: 0.95, priority: 2, anchor: 'bottom-right', offset: [-12, 6] },
  { icon: 'zij-art-belem', name: 'Lisbon', lngLat: [-9.216, 38.692], minzoom: 5.2, maxzoom: 12, size: 0.85, priority: 2, anchor: 'bottom-right', offset: [-14, 6] },
  // oases
  { icon: 'zij-art-palm', name: 'Siwa', lngLat: [25.52, 29.2], minzoom: 4.8, maxzoom: 11, size: 0.9, priority: 5 },
  { icon: 'zij-art-palm', name: 'Kharga', lngLat: [30.55, 25.44], minzoom: 5, maxzoom: 11, size: 0.9, priority: 5 },
  { icon: 'zij-art-palm', name: 'Dakhla', lngLat: [29.0, 25.5], minzoom: 5.6, maxzoom: 11, size: 0.85, priority: 6 },
  { icon: 'zij-art-palm', name: 'Faiyum', lngLat: [30.84, 29.31], minzoom: 6.4, maxzoom: 11, size: 0.85, priority: 6 },
  // marsh
  { icon: 'zij-art-reeds', name: 'Lake Burullus', lngLat: [30.9, 31.45], minzoom: 7.4, maxzoom: 12, size: 0.9, priority: 6 },
  { icon: 'zij-art-reeds', name: 'Lake Manzala', lngLat: [32.05, 31.27], minzoom: 7.4, maxzoom: 12, size: 0.9, priority: 6 },
  { icon: 'zij-art-reeds', name: 'Paraná Delta', lngLat: [-59.3, -33.6], minzoom: 5.6, maxzoom: 12, size: 1, priority: 4 },
  // sand
  { icon: 'zij-art-dunes', name: 'Great Sand Sea', lngLat: [25.8, 26.4], minzoom: 4, maxzoom: 8.5, size: 1, priority: 7 },
  { icon: 'zij-art-dunes', name: 'Rub al Khali', lngLat: [50, 19.6], minzoom: 3, maxzoom: 7.5, size: 1.1, priority: 7 },
  { icon: 'zij-art-dunes', name: 'Grand Erg Oriental', lngLat: [7, 30.4], minzoom: 3.4, maxzoom: 7.5, size: 1, priority: 7 },
  // pine country
  { icon: 'zij-art-pine', name: 'Pinhal Interior', lngLat: [-8.0, 39.95], minzoom: 6.2, maxzoom: 12, size: 0.95, priority: 5 },
  { icon: 'zij-art-pine', name: 'Pinhal de Leiria', lngLat: [-8.96, 39.83], minzoom: 7.2, maxzoom: 12, size: 0.85, priority: 6 },
  // ships, far out
  { icon: 'zij-art-dhow', name: 'Mediterranean', lngLat: [27.6, 33.4], minzoom: 3.2, maxzoom: 8.5, size: 0.9, priority: 8 },
  { icon: 'zij-art-dhow', name: 'Red Sea', lngLat: [37.6, 21.6], minzoom: 4, maxzoom: 8.5, size: 0.75, priority: 8 },
  { icon: 'zij-art-dhow', name: 'Arabian Sea', lngLat: [62, 16.5], minzoom: 2, maxzoom: 7, size: 1, priority: 8 },
  { icon: 'zij-art-dhow', name: 'Atlantic', lngLat: [-12.6, 38.4], minzoom: 3.6, maxzoom: 8.5, size: 0.9, priority: 8 },
  { icon: 'zij-art-dhow', name: 'Río de la Plata', lngLat: [-55.2, -36.2], minzoom: 3.6, maxzoom: 8.5, size: 0.9, priority: 8 },
];

export function drawingImages(p: Palette): AtlasImage[] {
  return DRAWINGS.map((d) => d.draw(p));
}

export function illustrationFeatures(placements: Placement[] = PLACEMENTS): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: placements.map((pl) => ({
      type: 'Feature',
      properties: { icon: pl.icon, name: pl.name, minzoom: pl.minzoom, maxzoom: pl.maxzoom, size: pl.size ?? 1, priority: pl.priority ?? 5, anchor: pl.anchor ?? 'bottom', offset: pl.offset ?? [0, 0] },
      geometry: { type: 'Point', coordinates: pl.lngLat },
    })),
  };
}
