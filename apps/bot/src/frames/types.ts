/** A backdrop chosen for a card: where to read it and where to look. */
export interface FrameBackdrop {
  /** Absolute URL of the picture. */
  url: string;
  /** Catalog path, the stable identity of the frame. */
  id: string;
  series: string;
  episode: number;
  /** Centre of interest, fractions of the frame (the crop follows it). */
  focus: [number, number];
  /** Dominant colour of the frame, `#rrggbb`. */
  dominant: string;
}
