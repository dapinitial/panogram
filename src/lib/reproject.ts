import "server-only";
import sharp from "sharp";

// Equirectangular ↔ rectilinear reprojection for the AI tagging pipeline
// (VISION annotation layer §1). Vision models misread raw equirectangular
// panos (pole distortion), so we render flat perspective views out of the
// sphere, send those, and convert returned pixel coords back to yaw/pitch.
//
// Convention matches the viewer: yaw 0 = pano center, positive yaw pans
// right, pitch positive = up, radians. (If real-image tests show mirrored
// placement, flip the sign of `lon` in both functions together.)

export interface ViewSpec {
  yaw: number;   // view-center yaw (radians)
  pitch: number; // view-center pitch (radians)
  fov: number;   // horizontal field of view (radians); views are square
  size: number;  // output pixels per side
}

// The standard sweep: four horizon views with overlap. 100° FOV on a 90°
// spacing so features on seams appear fully in at least one view.
export const DEFAULT_VIEWS: ViewSpec[] = [0, 90, 180, 270].map((deg) => ({
  yaw: (deg * Math.PI) / 180,
  pitch: 0,
  fov: (100 * Math.PI) / 180,
  size: 1024,
}));

// Camera ray for a pixel (px,py in [0,1] of the view) → world direction.
function pixelToDirection(px: number, py: number, view: ViewSpec) {
  const t = Math.tan(view.fov / 2);
  const x = (2 * px - 1) * t;
  const y = (1 - 2 * py) * t;
  const dx = x, dy = y, dz = 1;
  // pitch (about x-axis), then yaw (about y-axis)
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const y2 = dy * cp + dz * sp, z2 = -dy * sp + dz * cp;
  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
  const x3 = dx * cy + z2 * sy, z3 = -dx * sy + z2 * cy;
  const len = Math.hypot(x3, y2, z3);
  return { x: x3 / len, y: y2 / len, z: z3 / len };
}

/** Pixel in a rendered view (0–1000 coords, as prompted) → sphere yaw/pitch. */
export function viewPixelToSphere(x1000: number, y1000: number, view: ViewSpec): { yaw: number; pitch: number } {
  const d = pixelToDirection(x1000 / 1000, y1000 / 1000, view);
  const yaw = Math.atan2(d.x, d.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
  return { yaw, pitch };
}

const EQUIRECT_W = 4096; // downsample source before sampling — plenty for tagging

/**
 * Render rectilinear JPEG views out of an equirectangular pano.
 * Returns base64 JPEGs aligned with `views`.
 */
export async function renderViews(equirect: Buffer, views: ViewSpec[] = DEFAULT_VIEWS): Promise<string[]> {
  const { data, info } = await sharp(equirect)
    .resize(EQUIRECT_W, EQUIRECT_W / 2, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;

  const out: string[] = [];
  for (const view of views) {
    const N = view.size;
    const px = Buffer.allocUnsafe(N * N * 3);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const d = pixelToDirection((i + 0.5) / N, (j + 0.5) / N, view);
        const lon = Math.atan2(d.x, d.z);            // −π..π, 0 = pano center
        const lat = Math.asin(d.y);                  // −π/2..π/2
        let u = Math.floor((lon / (2 * Math.PI) + 0.5) * W);
        let v = Math.floor((0.5 - lat / Math.PI) * H);
        u = ((u % W) + W) % W;
        v = Math.max(0, Math.min(H - 1, v));
        const s = (v * W + u) * C, t = (j * N + i) * 3;
        px[t] = data[s]; px[t + 1] = data[s + 1]; px[t + 2] = data[s + 2];
      }
    }
    const jpeg = await sharp(px, { raw: { width: N, height: N, channels: 3 } })
      .jpeg({ quality: 82 })
      .toBuffer();
    out.push(jpeg.toString("base64"));
  }
  return out;
}
