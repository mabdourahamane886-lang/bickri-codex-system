import { deflateRawSync, inflateRawSync } from "node:zlib";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
export function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function makeZip(files: Array<{ name: string; data: string | Buffer }>) {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name.replace(/^\/+/, ""), "utf8");
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
export function readZip(buffer: Buffer, maxFiles = 80) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Archive ZIP invalide.");
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  if (count > maxFiles) throw new Error("Archive contenant trop de fichiers.");
  const result = new Map<string, Buffer>();
  let totalUncompressed = 0;
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Répertoire ZIP invalide.");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLen);
    cursor += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Entrée ZIP invalide.");
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buffer.subarray(start, start + compressedSize);
    const data = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 25 * 1024 * 1024 }) : null;
    if (!data) throw new Error("Méthode de compression XLSX non prise en charge.");
    totalUncompressed += data.length;
    if (data.length > 25 * 1024 * 1024 || totalUncompressed > 35 * 1024 * 1024) throw new Error("Archive XLSX trop volumineuse après décompression.");
    result.set(name, data);
  }
  return result;
}
