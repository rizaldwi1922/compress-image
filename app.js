import { compressImage, humanFileSize, makeOutputName } from "./compressor.js";
import { createZip } from "./zip.js";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const state = {
  mimeType: "image/webp",
  items: new Map(),
  zipUrl: null,
  zipSignature: "",
  zipToken: null,
};

const elements = {
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  queue: document.querySelector("#queue"),
  workspace: document.querySelector(".workspace-panel"),
  template: document.querySelector("#queue-item-template"),
  targetSize: document.querySelector("#target-size"),
  targetUnit: document.querySelector("#target-unit"),
  maxDimension: document.querySelector("#max-dimension"),
  minQuality: document.querySelector("#min-quality"),
  minQualityValue: document.querySelector("#min-quality-value"),
  formatButtons: [...document.querySelectorAll(".format-button")],
  batchActions: document.querySelector("#batch-actions"),
  batchSummary: document.querySelector("#batch-summary"),
  downloadAll: document.querySelector("#download-all"),
};

function optionsFromUI() {
  const amount = Math.max(1, Number(elements.targetSize.value) || 1000);
  return {
    targetBytes: Math.round(amount * Number(elements.targetUnit.value)),
    mimeType: state.mimeType,
    maxDimension: Math.max(320, Number(elements.maxDimension.value) || 4096),
    minQuality: Number(elements.minQuality.value) / 100,
  };
}

function setQueueVisibility() {
  elements.workspace.classList.toggle("has-files", state.items.size > 0);
  updateBatchActions();
}

function completedItems() {
  return [...state.items.values()].filter((entry) => entry.resultBlob && entry.outputName);
}

function disableBatchDownload(label = "Unduh semua") {
  elements.downloadAll.classList.add("disabled");
  elements.downloadAll.setAttribute("aria-disabled", "true");
  elements.downloadAll.removeAttribute("href");
  elements.downloadAll.querySelector("span").textContent = label;
}

function revokeBatchZip() {
  if (state.zipUrl) URL.revokeObjectURL(state.zipUrl);
  state.zipUrl = null;
  state.zipSignature = "";
}

async function prepareBatchZip(ready) {
  const signature = ready
    .map((entry) => `${entry.outputName}:${entry.resultBlob.size}:${entry.resultUrl}`)
    .join("|");
  if (state.zipUrl && state.zipSignature === signature) return;

  const token = Symbol("zip-generation");
  state.zipToken = token;
  disableBatchDownload("Menyiapkan ZIP…");

  try {
    const zipBlob = await createZip(
      ready.map((entry) => ({ name: entry.outputName, blob: entry.resultBlob })),
    );
    if (state.zipToken !== token) return;

    revokeBatchZip();
    state.zipUrl = URL.createObjectURL(zipBlob);
    state.zipSignature = signature;
    elements.downloadAll.href = state.zipUrl;
    elements.downloadAll.download = `ringkas-${ready.length}-gambar.zip`;
    elements.downloadAll.classList.remove("disabled");
    elements.downloadAll.setAttribute("aria-disabled", "false");
    elements.downloadAll.querySelector("span").textContent = `Unduh semua (${ready.length})`;
  } catch {
    if (state.zipToken === token) {
      disableBatchDownload("Gagal membuat ZIP");
      elements.batchSummary.textContent = "Coba hapus satu file lalu unggah kembali.";
    }
  }
}

function updateBatchActions() {
  const completed = completedItems();
  const processing = [...state.items.values()].filter((entry) => entry.processing).length;
  elements.batchActions.hidden = state.items.size < 2;
  elements.batchSummary.textContent = processing
    ? `${completed.length} siap • ${processing} sedang diproses`
    : `${completed.length} file siap diunduh`;

  if (completed.length < 2) {
    state.zipToken = null;
    revokeBatchZip();
    disableBatchDownload();
  } else {
    prepareBatchZip(completed);
  }
}

