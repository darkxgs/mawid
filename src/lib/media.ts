// Photography and film for the marketing site and the demo clinic, generated
// for Mawid with Higgsfield and served through Next's image optimizer.
const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3KEzB9B3k7k7KvaEiefqwv7OPXv";

export type Photo = { src: string; poster?: string; width: number; height: number; alt: string };

const photo = (file: string, width: number, height: number, alt: string): Photo => ({
  src: `${CDN}/${file}.png`,
  poster: `${CDN}/${file}_min.webp`,
  width,
  height,
  alt,
});

export const PHOTOS = {
  frontDesk: photo(
    "hf_20261023_012832_a3fe78f3-3b8a-41f5-8a06-c35f8a4752d7",
    2048,
    1360,
    "A receptionist at a Dubai dental clinic takes a call beside a paper appointment book.",
  ),
  reminder: photo(
    "hf_20261023_012833_3eefbcac-4b8a-4921-9723-3ed0725e41b4",
    1792,
    2240,
    "A man in a parked car at dusk glances at his phone.",
  ),
  waitingRoom: photo(
    "hf_20261023_012832_78e3f5fd-969a-4c92-861b-dc648848ada0",
    1792,
    2240,
    "An empty clinic waiting area with sunlight through a mashrabiya screen.",
  ),
  treatmentRoom: photo(
    "hf_20261023_012831_1a8a057d-68f8-4141-9394-43f74c301ff3",
    2688,
    1152,
    "A bright dental treatment room with a view of palm trees.",
  ),
  barber: photo(
    "hf_20261023_012831_21f04a94-8357-4167-86a7-a252ebfe6ca7",
    1792,
    2240,
    "A barber trims a client's beard in a Riyadh barbershop.",
  ),
  paperCard: photo(
    "hf_20261023_012832_9a94e7f5-822e-42fc-91ed-04388520118e",
    2048,
    1360,
    "A hand writes on a paper appointment card next to Arabic coffee and dates.",
  ),
} as const;

/** Six-second loop of the front desk (Seedance 2.5, from the front-desk still). */
export const HERO_FILM: { src: string } | null = {
  src: `${CDN}/hf_20261023_013047_d8eb8c51-3d1f-4391-b527-19d6746648d7.mp4`,
};

export const isOptimizable = (url: string) => url.startsWith(CDN);
