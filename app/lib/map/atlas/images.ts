// Every image the style refers to (patterns and map signs), drawn in code as SVG from the palette
// and rasterised in the browser. No sprite sheet to build: change the theme and they are redrawn.
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Palette } from './palette';

export interface AtlasImage {
  id: string;
  width: number;
  height: number;
  /** Inner SVG markup for a 0 0 width height viewBox. */
  svg: string;
}

export interface RasterImage {
  data: ImageData;
  pixelRatio: number;
}

const tile = (id: string, width: number, height: number, svg: string): AtlasImage => ({ id, width, height, svg });

/** Fill patterns. Sizes are in CSS pixels; they are rasterised at 2x. */
export function patternImages(p: Palette): AtlasImage[] {
  const dots: string[] = [];
  // A fixed scatter that tiles: desert stipple.
  const pts = [[3, 4], [14, 2], [25, 6], [8, 12], [20, 14], [30, 17], [2, 21], [13, 24], [24, 26], [18, 7], [6, 29], [29, 30]];
  for (const [x, y] of pts) dots.push(`<circle cx="${x}" cy="${y}" r="0.8"/>`);
  return [
    tile('zij-sea-lines', 48, 7, `<path d="M0 3.5 Q12 2.9 24 3.5 T48 3.5" fill="none" stroke="${p.seaLine}" stroke-width="0.7" opacity="0.8"/>`),
    tile('zij-lake-hatch', 8, 5, `<path d="M0 2.5 H8" stroke="${p.waterInk}" stroke-width="0.6" opacity="0.55"/>`),
    tile('zij-field-hatch', 8, 8, `<path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="${p.field}" stroke-width="0.8" opacity="0.9"/>`),
    tile('zij-stipple', 32, 32, `<g fill="${p.desert}" opacity="0.75">${dots.join('')}</g>`),
  ];
}

/** Small signs: hills, peaks and the three sizes of town. Ink outline, paper fill, shade on the right. */
export function signImages(p: Palette): AtlasImage[] {
  const ink = p.ink;
  const paper = p.groundRaised;
  const o = `fill="none" stroke="${ink}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"`;
  const hatch = `stroke="${p.reliefShade}" stroke-width="0.9" stroke-linecap="round" opacity="0.85"`;
  const hillFill = `fill="${p.relief}" fill-opacity="0.34"`;
  return [
    tile('zij-hill-0', 44, 26, `
      <path d="M2 24 C9 22 15 5 22 3 C29 5 36 20 42 24 Z" ${hillFill}/>
      <path d="M2 24 C9 22 15 5 22 3 C29 5 36 20 42 24" ${o}/>
      <path d="M25 8 L29 17 M28 9 L33 20 M31 14 L36 22 M23 12 L25 20" ${hatch}/>`),
    tile('zij-hill-1', 52, 26, `
      <path d="M2 24 C8 22 12 8 18 6 C22 8 25 14 27 16 C30 12 33 4 37 3 C42 5 46 20 50 24 Z" ${hillFill}/>
      <path d="M2 24 C8 22 12 8 18 6 C22 8 25 14 27 16 C30 12 33 4 37 3 C42 5 46 20 50 24" ${o}/>
      <path d="M20 10 L24 20 M22 16 L25 22 M39 7 L43 17 M42 10 L46 21 M37 12 L39 20" ${hatch}/>`),
    tile('zij-hill-2', 40, 20, `
      <path d="M2 18 C8 17 13 6 20 4 C27 6 32 15 38 18 Z" ${hillFill}/>
      <path d="M2 18 C8 17 13 6 20 4 C27 6 32 15 38 18" ${o}/>
      <path d="M23 8 L27 15 M26 9 L31 16 M21 11 L23 16" ${hatch}/>`),
    tile('zij-peak', 12, 11, `
      <path d="M1.5 10 L6 1.5 L10.5 10 Z" fill="${paper}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M6 1.5 L7.2 10 M7.6 5 L9 10" stroke="${ink}" stroke-width="0.7"/>`),
    // A capital: walls, a gate and two towers.
    tile('zij-city-capital', 26, 20, `
      <path d="M3 18 V9 H5 V7 H7 V9 H9 V7 H11 V9 H15 V7 H17 V9 H19 V7 H21 V9 H23 V18 Z" fill="${paper}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M10 9 V3.5 H12 V2 H14 V3.5 H16 V9" fill="${paper}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M11.2 18 V14.5 A1.8 1.8 0 0 1 14.8 14.5 V18" fill="${ink}" fill-opacity="0.85" stroke="${ink}" stroke-width="0.8"/>
      <path d="M19.5 11.5 V16.5 M21.3 11.5 V16.5 M17.6 12 V16.5" stroke="${ink}" stroke-width="0.6" opacity="0.6"/>
      <path d="M1.5 18.6 H24.5" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>`),
    // A city: a single keep.
    tile('zij-city', 16, 16, `
      <path d="M3.5 14 V6 H5.5 V4.2 H7 V6 H9 V4.2 H10.5 V6 H12.5 V14 Z" fill="${paper}" stroke="${ink}" stroke-width="1.15" stroke-linejoin="round"/>
      <path d="M7 14 V11.2 A1 1 0 0 1 9 11.2 V14" fill="${ink}" fill-opacity="0.85"/>
      <path d="M10.6 8 V12.5" stroke="${ink}" stroke-width="0.6" opacity="0.6"/>
      <path d="M2 14.5 H14" stroke="${ink}" stroke-width="1.15" stroke-linecap="round"/>`),
    // A town: the ring the design reference already uses.
    tile('zij-town', 10, 10, `<circle cx="5" cy="5" r="3" fill="${p.ground}" stroke="${ink}" stroke-width="1.3"/>`),
  ];
}

export function toSvg(img: AtlasImage, scale = 1): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width * scale}" height="${img.height * scale}" viewBox="0 0 ${img.width} ${img.height}">${img.svg}</svg>`;
}

const cache = new Map<string, Promise<RasterImage>>();

function rasterizeOne(img: AtlasImage, pixelRatio: number): Promise<RasterImage> {
  const key = `${pixelRatio}|${img.width}|${img.height}|${img.svg}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = new Promise<RasterImage>((resolve, reject) => {
      const el = new Image();
      const w = Math.round(img.width * pixelRatio);
      const h = Math.round(img.height * pixelRatio);
      el.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(el, 0, 0, w, h);
        resolve({ data: ctx.getImageData(0, 0, w, h), pixelRatio });
      };
      el.onerror = () => reject(new Error(`could not draw map image ${img.id}`));
      el.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvg(img, pixelRatio));
    });
    cache.set(key, hit);
  }
  return hit;
}

/** Draws a set of images. Patterns and signs at 2x, illustrations at 3x so they stay crisp when large. */
export async function rasterize(images: AtlasImage[], pixelRatio = 2): Promise<Map<string, RasterImage>> {
  const out = new Map<string, RasterImage>();
  await Promise.all(
    images.map(async (img) => {
      out.set(img.id, await rasterizeOne(img, pixelRatio));
    }),
  );
  return out;
}

/** Adds or replaces images on a map whose style has loaded. */
export function putImages(map: MapLibreMap, images: Map<string, RasterImage>): void {
  for (const [id, img] of images) {
    if (map.hasImage(id)) {
      const old = map.getImage(id);
      if (old && old.data.width === img.data.width && old.data.height === img.data.height) {
        map.updateImage(id, img.data);
        continue;
      }
      map.removeImage(id);
    }
    map.addImage(id, img.data, { pixelRatio: img.pixelRatio });
  }
}