function showError(file, message) {
  const fragment = elements.template.content.cloneNode(true);
  const item = fragment.querySelector(".queue-item");
  item.classList.add("error");
  fragment.querySelector(".file-name").textContent = file.name;
  fragment.querySelector(".file-meta").textContent = humanFileSize(file.size);
  fragment.querySelector(".status-text").textContent = message;
  fragment.querySelector(".progress-bar").style.width = "100%";
  const id = crypto.randomUUID();
  item.dataset.id = id;
  fragment.querySelector(".remove-button").addEventListener("click", () => removeItem(id));
  state.items.set(id, { node: item, processing: false });
  elements.queue.append(fragment);
  setQueueVisibility();
}

async function addFile(file) {
  if (!file.type.startsWith("image/")) {
    showError(file, "Format file tidak didukung.");
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError(file, "Ukuran file melebihi batas 100 MB.");
    return;
  }

  const id = crypto.randomUUID();
  const fragment = elements.template.content.cloneNode(true);
  const item = fragment.querySelector(".queue-item");
  const thumb = fragment.querySelector(".thumb");
  const progress = fragment.querySelector(".progress-bar");
  const status = fragment.querySelector(".status-text");
  const resultInfo = fragment.querySelector(".result-info");
  const previewUrl = URL.createObjectURL(file);

  item.dataset.id = id;
  thumb.src = previewUrl;
  fragment.querySelector(".file-name").textContent = file.name;
  fragment.querySelector(".file-meta").textContent = humanFileSize(file.size);
  fragment.querySelector(".remove-button").addEventListener("click", () => removeItem(id));

  state.items.set(id, { node: item, previewUrl, resultUrl: null, resultBlob: null, outputName: null, processing: true });
  elements.queue.append(fragment);
  setQueueVisibility();

  try {
    const options = optionsFromUI();
    const result = await compressImage(file, options, (percent, message) => {
      progress.style.width = `${percent}%`;
      status.textContent = message;
    });

    if (!state.items.has(id)) return;
    const resultUrl = URL.createObjectURL(result.blob);
    const entry = state.items.get(id);
    entry.resultUrl = resultUrl;
    entry.resultBlob = result.blob;
    entry.outputName = makeOutputName(file.name, options.mimeType);
    entry.processing = false;
    const saving = Math.max(0, Math.round((1 - result.blob.size / file.size) * 100));

    resultInfo.hidden = false;
    resultInfo.querySelector(".saving-badge").textContent = saving > 0 ? `−${saving}%` : "Dikonversi";
    resultInfo.querySelector(".result-size").textContent = humanFileSize(result.blob.size);
    resultInfo.querySelector(".result-dimension").textContent = `${result.width} × ${result.height}px • ${Math.round(result.quality * 100)}% kualitas`;
    status.textContent = result.targetMet ? "Siap diunduh" : "Hasil terbaik; target terlalu kecil";
    const downloadLink = resultInfo.querySelector(".download-button");
    downloadLink.href = resultUrl;
    downloadLink.download = entry.outputName;
    updateBatchActions();
  } catch (error) {
    item.classList.add("error");
    progress.style.width = "100%";
    status.textContent = error instanceof Error ? error.message : "Gagal memproses gambar.";
    const entry = state.items.get(id);
    if (entry) entry.processing = false;
    updateBatchActions();
  }
}

function removeItem(id) {
  const entry = state.items.get(id);
  if (!entry) return;
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  if (entry.resultUrl) URL.revokeObjectURL(entry.resultUrl);
  entry.node.remove();
  state.items.delete(id);
  setQueueVisibility();
}

function addFiles(fileList) {
  [...fileList].forEach(addFile);
  elements.fileInput.value = "";
}

elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});
elements.fileInput.addEventListener("change", () => addFiles(elements.fileInput.files));

["dragenter", "dragover"].forEach((type) => {
  elements.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach((type) => {
  elements.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
  });
});
elements.dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

elements.formatButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.mimeType = button.dataset.format;
    elements.formatButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  });
});

elements.minQuality.addEventListener("input", () => {
  elements.minQualityValue.textContent = `${elements.minQuality.value}%`;
});

window.addEventListener("beforeunload", () => {
  revokeBatchZip();
  state.items.forEach((entry) => {
    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    if (entry.resultUrl) URL.revokeObjectURL(entry.resultUrl);
  });
});
