// Zij design tokens. One theme, Folio: ink on paper.
// This is the one place colours live: the stylesheet, the map layers and the charts all read from here.

export const COLOURS: Record<string, string> = {
  ground: "#eee2c6",
  "ground-raised": "#f6edd8",
  sky: "#d5dbe6",
  rule: "#bfa678",
  ink: "#1e1a15",
  "ink-muted": "#5b5244",
  brass: "#7a5b1e",
  rubric: "#a92f18",
  "on-rubric": "#fbf4e4",
  lapis: "#22468f",
  shadow: "#3a2410",
  // On frosted glass over satellite imagery the surface can sit over black sea, so the two
  // lighter inks are deepened to keep 4.5:1 (checked in scripts/contrast.mjs).
  "glass-ink-muted": "#453d32",
  "glass-brass": "#58400f",
  "heat-0": "#f6edd8",
  "heat-1": "#f2c978",
  "heat-2": "#e0873a",
  "heat-3": "#b8391c",
  "heat-4": "#7a1e12",
  "heat-5": "#3a0e0a",
};

export const FONT_DISPLAY = '"Cormorant Garamond", "Reem Kufi", Amiri, Georgia, serif';
export const FONT_TEXT = 'Amiri, Georgia, serif';

export function heatRamp(): string[] {
  return [1, 2, 3, 4, 5].map((i) => COLOURS[`heat-${i}`]);
}

/** The tokens as CSS custom properties. */
export function tokensCss(): string {
  const block = Object.entries(COLOURS)
    .map(([name, value]) => `--${name}:${value};`)
    .join("");
  return `:root{${block}color-scheme:light;--font-display:${FONT_DISPLAY};--font-text:${FONT_TEXT};}`;
}
