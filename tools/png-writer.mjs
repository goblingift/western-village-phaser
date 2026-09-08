// Minimal dependency-free PNG encoder (Node built-ins only: zlib + Buffer).
//
// Purpose: Phase 73 needs to write real, valid PNG files (the placeholder
// terrain tileset) without adding any new npm dependency (no `sharp`,
// `pngjs`, `canvas`, etc. are installed in this project, and the phase brief
// asks for "no new npm dependencies unless trivial"). This is a tiny,
// spec-minimal 8-bit RGBA PNG writer - one IHDR + one IDAT (zlib-deflated,
// filter type 0/"None" per scanline) + one IEND chunk. It is NOT a general
// PNG library; it only supports what this tool needs (24/32-bit RGBA pixel
// buffers). Kept here (rather than inline in each generator script) so any
// future placeholder-generation script in this `tools/` directory can reuse
// it without duplicating CRC32/chunk-framing logic.

import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

/**
 * Encodes an RGBA pixel buffer (Uint8Array/Buffer, length = width*height*4,
 * row-major, top-to-bottom) into a PNG file buffer.
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `encodePng: pixel buffer length ${rgba.length} does not match ${width}x${height}x4 = ${width * height * 4}`,
    );
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method
  const ihdr = chunk('IHDR', ihdrData);

  // Each scanline is prefixed with a filter-type byte (0 = None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const srcStart = y * stride;
    const dstStart = y * (stride + 1);
    raw[dstStart] = 0;
    rgba.copy ? rgba.copy(raw, dstStart + 1, srcStart, srcStart + stride) : raw.set(rgba.subarray(srcStart, srcStart + stride), dstStart + 1);
  }

  const compressed = deflateSync(raw, { level: 9 });
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Phase 74 (buildings atlas): tiny reusable RGBA canvas helper so placeholder-
 * generation scripts don't each hand-roll their own row/stride pixel-index
 * math. Deliberately minimal - just enough to fill rects and set individual
 * pixels - not a general drawing library.
 */
export function createRgbaBuffer(width, height) {
  return {
    width,
    height,
    data: Buffer.alloc(width * height * 4),
  };
}

export function setPixel(buf, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) {
    return;
  }
  const idx = (y * buf.width + x) * 4;
  buf.data[idx] = r;
  buf.data[idx + 1] = g;
  buf.data[idx + 2] = b;
  buf.data[idx + 3] = a;
}

export function fillRect(buf, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      setPixel(buf, xx, yy, color);
    }
  }
}

/**
 * Reads back just the width/height of a PNG file (from its IHDR chunk),
 * without needing to decode pixel data. Used by the dimension-verification
 * tool so it doesn't need a PNG-decoding dependency either.
 */
export function readPngDimensions(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 8 + 8 + 13 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error('Not a valid PNG file (bad signature).');
  }
  // IHDR is always the first chunk, immediately after the signature:
  // 4 bytes length + 4 bytes 'IHDR' + 13 bytes data + 4 bytes CRC.
  const ihdrType = buffer.subarray(12, 16).toString('ascii');
  if (ihdrType !== 'IHDR') {
    throw new Error(`Expected IHDR as first chunk, found "${ihdrType}".`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}
