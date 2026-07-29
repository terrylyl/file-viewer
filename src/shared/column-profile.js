const COLUMN_PROFILE_EXACT_VALUE_LIMIT = 50000;
const COLUMN_PROFILE_TOP_VALUE_LIMIT = 10;
const COLUMN_PROFILE_LONG_TEXT_THRESHOLD = 10000;

function isColumnProfileEmpty(value) {
  return String(value == null ? "" : value).trim() === "";
}

function parseStrictColumnProfileDate(value) {
  const text = String(value == null ? "" : value).trim();
  const match = /^(\d{4})([-/])(\d{2})\2(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const hour = Number(match[5] || 0);
  const minute = Number(match[6] || 0);
  const second = Number(match[7] || 0);
  const millisecond = Number(String(match[8] || "0").padEnd(3, "0"));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) return null;
  return timestamp;
}

function classifyColumnProfileValue(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "empty";
  if (/^(?:true|false|yes|no|是|否)$/i.test(text)) return "boolean";
  if (/^[+-]?\d+$/.test(text)) {
    const unsigned = text.replace(/^[+-]/, "");
    if ((unsigned.length > 1 && unsigned.startsWith("0")) || unsigned.length > 15) return "text";
    return "integer";
  }
  if (/^[+-]?(?:\d+\.\d+|\d+\.|\.\d+)(?:e[+-]?\d+)?$/i.test(text) && Number.isFinite(Number(text))) {
    return "number";
  }
  if (parseStrictColumnProfileDate(text) != null) return "date";
  return "text";
}

function columnProfileValueMatchesType(value, type) {
  const valueType = classifyColumnProfileValue(value);
  if (valueType === "empty") return false;
  if (type === "number") return valueType === "integer" || valueType === "number";
  if (type === "integer") return valueType === "integer";
  if (type === "mixed" || type === "empty") return true;
  return valueType === type;
}

function buildColumnProfile(rowCount, getValue, options = {}) {
  const exactValueLimit = Math.max(100, Number(options.exactValueLimit) || COLUMN_PROFILE_EXACT_VALUE_LIMIT);
  const topValueLimit = Math.max(1, Number(options.topValueLimit) || COLUMN_PROFILE_TOP_VALUE_LIMIT);
  const typeCounts = { boolean: 0, integer: 0, number: 0, date: 0, text: 0 };
  const valueCounts = new Map();
  let valueCountOverflow = false;
  let emptyCount = 0;
  let whitespaceCount = 0;
  let longTextCount = 0;
  let minLength = Infinity;
  let maxLength = 0;
  let totalLength = 0;
  let numericCount = 0;
  let numericMean = 0;
  let numericMin = Infinity;
  let numericMax = -Infinity;
  let zeroCount = 0;
  let negativeCount = 0;
  let dateCount = 0;
  let earliestDate = Infinity;
  let latestDate = -Infinity;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rawValue = getValue(rowIndex);
    const value = String(rawValue == null ? "" : rawValue);
    const trimmed = value.trim();
    if (!trimmed) {
      emptyCount += 1;
      continue;
    }
    if (value !== trimmed) whitespaceCount += 1;
    if (value.length >= COLUMN_PROFILE_LONG_TEXT_THRESHOLD) longTextCount += 1;
    minLength = Math.min(minLength, value.length);
    maxLength = Math.max(maxLength, value.length);
    totalLength += value.length;

    const valueType = classifyColumnProfileValue(value);
    typeCounts[valueType] += 1;
    if (valueType === "integer" || valueType === "number") {
      const numericValue = Number(trimmed);
      numericCount += 1;
      numericMean += (numericValue - numericMean) / numericCount;
      numericMin = Math.min(numericMin, numericValue);
      numericMax = Math.max(numericMax, numericValue);
      if (numericValue === 0) zeroCount += 1;
      if (numericValue < 0) negativeCount += 1;
    } else if (valueType === "date") {
      const timestamp = parseStrictColumnProfileDate(trimmed);
      dateCount += 1;
      earliestDate = Math.min(earliestDate, timestamp);
      latestDate = Math.max(latestDate, timestamp);
    }

    if (valueCounts.has(value)) {
      valueCounts.set(value, valueCounts.get(value) + 1);
    } else if (valueCounts.size < exactValueLimit) {
      valueCounts.set(value, 1);
    } else {
      valueCountOverflow = true;
    }
  }

  const nonEmptyCount = Math.max(0, rowCount - emptyCount);
  const mergedTypeCounts = {
    boolean: typeCounts.boolean,
    number: typeCounts.integer + typeCounts.number,
    date: typeCounts.date,
    text: typeCounts.text,
  };
  const dominant = Object.entries(mergedTypeCounts).sort((a, b) => b[1] - a[1])[0] || ["empty", 0];
  const consistency = nonEmptyCount ? dominant[1] / nonEmptyCount : 1;
  let dominantType = nonEmptyCount ? dominant[0] : "empty";
  if (dominantType === "number" && typeCounts.number === 0) dominantType = "integer";
  let type = dominantType;
  if (nonEmptyCount && consistency < 0.9) type = "mixed";
  const invalidCount = nonEmptyCount ? nonEmptyCount - dominant[1] : 0;
  const duplicateRowCount = [...valueCounts.values()].reduce((sum, count) => sum + (count > 1 ? count : 0), 0);
  const topValues = [...valueCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: "base" }))
    .slice(0, topValueLimit);

  return {
    rowCount,
    emptyCount,
    nonEmptyCount,
    uniqueCount: valueCountOverflow ? null : valueCounts.size,
    uniqueLowerBound: valueCountOverflow ? exactValueLimit + 1 : valueCounts.size,
    duplicateRowCount,
    valueCountApproximate: valueCountOverflow,
    topValues,
    type,
    dominantType,
    consistency,
    invalidCount,
    typeCounts,
    text: {
      minLength: nonEmptyCount ? minLength : 0,
      maxLength,
      averageLength: nonEmptyCount ? totalLength / nonEmptyCount : 0,
      whitespaceCount,
      longTextCount,
    },
    numeric: numericCount
      ? { count: numericCount, min: numericMin, max: numericMax, mean: numericMean, zeroCount, negativeCount }
      : null,
    date: dateCount
      ? { count: dateCount, earliest: earliestDate, latest: latestDate }
      : null,
  };
}
