export type InspectedImage = Readonly<{
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
}>;

const uint16be = (bytes: Uint8Array, offset: number) =>
  (bytes[offset]! << 8) | bytes[offset + 1]!;

const uint24le = (bytes: Uint8Array, offset: number) =>
  bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);

const uint32be = (bytes: Uint8Array, offset: number) =>
  (bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!) >>>
  0;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.slice(start, end));

const inspectPng = (bytes: Uint8Array): InspectedImage | null => {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    signature.some((value, index) => bytes[index] !== value)
  ) {
    return null;
  }
  if (ascii(bytes, 12, 16) !== "IHDR") {
    throw new Error("PNG image is missing its IHDR dimensions.");
  }
  const width = uint32be(bytes, 16);
  const height = uint32be(bytes, 20);
  if (width === 0 || height === 0)
    throw new Error("PNG dimensions are invalid.");
  return { mimeType: "image/png", extension: "png", width, height };
};

const inspectJpeg = (bytes: Uint8Array): InspectedImage | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = uint16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) {
      throw new Error("JPEG segment length is invalid.");
    }
    if (startOfFrame.has(marker)) {
      if (length < 7) throw new Error("JPEG dimensions are missing.");
      const height = uint16be(bytes, offset + 3);
      const width = uint16be(bytes, offset + 5);
      if (width === 0 || height === 0) {
        throw new Error("JPEG dimensions are invalid.");
      }
      return { mimeType: "image/jpeg", extension: "jpg", width, height };
    }
    offset += length;
  }
  throw new Error("JPEG image has no supported frame dimensions.");
};

const inspectWebp = (bytes: Uint8Array): InspectedImage | null => {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const kind = ascii(bytes, 12, 16);
  let width: number;
  let height: number;
  if (kind === "VP8X") {
    width = uint24le(bytes, 24) + 1;
    height = uint24le(bytes, 27) + 1;
  } else if (kind === "VP8L") {
    if (bytes[20] !== 0x2f) throw new Error("WebP lossless header is invalid.");
    const packed =
      bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    width = (packed & 0x3fff) + 1;
    height = ((packed >>> 14) & 0x3fff) + 1;
  } else if (kind === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      throw new Error("WebP lossy frame header is invalid.");
    }
    width = uint16be(Uint8Array.of(bytes[27]!, bytes[26]!), 0) & 0x3fff;
    height = uint16be(Uint8Array.of(bytes[29]!, bytes[28]!), 0) & 0x3fff;
  } else {
    throw new Error("WebP image uses an unsupported frame header.");
  }
  if (width === 0 || height === 0)
    throw new Error("WebP dimensions are invalid.");
  return { mimeType: "image/webp", extension: "webp", width, height };
};

export const inspectImageBytes = (bytes: Uint8Array): InspectedImage => {
  const inspected =
    inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes);
  if (inspected === null) {
    throw new Error(
      "Candidate file is not a supported JPEG PNG or WebP image.",
    );
  }
  return inspected;
};
