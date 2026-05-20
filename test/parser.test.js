"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { parse } = require("../src/parser");

const fixturesDir = path.join(__dirname, "fixtures");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

function parseFixture(name) {
  const sourcePath = path.join(fixturesDir, name);
  return parse(readFixture(name), { sourcePath });
}

function lineSummary(line) {
  return {
    type: line.type,
    sourceLine: line.sourceLine,
    label: line.label,
    statementTypes: line.statements.map((statement) => statement.type),
  };
}

function assertExpression(expression, expected) {
  assert.equal(expression.type, expected.type);
  assert.equal(expression.sourceLine, expected.sourceLine);
  assert.equal(expression.sourceColumn, expected.sourceColumn);
  if (Object.prototype.hasOwnProperty.call(expected, "value")) {
    assert.equal(expression.value, expected.value);
  }
  if (Object.prototype.hasOwnProperty.call(expected, "name")) {
    assert.equal(expression.name, expected.name);
  }
  if (Object.prototype.hasOwnProperty.call(expected, "operator")) {
    assert.equal(expression.operator, expected.operator);
  }
}

function assertVariableTarget(target, expected) {
  assert.equal(target.type, "Identifier");
  assert.equal(target.name, expected.name);
  assert.equal(target.sourceLine, expected.sourceLine);
  assert.equal(target.sourceColumn, expected.sourceColumn);
}

function assertArrayTarget(target, expected) {
  assert.equal(target.type, "ArrayTarget");
  assert.equal(target.name, expected.name);
  assert.equal(target.valueType, expected.valueType);
  assert.equal(target.sourceLine, expected.sourceLine);
  assert.equal(target.sourceColumn, expected.sourceColumn);
  assert.equal(target.indexes.length, 1);
  assertExpression(target.indexes[0], expected.index);
}

function expressionShape(expression) {
  assert.ok(expression, "missing expression");

  switch (expression.type) {
    case "NumericLiteral":
      return { type: expression.type, value: expression.value };
    case "UnaryExpression":
      return {
        type: expression.type,
        operator: expression.operator,
        argument: expressionShape(expression.argument),
      };
    case "IdentifierExpression":
      return { type: expression.type, name: expression.name };
    case "ArrayExpression":
      return {
        type: expression.type,
        name: expression.name,
        indexes: expression.indexes.map(expressionShape),
      };
    case "BinaryExpression":
      return {
        type: expression.type,
        operator: expression.operator,
        left: expressionShape(expression.left),
        right: expressionShape(expression.right),
      };
    default:
      assert.fail(`unexpected expression type ${expression.type}`);
  }
}

test("parses core statement lines and preserves the program shape", () => {
  const sourcePath = path.join(fixturesDir, "parser-core.bas");
  const result = parseFixture("parser-core.bas");

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.program.type, "Program");
  assert.equal(result.program.sourcePath, sourcePath);
  assert.ok(result.program.labels instanceof Map);
  assert.deepEqual([...result.program.labels.entries()], [
    [10, 0],
    [20, 3],
    [30, 4],
    [40, 5],
    [50, 7],
  ]);

  assert.deepEqual(result.program.lines.map(lineSummary), [
    { type: "Line", sourceLine: 1, label: null, statementTypes: [] },
    {
      type: "Line",
      sourceLine: 2,
      label: 10,
      statementTypes: ["PrintStatement", "AssignmentStatement", "AssignmentStatement"],
    },
    { type: "Line", sourceLine: 3, label: 20, statementTypes: ["CommentStatement"] },
    { type: "Line", sourceLine: 4, label: 30, statementTypes: ["CommentStatement"] },
    { type: "Line", sourceLine: 5, label: 40, statementTypes: ["PrintStatement", "StopStatement"] },
    { type: "Line", sourceLine: 6, label: 50, statementTypes: ["EndStatement"] },
    { type: "Line", sourceLine: 7, label: null, statementTypes: ["PrintStatement"] },
  ]);

  assert.deepEqual(
    result.program.statements.map((statement) => ({
      type: statement.type,
      sourceLine: statement.sourceLine,
      sourceColumn: statement.sourceColumn,
    })),
    [
      { type: "PrintStatement", sourceLine: 2, sourceColumn: 4 },
      { type: "AssignmentStatement", sourceLine: 2, sourceColumn: 24 },
      { type: "AssignmentStatement", sourceLine: 2, sourceColumn: 40 },
      { type: "CommentStatement", sourceLine: 3, sourceColumn: 4 },
      { type: "CommentStatement", sourceLine: 4, sourceColumn: 4 },
      { type: "PrintStatement", sourceLine: 5, sourceColumn: 4 },
      { type: "StopStatement", sourceLine: 5, sourceColumn: 17 },
      { type: "EndStatement", sourceLine: 6, sourceColumn: 4 },
      { type: "PrintStatement", sourceLine: 7, sourceColumn: 1 },
    ],
  );

  assert.equal(result.program.lines[1].statements[0], result.program.statements[0]);
  assert.equal(result.program.lines[4].statements[1], result.program.statements[6]);
});

