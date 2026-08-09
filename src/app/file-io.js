function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function assertExcelFileWithinSafeLimit(file) {
  if (!file || file.size <= EXCEL_SAFE_READ_MAX_BYTES) return;
  throw new Error(
    `Excel 文件过大（${formatBytes(file.size)}）。当前安全模式上限为 ${formatBytes(EXCEL_SAFE_READ_MAX_BYTES)}，请先另存为 CSV/JSONL，或使用后续流式版本处理超大 Excel。`,
  );
}

function isXlsxFile(file) {
  return /\.xlsx$/i.test(file?.name || "");
}

async function buildXlsxZipIndex(file) {
  if (!file || file.size < 22) return null;
  const tailLength = Math.min(file.size, 66000);
  const tailStart = file.size - tailLength;
  const tailBuffer = await file.slice(tailStart).arrayBuffer();
  const tailView = new DataView(tailBuffer);
  let eocdOffset = -1;
  for (let offset = tailLength - 22; offset >= 0; offset -= 1) {
    if (tailView.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) return null;
  const centralDirectorySize = tailView.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = tailView.getUint32(eocdOffset + 16, true);
  if (centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error("暂不支持 Zip64 XLSX，请先用 Excel 或 LibreOffice 另存为 CSV");
  }
  if (!centralDirectorySize || centralDirectoryOffset + centralDirectorySize > file.size) return null;

  const directoryBuffer = await file.slice(centralDirectoryOffset, centralDirectoryOffset + centralDirectorySize).arrayBuffer();
  const directoryView = new DataView(directoryBuffer);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map();
  let offset = 0;
  while (offset + 46 <= directoryBuffer.byteLength) {
    if (directoryView.getUint32(offset, true) !== 0x02014b50) break;
    const compressionMethod = directoryView.getUint16(offset + 10, true);
    const compressedSize = directoryView.getUint32(offset + 20, true);
    const uncompressedSize = directoryView.getUint32(offset + 24, true);
    const fileNameLength = directoryView.getUint16(offset + 28, true);
    const extraLength = directoryView.getUint16(offset + 30, true);
    const commentLength = directoryView.getUint16(offset + 32, true);
    const localHeaderOffset = directoryView.getUint32(offset + 42, true);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error("暂不支持 Zip64 XLSX，请先用 Excel 或 LibreOffice 另存为 CSV");
    }
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > directoryBuffer.byteLength) return null;
    const name = decoder.decode(new Uint8Array(directoryBuffer, nameStart, fileNameLength));
    entries.set(name, { name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset = nameEnd + extraLength + commentLength;
  }
  return entries;
}

async function readXlsxZipEntryUncompressedSize(file, entryName) {
  const entries = await buildXlsxZipIndex(file);
  if (!entries) return null;
  return entries.get(entryName)?.uncompressedSize ?? null;
}

async function readXlsxZipEntryBuffer(file, entries, entryName) {
  const entry = entries?.get(entryName);
  if (!entry) return null;
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new Error(`暂不支持 XLSX 内部压缩方式：${entry.compressionMethod}`);
  }
  const localHeaderBuffer = await file.slice(entry.localHeaderOffset, entry.localHeaderOffset + 30).arrayBuffer();
  const localHeaderView = new DataView(localHeaderBuffer);
  if (localHeaderView.getUint32(0, true) !== 0x04034b50) throw new Error(`XLSX 内部文件头异常：${entryName}`);
  const fileNameLength = localHeaderView.getUint16(26, true);
  const extraLength = localHeaderView.getUint16(28, true);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  return file.slice(dataStart, dataStart + entry.compressedSize).arrayBuffer();
}

