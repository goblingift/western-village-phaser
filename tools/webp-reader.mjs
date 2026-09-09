// Dependency-free WebP header reader (Phase 90), the WebP counterpart to
// png-writer.mjs's readPngDimensions - the verification tools need image
// dimensions, and every shipped art file is now WebP rather than PNG.
//
// Read-only on purpose: we never WRITE WebP from Node (that needs a real
// encoder). Encoding happens once, offline, in
// tools/asset_generation/convert_to_webp.py via Pillow.
//
// Covers all three container shapes the spec defines, because Pillow emits
// different ones depending on the source: VP8X (extended - what an RGBA
// lossy file with an alpha plane produces, i.e. all of our sprites), VP8L
// (lossless) and VP8 (simple lossy, no alpha).

/**
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number, format: 'VP8X' | 'VP8L' | 'VP8 ' }}
 */
export function readWebpDimensions(buffer) {
  if (buffer.length < 16) {
    throw new Error('Not a valid WebP file (too short).');
  }
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error('Not a valid WebP file (bad RIFF/WEBP signature).');
  }

  const chunkType = buffer.subarray(12, 16).toString('ascii');

  if (chunkType === 'VP8X') {
    // Extended format: 24-bit little-endian (canvas width - 1) at byte 24,
    // (canvas height - 1) immediately after.
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height, format: 'VP8X' };
  }

  if (chunkType === 'VP8L') {
    // Lossless: 1 signature byte (0x2f) then 14 bits width-1, 14 bits height-1.
    const bits = buffer.readUInt32LE(21);
    const width = 1 + (bits & 0x3fff);
    const height = 1 + ((bits >> 14) & 0x3fff);
    return { width, height, format: 'VP8L' };
  }

  if (chunkType === 'VP8 ') {
    // Simple lossy: 3-byte frame tag + 3-byte start code, then 14-bit
    // width/height (top 2 bits of each 16-bit field are a scaling hint).
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height, format: 'VP8 ' };
  }

  throw new Error(`Unsupported WebP chunk type "${chunkType}" (expected VP8X, VP8L or "VP8 ").`);
}
