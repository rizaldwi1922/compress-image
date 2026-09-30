const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function uniqueNames(files) {
  const used = new Set();
  return files.map((file) => {
    const original = file.name.replace(/[\\/:*?"<>|]/g, "-");
    const dot = original.lastIndexOf(".");
    const base = dot > 0 ? original.slice(0, dot) : original;
    const extension = dot > 0 ? original.slice(dot) : "";
    let name = original;
    let counter = 2;
    while (used.has(name.toLowerCase())) name = `${base}-${counter++}${extension}`;
    used.add(name.toLowerCase());
    return { ...file, name };
  });
}

function localHeader(nameBytes, bytes, checksum, date, time) {
  const buffer = new ArrayBuffer(30 + nameBytes.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, checksum, true);
  view.setUint32(18, bytes.length, true);
  view.setUint32(22, bytes.length, true);
  view.setUint16(26, nameBytes.length, true);
  new Uint8Array(buffer, 30).set(nameBytes);
  return new Uint8Array(buffer);
}

function centralHeader(nameBytes, bytes, checksum, date, time, offset) {
  const buffer = new ArrayBuffer(46 + nameBytes.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, checksum, true);
  view.setUint32(20, bytes.length, true);
  view.setUint32(24, bytes.length, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint32(42, offset, true);
  new Uint8Array(buffer, 46).set(nameBytes);
  return new Uint8Array(buffer);
}

function endRecord(fileCount, centralSize, centralOffset) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return new Uint8Array(buffer);
}

export async function createZip(files) {
  if (!files.length) throw new Error("Tidak ada file untuk dimasukkan ke ZIP.");
  if (files.length > 65_535) throw new Error("Terlalu banyak file untuk satu ZIP.");

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of uniqueNames(files)) {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = encoder.encode(file.name);
    const checksum = crc32(bytes);
    const { date, time } = dosDateTime();
    const header = localHeader(nameBytes, bytes, checksum, date, time);
    localParts.push(header, bytes);
    centralParts.push(centralHeader(nameBytes, bytes, checksum, date, time, offset));
    offset += header.length + bytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  return new Blob(
    [...localParts, ...centralParts, endRecord(files.length, centralSize, offset)],
    { type: "application/zip" },
  );
}

export { crc32, uniqueNames };
