import test from "node:test";
import assert from "node:assert/strict";
import { fitDimensions, humanFileSize, makeOutputName, outputExtension } from "./compressor.js";

test("fitDimensions preserves aspect ratio when reducing a landscape image", () => {
  assert.deepEqual(fitDimensions(8000, 4000, 4000), { width: 4000, height: 2000 });
});

test("fitDimensions leaves a smaller image untouched", () => {
  assert.deepEqual(fitDimensions(1200, 800, 4096), { width: 1200, height: 800 });
});

test("humanFileSize formats common values", () => {
  assert.equal(humanFileSize(1024), "1.0 KB");
  assert.equal(humanFileSize(1024 * 1024), "1.00 MB");
});

test("output naming replaces the original extension", () => {
  assert.equal(makeOutputName("foto.liburan.JPG", "image/webp"), "foto.liburan-ringkas.webp");
  assert.equal(outputExtension("image/jpeg"), "jpg");
});
