// Minimal store-only (uncompressed) ZIP writer with CRC-32. No dependencies.
// GLBs barely deflate anyway, so "stored" keeps this tiny and fast.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * files: [{ name: string, data: Uint8Array | ArrayBuffer | string }]
 * returns a Uint8Array containing the whole archive.
 */
export function zipStore(files, when = new Date()) {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(when);
  const entries = files.map((f) => {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    return { name: enc.encode(f.name), data, crc: crc32(data) };
  });
  let localSize = 0, centralSize = 0;
  for (const e of entries) { localSize += 30 + e.name.length + e.data.length; centralSize += 46 + e.name.length; }
  const out = new Uint8Array(localSize + centralSize + 22);
  const dv = new DataView(out.buffer);
  let o = 0;
  const u16 = (v) => { dv.setUint16(o, v, true); o += 2; };
  const u32 = (v) => { dv.setUint32(o, v >>> 0, true); o += 4; };
  const bytes = (b) => { out.set(b, o); o += b.length; };
  const FLAGS = 0x0800; // names are UTF-8
  for (const e of entries) {
    e.offset = o;
    u32(0x04034b50); u16(20); u16(FLAGS); u16(0); u16(time); u16(date);
    u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0);
    bytes(e.name); bytes(e.data);
  }
  const cdStart = o;
  for (const e of entries) {
    u32(0x02014b50); u16(20); u16(20); u16(FLAGS); u16(0); u16(time); u16(date);
    u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); u16(0);
    u16(0); u16(0); u32(0); u32(e.offset);
    bytes(e.name);
  }
  const cdSize = o - cdStart;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length);
  u32(cdSize); u32(cdStart); u16(0);
  return out;
}