async function inflateXlsxEntryText(file, entries, entryName) {
  const entry = entries?.get(entryName);
  if (!entry) return "";
  const buffer = await readXlsxZipEntryBuffer(file, entries, entryName);
  if (!buffer) return "";
  if (entry.compressionMethod === 0) return new TextDecoder("utf-8").decode(buffer);
  if (!window.DecompressionStream) {
    throw new Error("当前浏览器不支持 XLSX 转 CSV 所需的解压接口，请使用新版 Chrome 或 Edge");
  }
  try {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  } catch (error) {
    throw new Error(`解压 XLSX 内部文件失败：${entryName}`);
  }
}

function getXmlAttributes(tag) {
  const attrs = {};
  tag.replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, (_, name, value) => {
    attrs[name] = decodeXmlText(value);
    return "";
  });
  return attrs;
}

function decodeXmlText(value) {
  return String(value == null ? "" : value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16));
      } catch (error) {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 10));
      } catch (error) {
        return "";
      }
    })
    .replace(/&amp;/g, "&");
}

function collectXmlTextNodes(xml) {
  const values = [];
  const textPattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = textPattern.exec(xml))) values.push(decodeXmlText(match[1]));
  return values.join("");
}

function normalizeXlsxPath(basePath, target) {
  const raw = String(target || "").replace(/\\/g, "/");
  const parts = (raw.startsWith("/") ? raw.slice(1) : `${basePath}/${raw}`).split("/");
  const normalized = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
}

function getXlsxFileBaseName(file) {
  return String(file?.name || "workbook").replace(/\.[^.]+$/, "") || "workbook";
}

function getSafeFilenamePart(value) {
  return String(value || "sheet").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 80) || "sheet";
}

function parseXlsxWorkbookSheets(workbookXml, relsXml) {
  const relationships = new Map();
  const relPattern = /<Relationship\b[^>]*>/g;
  let relMatch;
  while ((relMatch = relPattern.exec(relsXml))) {
    const attrs = getXmlAttributes(relMatch[0]);
    if (attrs.Id && attrs.Target) relationships.set(attrs.Id, normalizeXlsxPath("xl", attrs.Target));
  }

  const sheets = [];
  const sheetPattern = /<sheet\b[^>]*>/g;
  let sheetMatch;
  while ((sheetMatch = sheetPattern.exec(workbookXml))) {
    const attrs = getXmlAttributes(sheetMatch[0]);
    const relationshipId = attrs["r:id"] || attrs.id || "";
    const path = relationships.get(relationshipId);
    if (attrs.name && path) sheets.push({ name: attrs.name, relationshipId, path });
  }
  return sheets;
}

function parseXlsxSharedStrings(sharedStringsXml) {
  if (!sharedStringsXml) return [];
  const strings = [];
  const itemPattern = /<si\b[\s\S]*?<\/si>/g;
  let match;
  while ((match = itemPattern.exec(sharedStringsXml))) strings.push(collectXmlTextNodes(match[0]));
  return strings;
}

