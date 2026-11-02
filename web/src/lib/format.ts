/**
 * A probability as a percentage with one decimal. The ends never round onto
 * certainty: 0.9991 is ">99.9%", not "100%", and 0.0002 is "<0.1%", not "0%".
 */
export function percent(p: number): string {
  if (p >= 1) return '100%';
  if (p <= 0) return '0%';
  const value = p * 100;
  if (value >= 99.95) return '>99.9%';
  if (value < 0.05) return '<0.1%';
  return `${value.toFixed(1)}%`;
}
