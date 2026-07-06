// Capture-geo extraction (VISION annotation layer): pull GPS + compass heading
// out of an uploaded pano so the sun layer, bearings, and triangulation light
// up. Browser-only, dependency-free — a minimal JPEG walker, not a full EXIF
// library. 360 cameras (DJI Osmo, Insta360, GoPro) write GPS into the EXIF GPS
// IFD and heading into either GPSImgDirection or an XMP packet
// (PoseHeadingDegrees / GimbalYawDegree). Non-JPEG or tagless files resolve {}.

export interface CaptureGeo {
  lat?: number;
  lng?: number;
  heading?: number; // compass degrees the pano's 0-yaw faces
}

const HEAD_BYTES = 512 * 1024; // EXIF + XMP APP1 segments live near the start

export async function extractCaptureGeo(file: File): Promise<CaptureGeo> {
  try {
    const buf = await file.slice(0, HEAD_BYTES).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {}; // not a JPEG

    const geo: CaptureGeo = {};
    let xmpHeading: number | undefined;

    // Walk JPEG segments collecting APP1 payloads (EXIF and/or XMP).
    let off = 2;
    while (off + 4 <= view.byteLength) {
      if (view.getUint8(off) !== 0xff) break;
      const marker = view.getUint8(off + 1);
      if (marker === 0xda) break; // start of scan — no more metadata
      const size = view.getUint16(off + 2);
      if (marker === 0xe1) {
        const seg = new Uint8Array(buf, off + 4, Math.min(size - 2, view.byteLength - off - 4));
        const head = ascii(seg, 0, 29);
        if (head.startsWith("Exif\0\0")) parseExifGps(new DataView(buf, off + 10), geo);
        else if (head.startsWith("http://ns.adobe.com/xap/1.0/")) xmpHeading ??= parseXmpHeading(seg);
      }
      off += 2 + size;
    }

    if (geo.heading === undefined && xmpHeading !== undefined) geo.heading = xmpHeading;
    return geo;
  } catch {
    return {}; // metadata is a bonus, never a blocker
  }
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < Math.min(to, bytes.length); i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// ── EXIF: TIFF → IFD0 → GPS IFD → lat/lng/heading ───────────────────────────
function parseExifGps(tiff: DataView, geo: CaptureGeo) {
  const le = tiff.getUint16(0) === 0x4949; // 'II' little-endian, 'MM' big-endian
  const u16 = (o: number) => tiff.getUint16(o, le);
  const u32 = (o: number) => tiff.getUint32(o, le);
  const rational = (o: number) => {
    const d = u32(o + 4);
    return d ? u32(o) / d : 0;
  };

  // IFD0: find the GPS IFD pointer (tag 0x8825).
  let gpsIfd = 0;
  const ifd0 = u32(4);
  const n = u16(ifd0);
  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (u16(e) === 0x8825) { gpsIfd = u32(e + 8); break; }
  }
  if (!gpsIfd || gpsIfd + 2 > tiff.byteLength) return;

  let latRef = "N", lngRef = "E", lat: number | undefined, lng: number | undefined;
  const gn = u16(gpsIfd);
  for (let i = 0; i < gn; i++) {
    const e = gpsIfd + 2 + i * 12;
    const tag = u16(e);
    const valOff = u32(e + 8); // rationals never fit inline (count 1 = 8 bytes)
    if (tag === 0x0001) latRef = String.fromCharCode(tiff.getUint8(e + 8));
    else if (tag === 0x0003) lngRef = String.fromCharCode(tiff.getUint8(e + 8));
    else if (tag === 0x0002 && valOff + 24 <= tiff.byteLength)
      lat = rational(valOff) + rational(valOff + 8) / 60 + rational(valOff + 16) / 3600;
    else if (tag === 0x0004 && valOff + 24 <= tiff.byteLength)
      lng = rational(valOff) + rational(valOff + 8) / 60 + rational(valOff + 16) / 3600;
    else if (tag === 0x0011 && valOff + 8 <= tiff.byteLength)
      geo.heading = rational(valOff); // GPSImgDirection
  }
  if (lat !== undefined && lng !== undefined && (lat !== 0 || lng !== 0)) {
    geo.lat = latRef === "S" ? -lat : lat;
    geo.lng = lngRef === "W" ? -lng : lng;
  }
}

// ── XMP: heading from PoseHeadingDegrees (GPano) or GimbalYawDegree (DJI) ───
function parseXmpHeading(seg: Uint8Array): number | undefined {
  const xml = new TextDecoder("utf-8", { fatal: false }).decode(seg);
  for (const re of [
    /PoseHeadingDegrees(?:="|>)([+-]?\d+(?:\.\d+)?)/,
    /GimbalYawDegree(?:="|>)([+-]?\d+(?:\.\d+)?)/,
  ]) {
    const m = xml.match(re);
    if (m) {
      const deg = parseFloat(m[1]);
      if (Number.isFinite(deg)) return ((deg % 360) + 360) % 360; // DJI yaw can be negative
    }
  }
  return undefined;
}
