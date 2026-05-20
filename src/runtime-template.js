"use strict";

function createRuntimeTemplate(features = {}) {
  const lines = [];

  if (features.runtimeError) {
    lines.push(
      "function runtimeError(code, message) {",
      "  console.error(`BASIC runtime error ${code}: ${message}`);",
      "  process.exit(1);",
      "}",
    );
  }

  if (features.readVar) {
    appendBlank(lines);
    lines.push(
      "function readVar(name, valueType) {",
      "  if (Object.prototype.hasOwnProperty.call(vars, name)) {",
      "    return vars[name];",
      "  }",
      "  return valueType === \"string\" ? \"\" : 0;",
      "}",
    );
  }

  if (features.input) {
    appendBlank(lines);
    lines.push(
      "const fs = require(\"node:fs\");",
      "const inputBuffer = Buffer.alloc(1);",
      "",
      "function readInputLine() {",
      "  const bytes = [];",
      "  while (true) {",
      "    const bytesRead = fs.readSync(0, inputBuffer, 0, 1, null);",
      "    if (bytesRead === 0) {",
      "      break;",
      "    }",
      "    if (inputBuffer[0] === 10) {",
      "      break;",
      "    }",
      "    if (inputBuffer[0] !== 13) {",
      "      bytes.push(inputBuffer[0]);",
      "    }",
      "  }",
      "  return Buffer.from(bytes).toString(\"utf8\");",
      "}",
      "",
      "function inputValue(valueType) {",
      "  const line = readInputLine();",
      "  if (valueType === \"string\") {",
      "    return line;",
      "  }",
      "  const value = Number(line);",
      "  if (line.trim() === \"\" || Number.isNaN(value)) {",
      "    runtimeError(\"BASRT009\", `Invalid numeric input: ${line}`);",
      "  }",
      "  return value;",
      "}",
    );
  }

  if (features.arrays) {
    appendBlank(lines);
    lines.push(
      "function createArray(upperBound, valueType) {",
      "  if (!Number.isInteger(upperBound) || upperBound < 0) {",
      "    runtimeError(\"BASRT005\", `DIM upper bound must be a non-negative integer, got ${upperBound}`);",
      "  }",
      "  return { values: new Array(upperBound + 1).fill(valueType === \"string\" ? \"\" : 0), valueType };",
      "}",
      "",
      "function readArray(name, index) {",
      "  const array = getArray(name);",
      "  const checkedIndex = checkArrayIndex(name, array, index);",
      "  return array.values[checkedIndex];",
      "}",
      "",
      "function writeArray(name, index, value) {",
      "  const array = getArray(name);",
      "  const checkedIndex = checkArrayIndex(name, array, index);",
      "  array.values[checkedIndex] = value;",
      "}",
      "",
      "function getArray(name) {",
      "  if (!Object.prototype.hasOwnProperty.call(arrays, name)) {",
      "    runtimeError(\"BASRT006\", `Array ${name} used before DIM`);",
      "  }",
      "  return arrays[name];",
      "}",
      "",
      "function checkArrayIndex(name, array, index) {",
      "  if (!Number.isInteger(index)) {",
      "    runtimeError(\"BASRT007\", `Array ${name} index must be an integer, got ${index}`);",
      "  }",
      "  if (index < 0 || index >= array.values.length) {",
      "    runtimeError(\"BASRT008\", `Array ${name} index ${index} out of bounds 0..${array.values.length - 1}`);",
      "  }",
      "  return index;",
      "}",
    );
  }

  if (features.printValue) {
    appendBlank(lines);
    lines.push(
      "function printValue(value) {",
      "  process.stdout.write(String(value));",
      "}",
    );
  }

  if (features.basicTruth) {
    appendBlank(lines);
    lines.push(
      "function basicTruth(value) {",
      "  return typeof value === \"boolean\" ? value : value !== 0;",
      "}",
    );
  }

  if (features.val) {
    appendBlank(lines);
    lines.push(
      "function val(value) {",
      "  const parsed = Number(value);",
      "  if (Number.isNaN(parsed)) {",
      "    runtimeError(\"BASRT001\", `VAL expected numeric string, got ${value}`);",
      "  }",
      "  return parsed;",
      "}",
    );
  }

  if (features.rnd) {
    lines.push(
      "",
      "let rndSeed = 123456789;",
      "function rnd() {",
      "  rndSeed = (1103515245 * rndSeed + 12345) % 2147483648;",
      "  return rndSeed / 2147483648;",
      "}",
    );
  }

  return lines.join("\n");
}

function appendBlank(lines) {
  if (lines.length > 0) {
    lines.push("");
  }
}

module.exports = {
  createRuntimeTemplate,
};
