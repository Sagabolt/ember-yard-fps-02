// The look plan, in one place. "Ember Yard" — a disused freight yard at dusk:
// warm sand floor, rust containers, teal steel, amber lamps. The lighting makes
// every shade the game needs, so no other colour appears in the code. The same
// names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#1a1d24',
  surface: '#232830',
  hairline: '#39414d',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  sand: '#b49b6e',
  rust: '#c65f2e',
  teal: '#2fae8f',
  olive: '#6b7a4a',
  dusk: '#2b3a55',
  amber: '#ffb347',
};

export function shade(name) {
  return PALETTE[name];
}
