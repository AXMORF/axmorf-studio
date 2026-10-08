import { inflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export const referencePngCrc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

// Validate the small RGB PNG emitted by the pinned encoder, including chunk
// CRCs and bounded inflation. A header/checksum alone cannot prove a readable PNG.
export const validateReferencePreviewPng = (
  bytes: Buffer,
  expected: { width: number; height: number },
) => {
  if (
    bytes.length > 2_000_000 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error("Reference preview is not a bounded PNG.");
  let offset = 8,
    header = false,
    ended = false;
  const compressed: Buffer[] = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length)
      throw new Error("Reference PNG is truncated.");
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const end = offset + length + 12;
    if (
      end > bytes.length ||
      bytes.readUInt32BE(end - 4) !==
        referencePngCrc32(bytes.subarray(offset + 4, end - 4))
    )
      throw new Error("Reference PNG chunk checksum is invalid.");
    const content = bytes.subarray(offset + 8, end - 4);
    if (!header && type !== "IHDR")
      throw new Error("Reference PNG has no initial header.");
    if (type === "IHDR") {
      if (
        header ||
        length !== 13 ||
        content.readUInt32BE(0) !== expected.width ||
        content.readUInt32BE(4) !== expected.height ||
        content[8] !== 8 ||
        content[9] !== 2 ||
        content[10] !== 0 ||
        content[11] !== 0 ||
        content[12] !== 0
      )
        throw new Error("Reference PNG geometry or RGB encoding is invalid.");
      header = true;
    } else if (type === "IDAT") compressed.push(content);
    else if (type === "IEND") {
      if (length !== 0 || end !== bytes.length)
        throw new Error("Reference PNG has unsafe trailing bytes.");
      ended = true;
    } else if (type[0].toUpperCase() === type[0])
      throw new Error("Reference PNG has an unsupported critical chunk.");
    offset = end;
  }
  if (!header || !ended || compressed.length === 0)
    throw new Error("Reference PNG is incomplete.");
  const stride = expected.width * 3 + 1;
  const expectedLength = stride * expected.height;
  let pixels: Buffer;
  try {
    pixels = inflateSync(Buffer.concat(compressed), {
      maxOutputLength: expectedLength + 1,
    });
  } catch (error) {
    throw new Error(
      "Reference PNG compressed data is invalid or exceeds its bound.",
      { cause: error },
    );
  }
  if (pixels.length !== expectedLength)
    throw new Error("Reference PNG pixel data is incomplete.");
  for (let row = 0; row < expected.height; row++)
    if (pixels[row * stride] > 4)
      throw new Error("Reference PNG row filter is invalid.");
};
