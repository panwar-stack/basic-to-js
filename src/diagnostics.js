"use strict";

function formatDiagnostic(diagnostic) {
  const file = diagnostic.file || diagnostic.sourcePath || "<unknown>";
  const line = normalizeLocationPart(diagnostic.line, 1);
  const column = normalizeLocationPart(diagnostic.column, 1);
  const code = diagnostic.code || "BASIC000";
  const message = diagnostic.message || "Unknown diagnostic";

  return `${file}:${line}:${column} ${code}: ${message}`;
}

function normalizeLocationPart(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

module.exports = {
  formatDiagnostic,
};
