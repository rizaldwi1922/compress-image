import test from "node:test";
import assert from "node:assert/strict";
import { crc32, createZip, uniqueNames } from "./zip.js";

test("crc32 produces the standard checksum", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("duplicate output names receive a numeric suffix", () => {
  const files = uniqueNames([{ name: "foto.webp" }, { name: "foto.webp" }]);
  assert.deepEqual(files.map((file) => file.name), ["foto.webp", "foto-2.webp"]);
});

test("createZip creates a valid ZIP envelope", async () => {
  const zip = await createZip([
    { name: "satu.txt", blob: new Blob(["satu"]) },
    { name: "dua.txt", blob: new Blob(["dua"]) },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(bytes.buffer).getUint32(bytes.length - 22, true), 0x06054b50);
});
