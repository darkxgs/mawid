// Photography and film for the marketing site and the demo clinic, generated
// for Mawid with Higgsfield, kept in public/media and served through Next's
// image optimizer.
const MEDIA = "/media";

export type Photo = { src: string; poster?: string; width: number; height: number; alt: string };

const photo = (file: string, width: number, height: number, alt: string): Photo => ({
  src: `${MEDIA}/${file}.webp`,
  width,
  height,
  alt,
});

export const PHOTOS = {
  frontDesk: {
    ...photo("front-desk", 2048, 1360, "A receptionist at a Dubai dental clinic takes a call beside a paper appointment book."),
    poster: `${MEDIA}/front-desk-poster.webp`,
  },
  reminder: photo(
    "reminder",
    1792,
    2240,
    "A man in a parked car at dusk glances at his phone.",
  ),
  waitingRoom: photo(
    "waiting-room",
    1792,
    2240,
    "An empty clinic waiting area with sunlight through a mashrabiya screen.",
  ),
  treatmentRoom: photo(
    "treatment-room",
    2688,
    1152,
    "A bright dental treatment room with a view of palm trees.",
  ),
  barber: photo(
    "barber",
    1792,
    2240,
    "A barber trims a client's beard in a Riyadh barbershop.",
  ),
  paperCard: photo(
    "paper-card",
    2048,
    1360,
    "A hand writes on a paper appointment card next to Arabic coffee and dates.",
  ),
} as const;

/** Six-second loop of the front desk (Seedance 2.5, from the front-desk still). */
export const HERO_FILM: { src: string; webm: string } | null = {
  src: `${MEDIA}/hero.mp4`,
  webm: `${MEDIA}/hero.webm`,
};

export const isOptimizable = (url: string) => url.startsWith(`${MEDIA}/`);
