import type { Author, Post } from "./types";

// Seed feed for the prototype. Card `poster` is a stylized gradient (fast + striking);
// `panoUrl` is a REAL, CORS-enabled equirectangular image the viewer loads on open.
//
// These are demo/CC panos from open-source viewer projects — fine for this prototype demo;
// CLEAR LICENSING before any public launch. Real content arrives via the upload flow
// (file → Supabase Storage → post.storage_path).
const PANO = {
  alpine:      "https://photo-sphere-viewer-data.netlify.app/assets/sphere.jpg",            // Écrins mountains
  alpineSm:    "https://photo-sphere-viewer-data.netlify.app/assets/sphere-small.jpg",
  coast:       "https://photo-sphere-viewer-data.netlify.app/assets/tour/key-biscayne-1.jpg", // beach / coast
  observatory: "https://pannellum.org/images/alma.jpg",                                      // ALMA, Atacama desert
  desert:      "https://pannellum.org/images/cerro-toco-0.jpg",                              // Cerro Toco high desert
  park:        "https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg",          // open outdoor scene
};

const U: Record<string, Author> = {
  aiko: { handle: "aiko.vista", initials: "A", grad: "linear-gradient(135deg,#ff6b35,#e040a0)" },
  marcos: { handle: "marcos.360", initials: "M", grad: "linear-gradient(135deg,#ff4d6d,#7c3aed)" },
  sol: { handle: "sol.panoram", initials: "S", grad: "linear-gradient(135deg,#e040a0,#ff6b35)" },
  drift: { handle: "drift.lens", initials: "D", grad: "linear-gradient(135deg,#7c3aed,#e040a0)" },
  yuki: { handle: "yuki.sphere", initials: "Y", grad: "linear-gradient(135deg,#ff6b35,#7c3aed)" },
};

export const POSTS: Post[] = [
  {
    id: "1", type: "360_photo", title: "Patagonia, after midnight", location: "Torres del Paine, Chile",
    author: U.sol, poster: "radial-gradient(120% 100% at 30% 10%,#102a5c,#040b1f 60%,#02060f)",
    panoUrl: PANO.alpine, likes: 1567, comments: 54, saves: 288,
    annotations: [{ yaw: 0.3, pitch: -0.05, label: "The trail starts here", kind: "cache" }],
  },
  {
    id: "2", type: "panoramic_photo", title: "Shinjuku at 3am", location: "Tokyo, Japan",
    author: U.aiko, poster: "linear-gradient(135deg,#1a0010,#5b0030 50%,#ff2b6b)",
    panoUrl: PANO.park, likes: 842, comments: 31, saves: 119,
  },
  {
    id: "3", type: "360_video", title: "Aurora drift", location: "Iceland",
    author: U.yuki, poster: "radial-gradient(120% 100% at 70% 0%,#003826,#04150f 55%,#021008)",
    panoUrl: PANO.alpineSm, likes: 5540, comments: 231, saves: 980,
    annotations: [{ yaw: -0.7, pitch: 0.2, label: "Full Moon party — peer in?", kind: "portal" }],
  },
  {
    id: "4", type: "180_photo", title: "Sahara, last light", location: "Erg Chebbi, Morocco",
    author: U.drift, poster: "linear-gradient(135deg,#2a0c00,#a84000 60%,#ffc070)",
    panoUrl: PANO.desert, likes: 3201, comments: 142, saves: 521,
  },
  {
    id: "5", type: "panoramic_photo", title: "Big Sur fog line", location: "California, USA",
    author: U.aiko, poster: "linear-gradient(180deg,#060c14,#142032 55%,#3a6080)",
    panoUrl: PANO.coast, likes: 987, comments: 44, saves: 166,
  },
  {
    id: "6", type: "360_photo", title: "Milky Way core", location: "Atacama Desert, Chile",
    author: U.marcos, poster: "radial-gradient(120% 100% at 50% 0%,#0c0030,#040014 55%,#01000a)",
    panoUrl: PANO.observatory, likes: 6120, comments: 301, saves: 1204,
    annotations: [{ yaw: 0.5, pitch: 0.1, label: "The array points here", kind: "note" }],
  },
  {
    id: "7", type: "180_video", title: "Reef pass", location: "Raja Ampat, Indonesia",
    author: U.drift, poster: "radial-gradient(120% 100% at 40% 10%,#00465c,#012531 55%,#001318)",
    panoUrl: PANO.coast, likes: 1843, comments: 67, saves: 312,
  },
  {
    id: "8", type: "panoramic_photo", title: "Grand Canyon rim", location: "Arizona, USA",
    author: U.sol, poster: "linear-gradient(135deg,#1a0800,#6b2000 50%,#e07838)",
    panoUrl: PANO.desert, likes: 2890, comments: 98, saves: 445,
  },
];
