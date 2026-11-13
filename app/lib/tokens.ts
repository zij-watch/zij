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

// Night, the design system's other theme (its tokens.css, as the landing page uses it): the sky and
// the room after dark, ink in light. Only the error pages use it, with their drawings on Folio paper
// inside it: data-theme="night" on a wrapper, data-theme="folio" on a sheet within.
export const NIGHT: Record<string, string> = {
  ground: "#100c09",
  "ground-raised": "#1b150f",
  sky: "#0a0f1e",
  rule: "#4a3c2a",
  ink: "#ede3cc",
  "ink-muted": "#a99a7e",
  brass: "#c9a35a",
  rubric: "#f0643c",
  "on-rubric": "#100c09",
  lapis: "#7ea2e6",
  shadow: "#030201",
  wood: "#3a2618",
  flame: "#ffc56b",
  "heat-0": "#1b150f",
  "heat-1": "#4a1810",
  "heat-2": "#9e2a16",
  "heat-3": "#e2582f",
  "heat-4": "#f2a541",
  "heat-5": "#f7dda0",
};

// What Folio adds for a room: the wood of the desk and the lamp's flame.
const FOLIO_ROOM: Record<string, string> = { wood: "#5a3a22", flame: "#f4c063" };

export const FONT_DISPLAY = '"Cormorant Garamond", "Reem Kufi", Amiri, Georgia, serif';
export const FONT_TEXT = 'Amiri, Georgia, serif';

export function heatRamp(): string[] {
  return [1, 2, 3, 4, 5].map((i) => COLOURS[`heat-${i}`]);
}

const props = (colours: Record<string, string>) =>
  Object.entries(colours)
    .map(([name, value]) => `--${name}:${value};`)
    .join("");

/**
 * The tokens as CSS custom properties: Folio on :root, and both themes as scopes, Night first so a
 * Folio sheet inside a Night wrapper is Folio again.
 */
export function tokensCss(): string {
  const folio = props({ ...COLOURS, ...FOLIO_ROOM });
  return (
    `:root{${folio}color-scheme:light;--font-display:${FONT_DISPLAY};--font-text:${FONT_TEXT};}` +
    `[data-theme="night"]{${props(NIGHT)}color-scheme:dark;}` +
    `[data-theme="folio"]{${folio}color-scheme:light;}`
  );
}