test("parses PRINT items, LET assignment, direct assignment, comments, STOP, and END", () => {
  const result = parseFixture("parser-core.bas");
  const [print, letAssignment, directAssignment, remComment, apostropheComment, colonPrint, stop, end] =
    result.program.statements;

  assert.equal(print.type, "PrintStatement");
  assert.equal(print.trailingSeparator, ";");
  assert.equal(print.items.length, 2);
  assertExpression(print.items[0], { type: "StringLiteral", value: "HELLO", sourceLine: 2, sourceColumn: 10 });
  assert.equal(print.items[0].expression.type, "StringLiteral");
  assert.equal(print.items[0].separator, ",");
  assertExpression(print.items[1], { type: "IdentifierExpression", name: "A", sourceLine: 2, sourceColumn: 19 });
  assert.equal(print.items[1].expression.type, "IdentifierExpression");
  assert.equal(print.items[1].separator, ";");

  assert.equal(letAssignment.type, "AssignmentStatement");
  assert.equal(letAssignment.keyword, "LET");
  assertVariableTarget(letAssignment.target, { name: "A", sourceLine: 2, sourceColumn: 28 });
  assertExpression(letAssignment.expression, { type: "BinaryExpression", operator: "+", sourceLine: 2, sourceColumn: 34 });
  assertExpression(letAssignment.expression.left, { type: "NumericLiteral", value: 1, sourceLine: 2, sourceColumn: 32 });
  assertExpression(letAssignment.expression.right, { type: "NumericLiteral", value: 2, sourceLine: 2, sourceColumn: 36 });

  assert.equal(directAssignment.type, "AssignmentStatement");
  assert.equal(directAssignment.keyword, null);
  assertVariableTarget(directAssignment.target, { name: "B$", sourceLine: 2, sourceColumn: 40 });
  assertExpression(directAssignment.expression, { type: "StringLiteral", value: "X:Y", sourceLine: 2, sourceColumn: 45 });

  assert.equal(remComment.type, "CommentStatement");
  assert.equal(remComment.marker, "REM");
  assert.equal(remComment.text, "full-line comment");

  assert.equal(apostropheComment.type, "CommentStatement");
  assert.equal(apostropheComment.marker, "'");
  assert.equal(apostropheComment.text, "apostrophe comment");

  assert.equal(colonPrint.type, "PrintStatement");
  assert.equal(colonPrint.trailingSeparator, null);
  assert.equal(colonPrint.items.length, 1);
  assertExpression(colonPrint.items[0], { type: "StringLiteral", value: "A:B", sourceLine: 5, sourceColumn: 10 });

  assert.equal(stop.type, "StopStatement");
  assert.equal(end.type, "EndStatement");
});

test("allows empty sources and physical lines without statements", () => {
  const sourcePath = "empty-lines.bas";
  const result = parse("\n\n", { sourcePath });

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.program.type, "Program");
  assert.equal(result.program.sourcePath, sourcePath);
  assert.deepEqual(result.program.statements, []);
  assert.deepEqual(result.program.labels, new Map());
  assert.deepEqual(result.program.lines.map(lineSummary), [
    { type: "Line", sourceLine: 1, label: null, statementTypes: [] },
    { type: "Line", sourceLine: 2, label: null, statementTypes: [] },
  ]);
});

