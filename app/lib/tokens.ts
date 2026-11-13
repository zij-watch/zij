// Zij design tokens. Values come from the Zij design system (Night and Folio themes).
// This is the one place colours live: the stylesheet, the map style and the charts all read from here.

export type Theme = "night" | "folio";

export const COLOURS: Record<Theme, Record<string, string>> = {
  night: {
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
    // Zero fires: halfway between ground and ground-raised, dark enough to stay 10 or more
    // lightness steps below heat-1 in greyscale (see the colour table on How it works).
    "heat-0": "#16100c",
    "heat-1": "#4a1810",
    "heat-2": "#9e2a16",
    "heat-3": "#e2582f",
    "heat-4": "#f2a541",
    "heat-5": "#f7dda0",
  },
  folio: {
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
    "heat-0": "#f6edd8",
    "heat-1": "#f2c978",
    "heat-2": "#e0873a",
    "heat-3": "#b8391c",
    "heat-4": "#7a1e12",
    "heat-5": "#3a0e0a",
  },
};

export const FONT_DISPLAY = '"Cormorant Garamond", "Reem Kufi", Amiri, Georgia, serif';
export const FONT_TEXT = 'Amiri, Georgia, serif';

export function heatRamp(theme: Theme): string[] {
  return [1, 2, 3, 4, 5].map((i) => COLOURS[theme][`heat-${i}`]);
}

/** CSS custom properties for both themes. Night is the default; data-theme="folio" switches. */
export function tokensCss(): string {
  const block = (theme: Theme) =>
    Object.entries(COLOURS[theme])
      .map(([name, value]) => `--${name}:${value};`)
      .join("");
  return (
    `:root,[data-theme="night"]{${block("night")}color-scheme:dark;}` +
    `[data-theme="folio"]{${block("folio")}color-scheme:light;}` +
    `:root{--font-display:${FONT_DISPLAY};--font-text:${FONT_TEXT};}`
  );
}
