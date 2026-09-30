const DEFAULT_OPTIONS = Object.freeze({
  targetBytes: 1_024_000,
  mimeType: "image/webp",
  maxDimension: 4096,
  minQuality: 0.55,
  maxPasses: 9,
});

export function fitDimensions(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function humanFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 2 : 1)} MB`;
}

export function outputExtension(mimeType) {
  return { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }[mimeType] || "img";
}

export function makeOutputName(inputName, mimeType) {
  const base = inputName.replace(/\.[^.]+$/, "") || "gambar";
  return `${base}-ringkas.${outputExtension(mimeType)}`;
}

export async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Some older browsers reject the options object; try their basic API.
      return createImageBitmap(file);
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gambar tidak dapat dibaca oleh browser ini."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Format hasil tidak didukung browser ini."))),
      mimeType,
      quality,
    );
  });
}

function renderToCanvas(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function findBestQuality(canvas, mimeType, targetBytes, minQuality) {
  if (mimeType === "image/png") {
    const blob = await canvasToBlob(canvas, mimeType);
    return { blob, quality: 1 };
  }

  // Encode the cheapest acceptable version first. If it is still too large,
  // there is no value in doing several expensive high-quality encodes at the
  // current resolution; the caller can immediately reduce the dimensions.
  const minimumBlob = await canvasToBlob(canvas, mimeType, minQuality);
  if (minimumBlob.size > targetBytes) {
    return { blob: minimumBlob, quality: minQuality, fits: false };
  }

  let low = minQuality;
  let high = 0.96;
  let bestUnder = { blob: minimumBlob, quality: minQuality };

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToBlob(canvas, mimeType, quality);
    const candidate = { blob, quality };

    if (blob.size <= targetBytes) {
      bestUnder = candidate;
      low = quality;
    } else {
      high = quality;
    }
  }

  return { ...bestUnder, fits: true };
}

export async function compressImage(file, options = {}, onProgress = () => {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    throw new Error("File ini bukan gambar yang didukung.");
  }

  onProgress(5, "Membaca gambar…");
  const source = await decodeImage(file);
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  let dimensions = fitDimensions(sourceWidth, sourceHeight, config.maxDimension);
  let bestResult = null;

  try {
    for (let pass = 0; pass < config.maxPasses; pass += 1) {
      const progress = 12 + Math.round((pass / config.maxPasses) * 78);
      onProgress(progress, pass ? "Menyesuaikan resolusi…" : "Mencari kualitas terbaik…");

      const canvas = renderToCanvas(source, dimensions.width, dimensions.height);
      const result = await findBestQuality(
        canvas,
        config.mimeType,
        config.targetBytes,
        config.minQuality,
      );
      const candidate = { ...result, ...dimensions };

      if (!bestResult || candidate.blob.size < bestResult.blob.size) bestResult = candidate;
      if (result.fits || result.blob.size <= config.targetBytes) {
        onProgress(100, "Selesai");
        return {
          ...candidate,
          originalWidth: sourceWidth,
          originalHeight: sourceHeight,
          targetMet: true,
        };
      }

      const ratio = Math.sqrt(config.targetBytes / result.blob.size);
      const scale = Math.min(0.9, Math.max(0.62, ratio * 0.96));
      const nextWidth = Math.max(320, Math.round(dimensions.width * scale));
      const nextHeight = Math.max(1, Math.round(dimensions.height * (nextWidth / dimensions.width)));

      if (nextWidth === dimensions.width || nextHeight === dimensions.height) break;
      dimensions = { width: nextWidth, height: nextHeight };
    }
  } finally {
    if (typeof source.close === "function") source.close();
  }

  onProgress(100, "Selesai — target belum tercapai");
  return {
    ...bestResult,
    originalWidth: sourceWidth,
    originalHeight: sourceHeight,
    targetMet: bestResult.blob.size <= config.targetBytes,
  };
}