test("parses unary and exponent operators with BASIC precedence", () => {
  const result = parse("10 A = -2 ^ 2\n20 B = +2 ^ 2\n30 C = 2 ^ 3 ^ 2\n", { sourcePath: "precedence.bas" });

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(expressionShape(result.program.lines[0].statements[0].expression), {
    type: "UnaryExpression",
    operator: "-",
    argument: {
      type: "BinaryExpression",
      operator: "^",
      left: { type: "NumericLiteral", value: 2 },
      right: { type: "NumericLiteral", value: 2 },
    },
  });
  assert.deepEqual(expressionShape(result.program.lines[1].statements[0].expression), {
    type: "UnaryExpression",
    operator: "+",
    argument: {
      type: "BinaryExpression",
      operator: "^",
      left: { type: "NumericLiteral", value: 2 },
      right: { type: "NumericLiteral", value: 2 },
    },
  });
  assert.deepEqual(expressionShape(result.program.lines[2].statements[0].expression), {
    type: "BinaryExpression",
    operator: "^",
    left: { type: "NumericLiteral", value: 2 },
    right: {
      type: "BinaryExpression",
      operator: "^",
      left: { type: "NumericLiteral", value: 3 },
      right: { type: "NumericLiteral", value: 2 },
    },
  });
});

test("reports BAS1201 for duplicate line labels", () => {
  const sourcePath = path.join(fixturesDir, "parser-duplicate-label.bas");
  const result = parseFixture("parser-duplicate-label.bas");

  assert.equal(result.program.type, "Program");
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      sourcePath: diagnostic.sourcePath || diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
    })),
    [{ code: "BAS1201", sourcePath, line: 2, column: 1 }],
  );
  assert.match(result.diagnostics[0].message, /duplicate line label/i);
});

test("parses GOTO, GOSUB, RETURN, and IF branches", () => {
  const result = parse(
    [
      "10 GOTO 40",
      "20 GOSUB 100",
      "30 RETURN",
      "40 IF A = 1 THEN PRINT \"YES\"",
      "50 IF A THEN 80",
      "60 IF A THEN PRINT \"T\" ELSE PRINT \"F\"",
      "70 IF A THEN 90 ELSE 100",
      "80 END",
    ].join("\n") + "\n",
    { sourcePath: "branching-parser.bas" },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.program.statements.map((statement) => statement.type), [
    "GotoStatement",
    "GosubStatement",
    "ReturnStatement",
    "IfStatement",
    "IfStatement",
    "IfStatement",
    "IfStatement",
    "EndStatement",
  ]);

  const [goto, gosub, returnStatement, ifStatement, ifLineNumber, ifElseStatement, ifElseLineNumber] =
    result.program.statements;

  assert.equal(goto.targetLabel, 40);
  assert.equal(gosub.targetLabel, 100);
  assert.equal(returnStatement.sourceLine, 3);

  assert.equal(ifStatement.test.type, "BinaryExpression");
  assert.equal(ifStatement.test.operator, "=");
  assert.equal(ifStatement.thenBranch.type, "PrintStatement");
  assert.equal(ifStatement.elseBranch, null);

  assert.equal(ifLineNumber.test.type, "IdentifierExpression");
  assert.deepEqual(ifLineNumber.thenBranch, {
    type: "LineNumberBranch",
    targetLabel: 80,
    sourceLine: 5,
    sourceColumn: 14,
  });
  assert.equal(ifLineNumber.elseBranch, null);

  assert.equal(ifElseStatement.thenBranch.type, "PrintStatement");
  assert.equal(ifElseStatement.elseBranch.type, "PrintStatement");
  assert.deepEqual(ifElseLineNumber.thenBranch, {
    type: "LineNumberBranch",
    targetLabel: 90,
    sourceLine: 7,
    sourceColumn: 14,
  });
  assert.deepEqual(ifElseLineNumber.elseBranch, {
    type: "LineNumberBranch",
    targetLabel: 100,
    sourceLine: 7,
    sourceColumn: 22,
  });
});

test("parses INPUT targets and optional prompts", () => {
  const result = parse(
    [
      "10 INPUT A",
      "20 INPUT A$",
      "30 INPUT \"Name\"; NAME$",
      "40 INPUT \"Age\", AGE",
    ].join("\n") + "\n",
    { sourcePath: "input-parser.bas" },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.program.statements.map((statement) => statement.type), [
    "InputStatement",
    "InputStatement",
    "InputStatement",
    "InputStatement",
  ]);

  const [numberInput, stringInput, semicolonPrompt, commaPrompt] = result.program.statements;
  assert.equal(numberInput.prompt, null);
  assert.equal(numberInput.promptSeparator, null);
  assertVariableTarget(numberInput.target, { name: "A", sourceLine: 1, sourceColumn: 10 });
  assertVariableTarget(stringInput.target, { name: "A$", sourceLine: 2, sourceColumn: 10 });

  assertExpression(semicolonPrompt.prompt, { type: "StringLiteral", value: "Name", sourceLine: 3, sourceColumn: 10 });
  assert.equal(semicolonPrompt.promptSeparator, ";");
  assertVariableTarget(semicolonPrompt.target, { name: "NAME$", sourceLine: 3, sourceColumn: 18 });

  assertExpression(commaPrompt.prompt, { type: "StringLiteral", value: "Age", sourceLine: 4, sourceColumn: 10 });
  assert.equal(commaPrompt.promptSeparator, ",");
  assertVariableTarget(commaPrompt.target, { name: "AGE", sourceLine: 4, sourceColumn: 17 });
});

