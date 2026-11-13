// The map's colours, resolved from Zij design tokens plus the two map pigments.
// Nothing here invents a colour: every entry is a token, a pigment, or a mix of two.
import tokens from '../../design/tokens.json';
import mapTokens from '../../design/map-tokens.json';

export type Theme = 'folio' | 'night';

/** A recipe: [a, b, share of b]. Names are Zij tokens or map pigments. */
export type Mix = [string, string, number];

export type MixName =
  | 'land' | 'landTint' | 'sea' | 'seaLine' | 'waterInk' | 'lake' | 'relief' | 'reliefShade'
  | 'desert' | 'field' | 'border' | 'graticule' | 'labelWater' | 'labelRegion';

export interface PaletteOverrides {
  pigments?: Partial<Record<'verdigris' | 'ochre', string>>;
  mix?: Partial<Record<MixName, Mix>>;
}

export interface Palette extends Record<MixName, string> {
  theme: Theme;
  // Zij tokens, straight through
  ground: string;
  groundRaised: string;
  sky: string;
  rule: string;
  ink: string;
  inkMuted: string;
  brass: string;
  rubric: string;
  onRubric: string;
  lapis: string;
  wood: string;
  onWood: string;
  flame: string;
  shadow: string;
  // pigments
  verdigris: string;
  ochre: string;
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

/** color-mix(in srgb, a, b t%) */
export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  return '#' + [0, 1, 2].map((i) => hex2(A[i] + (B[i] - A[i]) * t)).join('');
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, the same measure design/build-tokens.mjs uses. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export const DEFAULT_MIX = mapTokens.mix as unknown as Record<MixName, Mix> & { note: string };
export const MIX_NAMES: MixName[] = [
  'land', 'landTint', 'sea', 'seaLine', 'waterInk', 'lake', 'relief', 'reliefShade',
  'desert', 'field', 'border', 'graticule', 'labelWater', 'labelRegion',
];

export function resolvePalette(theme: Theme, overrides: PaletteOverrides = {}): Palette {
  const base: Record<string, string> = {};
  for (const t of tokens.color.tokens) {
    base[t.name] = (t.value as Record<Theme, string>)[theme];
  }
  base.verdigris = overrides.pigments?.verdigris ?? mapTokens.pigments.verdigris.value[theme];
  base.ochre = overrides.pigments?.ochre ?? mapTokens.pigments.ochre.value[theme];

  const out: Record<string, string> = { theme };
  for (const [k, v] of Object.entries(base)) out[camel(k)] = v;
  for (const name of MIX_NAMES) {
    const [a, b, t] = overrides.mix?.[name] ?? DEFAULT_MIX[name];
    out[name] = mix(base[a], base[b], t);
  }
  return out as unknown as Palette;
}

/** CSS custom properties for the dressing (cartouche, neatline, tokens…). */
export function paletteCssVars(p: Palette): Record<string, string> {
  return {
    '--ground': p.ground,
    '--ground-raised': p.groundRaised,
    '--sky': p.sky,
    '--rule': p.rule,
    '--ink': p.ink,
    '--ink-muted': p.inkMuted,
    '--brass': p.brass,
    '--rubric': p.rubric,
    '--on-rubric': p.onRubric,
    '--lapis': p.lapis,
    '--wood': p.wood,
    '--on-wood': p.onWood,
    '--flame': p.flame,
    '--shadow': p.shadow,
    '--map-land': p.land,
    '--map-sea': p.sea,
    '--map-verdigris': p.verdigris,
    '--map-ochre': p.ochre,
  };
}
