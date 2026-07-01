interface PaletteColor {
  key: string;
  rgb: [number, number, number];
}

// Fixed starting palette. Not calibrated against real Skim exports yet — good enough for MVP.
const PALETTE: PaletteColor[] = [
  { key: 'yellow', rgb: [255, 255, 0] },
  { key: 'green', rgb: [0, 255, 0] },
  { key: 'blue', rgb: [0, 200, 255] },
  { key: 'pink', rgb: [255, 105, 180] },
  { key: 'orange', rgb: [255, 165, 0] },
  { key: 'red', rgb: [255, 0, 0] },
  { key: 'purple', rgb: [160, 32, 240] },
];

export function nearestColorKey(rgb: [number, number, number]): string {
  let best = PALETTE[0];
  let bestDist = Infinity;
  for (const candidate of PALETTE) {
    const dist =
      (rgb[0] - candidate.rgb[0]) ** 2 + (rgb[1] - candidate.rgb[1]) ** 2 + (rgb[2] - candidate.rgb[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best.key;
}