test("reports parser diagnostics for malformed INPUT", () => {
  const sourcePath = "bad-input-parser.bas";
  const result = parse("10 INPUT \"Name\" NAME$\n20 INPUT\n", { sourcePath });

  assert.deepEqual(
    result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      sourcePath: diagnostic.sourcePath || diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
    })),
    [
      { code: "BAS1103", sourcePath, line: 1, column: 17 },
      { code: "BAS1102", sourcePath, line: 2, column: 9 },
    ],
  );
});

test("parses FOR, NEXT, DIM, and array targets and expressions", () => {
  const result = parse(
    [
      "10 DIM A(3)",
      "20 DIM NAME$(2)",
      "30 FOR I = 1 TO 3",
      "40 FOR J = 4 TO 2 STEP -1",
      "50 A(I) = A(I) + J",
      "60 NAME$(1) = \"Ada\"",
      "70 NEXT",
      "80 NEXT I",
    ].join("\n") + "\n",
    { sourcePath: "loops-arrays-parser.bas" },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.program.statements.map((statement) => statement.type), [
    "DimStatement",
    "DimStatement",
    "ForStatement",
    "ForStatement",
    "AssignmentStatement",
    "AssignmentStatement",
    "NextStatement",
    "NextStatement",
  ]);

  const [dimNumber, dimString, outerFor, innerFor, arrayAssignment, stringArrayAssignment, nextOmitted, nextNamed] =
    result.program.statements;

  assert.equal(dimNumber.name, "A");
  assert.equal(dimNumber.valueType, "number");
  assertExpression(dimNumber.upperBound, { type: "NumericLiteral", value: 3, sourceLine: 1, sourceColumn: 10 });

  assert.equal(dimString.name, "NAME$");
  assert.equal(dimString.valueType, "string");
  assertExpression(dimString.upperBound, { type: "NumericLiteral", value: 2, sourceLine: 2, sourceColumn: 14 });

  assert.equal(outerFor.variable.name, "I");
  assertExpression(outerFor.start, { type: "NumericLiteral", value: 1, sourceLine: 3, sourceColumn: 12 });
  assertExpression(outerFor.end, { type: "NumericLiteral", value: 3, sourceLine: 3, sourceColumn: 17 });
  assert.equal(outerFor.step, null);

  assert.equal(innerFor.variable.name, "J");
  assertExpression(innerFor.start, { type: "NumericLiteral", value: 4, sourceLine: 4, sourceColumn: 12 });
  assertExpression(innerFor.end, { type: "NumericLiteral", value: 2, sourceLine: 4, sourceColumn: 17 });
  assert.deepEqual(expressionShape(innerFor.step), {
    type: "UnaryExpression",
    operator: "-",
    argument: { type: "NumericLiteral", value: 1 },
  });

  assertArrayTarget(arrayAssignment.target, {
    name: "A",
    valueType: "number",
    sourceLine: 5,
    sourceColumn: 4,
    index: { type: "IdentifierExpression", name: "I", sourceLine: 5, sourceColumn: 6 },
  });
  assert.deepEqual(expressionShape(arrayAssignment.expression), {
    type: "BinaryExpression",
    operator: "+",
    left: { type: "ArrayExpression", name: "A", indexes: [{ type: "IdentifierExpression", name: "I" }] },
    right: { type: "IdentifierExpression", name: "J" },
  });

  assertArrayTarget(stringArrayAssignment.target, {
    name: "NAME$",
    valueType: "string",
    sourceLine: 6,
    sourceColumn: 4,
    index: { type: "NumericLiteral", value: 1, sourceLine: 6, sourceColumn: 10 },
  });
  assert.equal(nextOmitted.variable, null);
  assert.equal(nextNamed.variable.name, "I");
});