function getXlsxCellColumnIndex(reference) {
  const letters = String(reference || "").match(/^[A-Z]+/i)?.[0] || "";
  let index = 0;
  for (const letter of letters.toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

function getFirstXmlValue(xml, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`);
  const match = pattern.exec(xml);
  return match ? decodeXmlText(match[1]) : "";
}

function getXlsxCellValue(cellXml, sharedStrings) {
  const openTag = cellXml.match(/^<c\b[^>]*>/)?.[0] || "";
  const attrs = getXmlAttributes(openTag);
  if (attrs.t === "s") {
    const index = Number.parseInt(getFirstXmlValue(cellXml, "v"), 10);
    return Number.isFinite(index) ? sharedStrings[index] || "" : "";
  }
  if (attrs.t === "inlineStr") return collectXmlTextNodes(cellXml);
  const value = getFirstXmlValue(cellXml, "v");
  if (attrs.t === "b") return value === "1" ? "TRUE" : value === "0" ? "FALSE" : value;
  return value;
}

function convertXlsxSheetXmlToCsvParts(sheetXml, sharedStrings) {
  const parts = [];
  const chunk = [];
  const flush = () => {
    if (!chunk.length) return;
    parts.push(chunk.join(""));
    chunk.length = 0;
  };
  const rowPattern = /<row\b[\s\S]*?<\/row>/g;
  let rowMatch;
  let rowCount = 0;
  while ((rowMatch = rowPattern.exec(sheetXml))) {
    const rowXml = rowMatch[0];
    const values = [];
    const cellPattern = /<c\b[\s\S]*?<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowXml))) {
      const cellXml = cellMatch[0];
      const openTag = cellXml.match(/^<c\b[^>]*>/)?.[0] || "";
      const attrs = getXmlAttributes(openTag);
      const columnIndex = getXlsxCellColumnIndex(attrs.r);
      values[columnIndex] = getXlsxCellValue(cellXml, sharedStrings);
    }
    chunk.push(values.map(escapeCsv).join(","), "\r\n");
    rowCount += 1;
    if (chunk.length >= 2000) flush();
  }
  flush();
  return { parts, rowCount };
}

async function assertExcelSharedStringsWithinSafeLimit(file) {
  if (!isXlsxFile(file)) return;
  const sharedStringsSize = await readXlsxZipEntryUncompressedSize(file, "xl/sharedStrings.xml");
  if (!sharedStringsSize || sharedStringsSize <= EXCEL_SHARED_STRINGS_MAX_BYTES) return;
  throw new Error(
    `Excel 共享字符串表过大（sharedStrings.xml 解压后约 ${formatBytes(sharedStringsSize)}）。当前安全模式上限为 ${formatBytes(EXCEL_SHARED_STRINGS_MAX_BYTES)}，请先另存为 CSV/JSONL，或使用后续流式版本处理。`,
  );
}

function delimiterLabel(delimiter) {
  return describeCsvDelimiter(delimiter);
}

function setProgress(progress, label) {
  els.progressBar.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`;
  if (label) els.leftStatus.textContent = label;
}

function resetXlsxConversionOffer() {
  state.xlsxConversion = null;
  els.xlsxConvertActions.hidden = true;
  els.xlsxConvertSheetSelect.innerHTML = "";
  els.xlsxConvertCsvButton.disabled = false;
  els.xlsxConvertStatus.textContent = "";
}

function renderXlsxConversionOffer(context) {
  els.xlsxConvertSheetSelect.innerHTML = "";
  context.sheets.forEach((sheet, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = sheet.name;
    els.xlsxConvertSheetSelect.appendChild(option);
  });
  els.xlsxConvertCsvButton.disabled = !context.sheets.length;
  els.xlsxConvertStatus.textContent = "当前文件未载入表格，可选择 Sheet 直接转换为 CSV。";
  els.xlsxConvertActions.hidden = false;
}

async function buildXlsxConversionContext(file) {
  const entries = await buildXlsxZipIndex(file);
  if (!entries) throw new Error("无法读取 XLSX 压缩目录");
  const workbookXml = await inflateXlsxEntryText(file, entries, "xl/workbook.xml");
  const relsXml = await inflateXlsxEntryText(file, entries, "xl/_rels/workbook.xml.rels");
  const sheets = parseXlsxWorkbookSheets(workbookXml, relsXml);
  if (!sheets.length) throw new Error("没有找到可转换的 Sheet");
  return { file, entries, sheets };
}

async function offerXlsxCsvConversion(file, loadToken) {
  resetXlsxConversionOffer();
  if (!isXlsxFile(file)) return;
  try {
    setProgress(0.04, "读取 XLSX Sheet 列表");
    const context = await buildXlsxConversionContext(file);
    if (!isCurrentLoad(loadToken)) return;
    state.xlsxConversion = context;
    renderXlsxConversionOffer(context);
    setProgress(0, "Excel 可转换为 CSV");
  } catch (error) {
    if (!isCurrentLoad(loadToken)) return;
    els.xlsxConvertStatus.textContent = `CSV 转换准备失败：${error.message}`;
    els.leftStatus.textContent = "Excel 转换准备失败";
  }
}

async function convertSelectedXlsxSheetToCsv() {
  const context = state.xlsxConversion;
  if (!context) return;
  const sheetIndex = Number.parseInt(els.xlsxConvertSheetSelect.value, 10);
  const sheet = context.sheets[sheetIndex];
  if (!sheet) return;

  els.xlsxConvertCsvButton.disabled = true;
  els.xlsxConvertStatus.textContent = "正在读取共享字符串...";
  setProgress(0.15, "读取 sharedStrings.xml");
  try {
    const sharedStringsXml = context.entries.has("xl/sharedStrings.xml")
      ? await inflateXlsxEntryText(context.file, context.entries, "xl/sharedStrings.xml")
      : "";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const sharedStrings = parseXlsxSharedStrings(sharedStringsXml);

    els.xlsxConvertStatus.textContent = `正在读取 ${sheet.name}...`;
    setProgress(0.45, `读取 Sheet：${sheet.name}`);
    const sheetXml = await inflateXlsxEntryText(context.file, context.entries, sheet.path);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    els.xlsxConvertStatus.textContent = "正在生成 CSV...";
    setProgress(0.72, "生成 CSV");
    const { parts, rowCount } = convertXlsxSheetXmlToCsvParts(sheetXml, sharedStrings);
    const filename = `${getSafeFilenamePart(getXlsxFileBaseName(context.file))}-${getSafeFilenamePart(sheet.name)}.csv`;
    await saveTextFile(filename, parts);
    els.xlsxConvertStatus.textContent = `已转换 ${rowCount.toLocaleString()} 行：${filename}`;
    setProgress(1, "CSV 转换完成");
  } catch (error) {
    els.xlsxConvertStatus.textContent = `转换失败：${error.message}`;
    setProgress(0, `CSV 转换失败：${error.message}`);
  } finally {
    els.xlsxConvertCsvButton.disabled = false;
  }
}

function normalizeTextParts(content) {
  return Array.isArray(content) ? content : [content];
}

function downloadText(filename, content, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff", ...normalizeTextParts(content)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadBinaryFile(filename, buffer, mime) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function saveBinaryFile(filename, buffer, mime) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Excel workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([buffer], { type: mime }));
      await writable.close();
      els.leftStatus.textContent = "已导出 XLSX 文件";
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  downloadBinaryFile(filename, buffer, mime);
}

async function openTextFileWritable(filename) {
  if (!window.showSaveFilePicker) return { writable: null, cancelled: false };
  const options = {
    suggestedName: filename,
    types: [
      {
        description: "CSV file",
        accept: { "text/csv": [".csv"] },
      },
    ],
  };
  if (state.sourceFileHandle) options.startIn = state.sourceFileHandle;
  try {
    const handle = await window.showSaveFilePicker(options);
    return { writable: await handle.createWritable(), cancelled: false };
  } catch (error) {
    if (error?.name === "AbortError") return { writable: null, cancelled: true };
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename });
      return { writable: await handle.createWritable(), cancelled: false };
    } catch (fallbackError) {
      if (fallbackError?.name === "AbortError") return { writable: null, cancelled: true };
      throw fallbackError;
    }
  }
}

