// Capture: the map as a PNG, with the area, the date and the credit written on it.

import type { Map as MapLibreMap } from "maplibre-gl";
import { COLOURS, FONT_DISPLAY, FONT_TEXT } from "./tokens";

export const CREDIT = "Fire data: NASA FIRMS. Imagery: NASA GIBS. Map: Natural Earth. zij.watch";

/** The map as it is now, with a paper strip along the bottom: title at left, credit at right. */
export function captureMap(map: MapLibreMap, title: string, date: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // The drawing buffer can only be read while the map is drawing: copy it inside a render.
    map.once("render", () => {
      try {
        const source = map.getCanvas();
        const scale = source.width / source.clientWidth || 1;
        const strip = Math.round(46 * scale);
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height + strip;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(source, 0, 0);
        ctx.fillStyle = COLOURS["ground-raised"];
        ctx.fillRect(0, source.height, canvas.width, strip);
        ctx.fillStyle = COLOURS.rule;
        ctx.fillRect(0, source.height, canvas.width, Math.max(1, Math.round(scale)));
        ctx.textBaseline = "middle";
        const y = source.height + strip / 2;
        const pad = Math.round(16 * scale);
        ctx.fillStyle = COLOURS.ink;
        ctx.font = `600 ${Math.round(22 * scale)}px ${FONT_DISPLAY}`;
        const head = `${title}, ${date}`;
        ctx.fillText(head, pad, y);
        const used = ctx.measureText(head).width + pad * 2;
        ctx.fillStyle = COLOURS["ink-muted"];
        ctx.font = `400 ${Math.round(14 * scale)}px ${FONT_TEXT}`;
        ctx.textAlign = "right";
        // On a narrow map the credit takes the room that is left.
        ctx.fillText(CREDIT, canvas.width - pad, y, Math.max(40, canvas.width - used - pad));
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be made."))), "image/png");
      } catch (error) {
        reject(error);
      }
    });
    map.triggerRepaint();
  });
}

export function saveBlob(blob: Blob, name: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}
