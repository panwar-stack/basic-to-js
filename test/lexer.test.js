"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { lex } = require("../src/lexer");

const fixturesDir = path.join(__dirname, "fixtures");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

function lexFixture(name) {
  const sourcePath = path.join(fixturesDir, name);
  return lex(fs.readFileSync(sourcePath, "utf8"), { sourcePath });
}

function withoutNewlines(tokens) {
  return tokens.filter((token) => token.type !== "newline");
}

function simplifiedTokens(tokens) {
  return tokens.map((token) => ({
    type: token.type,
    lexeme: token.lexeme,
    value: token.value,
    line: token.line,
    column: token.column,
  }));
}

test("lexes empty lines, comments, strings, colons, labels, identifiers, and numbers", () => {
  const result = lexFixture("lexer-basic.bas");

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    simplifiedTokens(withoutNewlines(result.tokens)),
    [
      { type: "lineLabel", lexeme: "10", value: 10, line: 2, column: 1 },
      { type: "comment", lexeme: "REM PRINT \"not a token\"", value: "PRINT \"not a token\"", line: 2, column: 4 },
      { type: "lineLabel", lexeme: "20", value: 20, line: 3, column: 1 },
      { type: "comment", lexeme: "' apostrophe PRINT", value: "apostrophe PRINT", line: 3, column: 4 },
      { type: "lineLabel", lexeme: "30", value: 30, line: 4, column: 1 },
      { type: "keyword", lexeme: "PRINT", value: "PRINT", line: 4, column: 4 },
      { type: "string", lexeme: "\"If PRINT then print\"", value: "If PRINT then print", line: 4, column: 10 },
      { type: "comma", lexeme: ",", value: undefined, line: 4, column: 31 },
      { type: "identifier", lexeme: "PRINTCOUNT", value: "PRINTCOUNT", line: 4, column: 33 },
      { type: "lineLabel", lexeme: "40", value: 40, line: 5, column: 1 },
      { type: "keyword", lexeme: "PRINT", value: "PRINT", line: 5, column: 4 },
      { type: "string", lexeme: "\"CAN'T STOP\"", value: "CAN'T STOP", line: 5, column: 10 },
      { type: "colon", lexeme: ":", value: undefined, line: 5, column: 22 },
      { type: "keyword", lexeme: "LET", value: "LET", line: 5, column: 24 },
      { type: "identifier", lexeme: "PRINTCOUNT", value: "PRINTCOUNT", line: 5, column: 28 },
      { type: "operator", lexeme: "=", value: undefined, line: 5, column: 39 },
      { type: "number", lexeme: "1.5", value: 1.5, line: 5, column: 41 },
      { type: "colon", lexeme: ":", value: undefined, line: 5, column: 45 },
      { type: "identifier", lexeme: "X", value: "X", line: 5, column: 47 },
      { type: "operator", lexeme: "=", value: undefined, line: 5, column: 49 },
      { type: "number", lexeme: ".5", value: 0.5, line: 5, column: 51 },
      { type: "lineLabel", lexeme: "50", value: 50, line: 6, column: 1 },
      { type: "keyword", lexeme: "GOTO", value: "GOTO", line: 6, column: 4 },
      { type: "number", lexeme: "10", value: 10, line: 6, column: 9 },
      { type: "lineLabel", lexeme: "60", value: 60, line: 7, column: 1 },
      { type: "keyword", lexeme: "END", value: "END", line: 7, column: 4 },
    ],
  );
});

test("emits newline tokens for empty and non-empty physical lines", () => {
  const result = lexFixture("lexer-basic.bas");
  const newlineLocations = result.tokens
    .filter((token) => token.type === "newline")
    .map((token) => ({ line: token.line, column: token.column }));

  assert.deepEqual(newlineLocations, [
    { line: 1, column: 1 },
    { line: 2, column: 27 },
    { line: 3, column: 22 },
    { line: 4, column: 43 },
    { line: 5, column: 53 },
    { line: 6, column: 11 },
    { line: 7, column: 7 },
  ]);
});

test("emits a newline token for a source containing only a newline", () => {
  const result = lex("\n", { sourcePath: "single-newline.bas" });

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(simplifiedTokens(result.tokens), [
    { type: "newline", lexeme: "\n", value: undefined, line: 1, column: 1 },
  ]);
});

test("emits a token for a final physical newline", () => {
  const result = lex("10 PRINT\n", { sourcePath: "final-newline.bas" });

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(simplifiedTokens(result.tokens), [
    { type: "lineLabel", lexeme: "10", value: 10, line: 1, column: 1 },
    { type: "keyword", lexeme: "PRINT", value: "PRINT", line: 1, column: 4 },
    { type: "newline", lexeme: "\n", value: undefined, line: 1, column: 9 },
  ]);
});

test("reports newline token columns after comments at the physical newline column", () => {
  const result = lex("10 REM X\n", { sourcePath: "comment-newline-column.bas" });

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(simplifiedTokens(result.tokens), [
    { type: "lineLabel", lexeme: "10", value: 10, line: 1, column: 1 },
    { type: "comment", lexeme: "REM X", value: "X", line: 1, column: 4 },
    { type: "newline", lexeme: "\n", value: undefined, line: 1, column: 9 },
  ]);
});

test("does not tokenize keywords or apostrophes inside strings", () => {
  const sourcePath = "inline-string-keywords.bas";
  const result = lex('PRINT "REM IF THEN GOTO CAN\'T"\n', { sourcePath });

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(simplifiedTokens(withoutNewlines(result.tokens)), [
    { type: "keyword", lexeme: "PRINT", value: "PRINT", line: 1, column: 1 },
    { type: "string", lexeme: "\"REM IF THEN GOTO CAN'T\"", value: "REM IF THEN GOTO CAN'T", line: 1, column: 7 },
  ]);
});

test("reports diagnostic locations for unterminated strings and unknown tokens", () => {
  const sourcePath = path.join(fixturesDir, "lexer-diagnostics.bas");
  const result = lex(readFixture("lexer-diagnostics.bas"), { sourcePath });

  assert.deepEqual(
    result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      sourcePath: diagnostic.sourcePath || diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
    })),
    [
      { code: "BAS1001", sourcePath, line: 1, column: 10 },
      { code: "BAS1002", sourcePath, line: 2, column: 10 },
    ],
  );
  assert.match(result.diagnostics[0].message, /unterminated string/i);
  assert.match(result.diagnostics[1].message, /unknown token/i);
});