async function saveTextFile(filename, content, mime = "text/csv;charset=utf-8") {
  const parts = normalizeTextParts(content);
  if (window.showSaveFilePicker) {
    const options = {
      suggestedName: filename,
      types: [
        {
          description: "CSV file",
          accept: { "text/csv": [".csv"] },
        },
      ],
    };
    if (state.sourceFileHandle) options.startIn = state.sourceFileHandle;
    try {
      const handle = await window.showSaveFilePicker(options);
      const writable = await handle.createWritable();
      await writable.write(new Blob(["\ufeff", ...parts], { type: mime }));
      await writable.close();
      els.leftStatus.textContent = "已导出文件";
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename });
        const writable = await handle.createWritable();
        await writable.write(new Blob(["\ufeff", ...parts], { type: mime }));
        await writable.close();
        els.leftStatus.textContent = "已导出文件";
        return;
      } catch (fallbackError) {
        if (fallbackError && fallbackError.name === "AbortError") return;
      }
    }
  }
  downloadText(filename, parts, mime);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPlainClipboardCell(value) {
  const text = String(value == null ? "" : value);
  if (!/[\t\r\n"]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function showToast(message, options = {}) {
  const toast = document.createElement("div");
  toast.className = `toast${options.tone === "error" ? " error" : ""}`;
  const text = document.createElement("span");
  text.className = "toast-message";
  text.textContent = message;
  toast.appendChild(text);

  const configuredDuration = Number(options.duration);
  let remaining = Number.isFinite(configuredDuration)
    ? Math.max(0, configuredDuration)
    : options.tone === "error" ? 7000 : 3200;
  let timer = 0;
  let timerStartedAt = 0;
  let pausedForPointer = false;
  let pausedForFocus = false;
  let dismissed = false;

  const clearTimer = (updateRemaining = true) => {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = 0;
    if (updateRemaining) remaining = Math.max(0, remaining - (performance.now() - timerStartedAt));
  };

  const shouldPauseTimer = () => document.hidden || pausedForPointer || pausedForFocus;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimer(false);
    document.removeEventListener("visibilitychange", syncTimer);
    toast.classList.add("dismissing");
    const remove = () => toast.remove();
    toast.addEventListener("transitionend", remove, { once: true });
    window.setTimeout(remove, 220);
  };

  const startTimer = () => {
    if (dismissed || timer || shouldPauseTimer()) return;
    if (remaining <= 0) {
      dismiss();
      return;
    }
    timerStartedAt = performance.now();
    timer = window.setTimeout(() => {
      timer = 0;
      remaining = 0;
      dismiss();
    }, remaining);
  };

  function syncTimer() {
    if (shouldPauseTimer()) clearTimer();
    else startTimer();
  }

  const pauseForPointer = () => {
    pausedForPointer = true;
    syncTimer();
  };
  const resumeForPointer = () => {
    pausedForPointer = false;
    syncTimer();
  };
  const pauseForFocus = () => {
    pausedForFocus = true;
    syncTimer();
  };
  const resumeForFocus = (event) => {
    pausedForFocus = Boolean(event.relatedTarget && toast.contains(event.relatedTarget));
    syncTimer();
  };

  document.addEventListener("visibilitychange", syncTimer);
  toast.addEventListener("pointerenter", pauseForPointer);
  toast.addEventListener("pointerleave", resumeForPointer);
  toast.addEventListener("focusin", pauseForFocus);
  toast.addEventListener("focusout", resumeForFocus);
  toast.dismissToast = dismiss;
  if (options.actionLabel && typeof options.onAction === "function") {
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = options.actionLabel;
    action.addEventListener("click", () => {
      dismiss();
      options.onAction();
    });
    toast.appendChild(action);
  }

  const activeToasts = [...els.toastRegion.children]
    .filter((item) => !item.classList.contains("dismissing"));
  if (activeToasts.length >= 3) {
    const oldest = activeToasts[0];
    if (typeof oldest.dismissToast === "function") oldest.dismissToast();
    else oldest.remove();
  }
  els.toastRegion.appendChild(toast);
  startTimer();
}

async function copyClipboardPayload(payload) {
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([payload.html], { type: "text/html" }),
          "text/plain": new Blob([payload.plainText], { type: "text/plain" }),
        }),
      ]);
      els.leftStatus.textContent = "已复制到剪贴板";
      showToast("已复制选区到剪贴板");
      return;
    } catch (error) {
      // Fall back to text-only copy below.
    }
  }
  await copyText(payload.plainText);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  els.leftStatus.textContent = "已复制到剪贴板";
  showToast("已复制到剪贴板");
}
