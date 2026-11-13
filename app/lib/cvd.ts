// Colour-blindness check of the heat ramp.
// Simulation: Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear RGB.
// Difference between neighbouring steps: CIE76 (distance in CIELAB).

export type Vision = "normal" | "protanopia" | "deuteranopia" | "tritanopia" | "greyscale";

export const VISIONS: { id: Vision; label: string }[] = [
  { id: "normal", label: "Full colour" },
  { id: "protanopia", label: "Protanopia (no red cones)" },
  { id: "deuteranopia", label: "Deuteranopia (no green cones)" },
  { id: "tritanopia", label: "Tritanopia (no blue cones)" },
  { id: "greyscale", label: "Greyscale" },
];

const MATRICES: Record<string, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function hexToLinear(hex: string): number[] {
  return [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
}

function linearToHex(rgb: number[]): string {
  return "#" + rgb.map((v) => Math.round(clamp(toSrgb(clamp(v))) * 255).toString(16).padStart(2, "0")).join("");
}

function lab(rgb: number[]): [number, number, number] {
  const [r, g, b] = rgb.map(clamp);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** A colour as someone with this vision sees it. */
export function simulate(hex: string, vision: Vision): string {
  const rgb = hexToLinear(hex);
  if (vision === "normal") return hex;
  if (vision === "greyscale") {
    const y = 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2];
    return linearToHex([y, y, y]);
  }
  const m = MATRICES[vision];
  return linearToHex(m.map((row) => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]));
}

export interface RampCheck {
  vision: Vision;
  colours: string[];
  lightness: number[]; // CIE L* of each step
  minStep: number; // smallest CIE76 difference between neighbouring steps
  ordered: boolean; // lightness runs one way through all steps
}

/** `steps` runs from the zero colour to the top heat class. */
export function checkRamp(steps: string[]): RampCheck[] {
  return VISIONS.map(({ id }) => {
    const colours = steps.map((hex) => simulate(hex, id));
    const labs = colours.map((hex) => lab(hexToLinear(hex)));
    const lightness = labs.map((v) => Math.round(v[0]));
    const diffs = labs.slice(1).map((v, i) => Math.hypot(v[0] - labs[i][0], v[1] - labs[i][1], v[2] - labs[i][2]));
    const deltas = labs.slice(1).map((v, i) => v[0] - labs[i][0]);
    return { vision: id, colours, lightness, minStep: Math.round(Math.min(...diffs)), ordered: deltas.every((d) => d > 0) || deltas.every((d) => d < 0) };
  });
}
