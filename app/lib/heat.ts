// The one heat ramp: 5 stepped classes, heat-1 to heat-5.
// Class breaks are the quintiles of an area's non-zero month values over the whole record,
// so the colours mean the same in every year and every date range.

export function heatBreaks(values: number[]): number[] {
  const nonZero = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return [0, 0, 0, 0];
  return [0.2, 0.4, 0.6, 0.8].map((q) => nonZero[Math.min(nonZero.length - 1, Math.floor(q * nonZero.length))]);
}

/** 0 for zero, 1 to 5 for the heat classes. */
export function heatClass(value: number, breaks: number[]): number {
  if (!(value > 0)) return 0;
  let k = 1;
  for (const b of breaks) if (value >= b) k += 1;
  return Math.min(k, 5);
}
