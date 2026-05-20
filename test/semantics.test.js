"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { parse } = require("../src/parser");
const { analyze } = require("../src/semantics");
const { compile } = require("../src/compiler");

const fixturesDir = path.join(__dirname, "fixtures");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

function parseSource(source, sourcePath) {
  const result = parse(source, { sourcePath });
  assert.deepEqual(result.diagnostics, []);
  return result.program;
}

function analyzeSource(source, sourcePath) {
  const program = parseSource(source, sourcePath);
  const result = analyze(program, { sourcePath });

  assert.ok(result);
  assert.ok(Array.isArray(result.diagnostics));
  return {
    program: result.program || program,
    diagnostics: result.diagnostics,
  };
}

function analyzeFixture(name) {
  const sourcePath = path.join(fixturesDir, name);
  return analyzeSource(readFixture(name), sourcePath);
}

function diagnosticSummary(diagnostics) {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    sourcePath: diagnostic.sourcePath || diagnostic.file,
    line: diagnostic.line,
    column: diagnostic.column,
  }));
}

function assignment(program, targetName) {
  return program.statements.find(
    (statement) => statement.type === "AssignmentStatement" && statement.target.name === targetName,
  );
}

function printExpression(program, lineLabel) {
  const line = program.lines.find((candidate) => candidate.label === lineLabel);
  assert.ok(line, `missing line ${lineLabel}`);
  assert.equal(line.statements[0].type, "PrintStatement");
  return line.statements[0].items[0].expression;
}

function expressionShape(expression) {
  assert.ok(expression, "missing expression");

  switch (expression.type) {
    case "NumericLiteral":
    case "StringLiteral":
      return {
        type: expression.type,
        value: expression.value,
        valueType: expression.valueType,
      };
    case "IdentifierExpression":
      return {
        type: expression.type,
        name: expression.name,
        valueType: expression.valueType,
      };
    case "ArrayExpression":
      return {
        type: expression.type,
        name: expression.name,
        valueType: expression.valueType,
        indexes: expression.indexes.map(expressionShape),
      };
    case "GroupingExpression":
      return expressionShape(expression.expression);
    case "UnaryExpression":
      return {
        type: expression.type,
        operator: expression.operator,
        valueType: expression.valueType,
        argument: expressionShape(expression.argument),
      };
    case "BinaryExpression":
      return {
        type: expression.type,
        operator: expression.operator,
        valueType: expression.valueType,
        left: expressionShape(expression.left),
        right: expressionShape(expression.right),
      };
    case "CallExpression":
      return {
        type: expression.type,
        callee: expression.callee,
        valueType: expression.valueType,
        args: expression.args.map(expressionShape),
      };
    default:
      assert.fail(`unexpected expression type ${expression.type}`);
  }
}

function numberLiteral(value) {
  return { type: "NumericLiteral", value, valueType: "number" };
}

function stringLiteral(value) {
  return { type: "StringLiteral", value, valueType: "string" };
}

function identifier(name, valueType) {
  return { type: "IdentifierExpression", name, valueType };
}

test("analyzes operator precedence, parentheses, unary operators, booleans, comparisons, and string concatenation", () => {
  const result = analyzeFixture("semantics-expressions.bas");

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(expressionShape(assignment(result.program, "A").expression), {
    type: "BinaryExpression",
    operator: "+",
    valueType: "number",
    left: numberLiteral(1),
    right: {
      type: "BinaryExpression",
      operator: "*",
      valueType: "number",
      left: numberLiteral(2),
      right: numberLiteral(3),
    },
  });
  assert.deepEqual(expressionShape(assignment(result.program, "B").expression), {
    type: "BinaryExpression",
    operator: "*",
    valueType: "number",
    left: {
      type: "BinaryExpression",
      operator: "+",
      valueType: "number",
      left: numberLiteral(1),
      right: numberLiteral(2),
    },
    right: numberLiteral(3),
  });
  assert.deepEqual(expressionShape(assignment(result.program, "C").expression), {
    type: "BinaryExpression",
    operator: "+",
    valueType: "number",
    left: {
      type: "UnaryExpression",
      operator: "-",
      valueType: "number",
      argument: identifier("A", "number"),
    },
    right: {
      type: "UnaryExpression",
      operator: "+",
      valueType: "number",
      argument: identifier("B", "number"),
    },
  });
  assert.deepEqual(expressionShape(printExpression(result.program, 40)), {
    type: "BinaryExpression",
    operator: "OR",
    valueType: "boolean",
    left: {
      type: "UnaryExpression",
      operator: "NOT",
      valueType: "boolean",
      argument: {
        type: "BinaryExpression",
        operator: "=",
        valueType: "boolean",
        left: identifier("A", "number"),
        right: numberLiteral(0),
      },
    },
    right: {
      type: "BinaryExpression",
      operator: "AND",
      valueType: "boolean",
      left: {
        type: "BinaryExpression",
        operator: ">",
        valueType: "boolean",
        left: identifier("B", "number"),
        right: numberLiteral(5),
      },
      right: {
        type: "BinaryExpression",
        operator: "<>",
        valueType: "boolean",
        left: identifier("C", "number"),
        right: numberLiteral(10),
      },
    },
  });
  assert.deepEqual(expressionShape(printExpression(result.program, 50)), {
    type: "BinaryExpression",
    operator: "+",
    valueType: "string",
    left: stringLiteral("A"),
    right: stringLiteral("B"),
  });
});

test("validates variable $ typing and supported built-in signatures", () => {
  const result = analyzeFixture("semantics-builtins.bas");

  assert.deepEqual(result.diagnostics, []);
  assert.equal(assignment(result.program, "A").expression.valueType, "number");
  assert.equal(assignment(result.program, "B").expression.valueType, "number");
  assert.equal(assignment(result.program, "C").expression.valueType, "number");
  assert.equal(assignment(result.program, "D$").expression.valueType, "string");
  assert.equal(assignment(result.program, "E$").expression.valueType, "string");
  assert.equal(assignment(result.program, "F$").expression.valueType, "string");
  assert.equal(assignment(result.program, "G$").expression.valueType, "string");
  assert.equal(assignment(result.program, "H").expression.valueType, "number");
  assert.deepEqual(expressionShape(assignment(result.program, "I").expression), {
    type: "CallExpression",
    callee: "RND",
    valueType: "number",
    args: [],
  });
});

test("reports BAS1301 for assignment, operator, and built-in arity/type mismatches", () => {
  const sourcePath = path.join(fixturesDir, "semantics-diagnostics.bas");
  const result = analyzeFixture("semantics-diagnostics.bas");

  assert.deepEqual(diagnosticSummary(result.diagnostics), [
    { code: "BAS1301", sourcePath, line: 1, column: 8 },
    { code: "BAS1301", sourcePath, line: 2, column: 9 },
    { code: "BAS1301", sourcePath, line: 3, column: 13 },
    { code: "BAS1301", sourcePath, line: 4, column: 10 },
    { code: "BAS1301", sourcePath, line: 5, column: 12 },
    { code: "BAS1301", sourcePath, line: 6, column: 12 },
    { code: "BAS1301", sourcePath, line: 7, column: 12 },
    { code: "BAS1301", sourcePath, line: 8, column: 15 },
    { code: "BAS1301", sourcePath, line: 9, column: 25 },
    { code: "BAS1301", sourcePath, line: 10, column: 10 },
    { code: "BAS1301", sourcePath, line: 11, column: 15 },
    { code: "BAS1301", sourcePath, line: 12, column: 13 },
    { code: "BAS1301", sourcePath, line: 13, column: 9 },
  ]);
  for (const diagnostic of result.diagnostics) {
    assert.match(diagnostic.message, /type mismatch|arity|argument|operand|assignment/i);
  }
});

test("reports BAS1103 for a missing assignment expression", () => {
  const sourcePath = "missing-expression.bas";
  const result = parse("10 LET A =\n", { sourcePath });

  assert.deepEqual(diagnosticSummary(result.diagnostics), [
    { code: "BAS1103", sourcePath, line: 1, column: 11 },
  ]);
  assert.match(result.diagnostics[0].message, /expected expression/i);
});

test("validates existing branch labels and IF expression types", () => {
  const result = analyzeFixture("branching.bas");

  assert.deepEqual(result.diagnostics, []);
});

test("reports BAS1202 for missing branch target labels", () => {
  const sourcePath = path.join(fixturesDir, "branching-missing-label.bas");
  const result = analyzeFixture("branching-missing-label.bas");

  assert.deepEqual(diagnosticSummary(result.diagnostics), [
    { code: "BAS1202", sourcePath, line: 1, column: 4 },
    { code: "BAS1202", sourcePath, line: 2, column: 18 },
    { code: "BAS1202", sourcePath, line: 2, column: 27 },
    { code: "BAS1202", sourcePath, line: 3, column: 4 },
  ]);
  for (const diagnostic of result.diagnostics) {
    assert.match(diagnostic.message, /missing|label|target/i);
  }
});

test("validates FOR/NEXT and DIM array programs", () => {
  assert.deepEqual(analyzeFixture("loops.bas").diagnostics, []);
  assert.deepEqual(analyzeFixture("arrays.bas").diagnostics, []);
});

test("annotates array expressions with DIM value types", () => {
  const result = analyzeFixture("arrays.bas");
  const numericArrayAssignment = result.program.statements.find(
    (statement) => statement.type === "AssignmentStatement" && statement.target.type === "ArrayTarget" && statement.target.name === "A" && statement.sourceLine === 4,
  );
  const stringArrayAssignment = result.program.statements.find(
    (statement) => statement.type === "AssignmentStatement" && statement.target.type === "ArrayTarget" && statement.target.name === "NAME$",
  );

  assert.equal(numericArrayAssignment.target.valueType, "number");
  assert.deepEqual(expressionShape(numericArrayAssignment.expression.left), {
    type: "ArrayExpression",
    name: "A",
    valueType: "number",
    indexes: [numberLiteral(0)],
  });
  assert.equal(stringArrayAssignment.target.valueType, "string");
});

test("reports BAS1401 for NEXT without matching FOR", () => {
  const sourcePath = "next-without-for.bas";
  const result = analyzeSource("10 NEXT I\n", sourcePath);

  assert.deepEqual(diagnosticSummary(result.diagnostics), [
    { code: "BAS1401", sourcePath, line: 1, column: 4 },
  ]);
  assert.match(result.diagnostics[0].message, /next|for/i);
});

test("reports BAS1402 for mismatched NEXT variable", () => {
  const sourcePath = "mismatched-next.bas";
  const result = analyzeSource("10 FOR I = 1 TO 3\n20 NEXT J\n", sourcePath);

  assert.deepEqual(diagnosticSummary(result.diagnostics), [
    { code: "BAS1402", sourcePath, line: 2, column: 9 },
  ]);
  assert.match(result.diagnostics[0].message, /next|mismatch|variable/i);
});

test("reports loop diagnostics for inline IF FOR/NEXT branches", () => {
  const cases = [
    {
      sourcePath: "inline-if-for-without-next.bas",
      source: "10 IF 1 THEN FOR I = 1 TO 2\n20 END\n",
      diagnostics: [{ code: "BAS1401", sourcePath: "inline-if-for-without-next.bas", line: 1, column: 14 }],
      message: /for|next/i,
    },
    {
      sourcePath: "inline-if-next-without-for.bas",
      source: "10 IF 1 THEN NEXT I\n20 END\n",
      diagnostics: [{ code: "BAS1401", sourcePath: "inline-if-next-without-for.bas", line: 1, column: 14 }],
      message: /next|for/i,
    },
    {
      sourcePath: "inline-if-mismatched-next.bas",
      source: "10 FOR I = 1 TO 2\n20 IF 1 THEN NEXT J\n30 NEXT I\n",
      diagnostics: [{ code: "BAS1402", sourcePath: "inline-if-mismatched-next.bas", line: 2, column: 19 }],
      message: /next|mismatch|variable/i,
    },
  ];

  for (const basicCase of cases) {
    const result = compile(basicCase.source, { sourcePath: basicCase.sourcePath });

    assert.equal(result.code, "");
    assert.deepEqual(diagnosticSummary(result.diagnostics), basicCase.diagnostics);
    assert.match(result.diagnostics[0].message, basicCase.message);
  }
});

test("allows valid inline IF non-loop statements", () => {
  const sourcePath = "inline-if-print.bas";
  const source = "10 IF 1 THEN PRINT \"OK\"\n20 END\n";

  assert.deepEqual(analyzeSource(source, sourcePath).diagnostics, []);
  assert.deepEqual(compile(source, { sourcePath }).diagnostics, []);
});

test("reports BAS1403 for jumps across FOR/NEXT boundaries", () => {
  const sourcePath = "jump-across-for-next.bas";
  const result = analyzeSource(
    [
      "10 GOTO 40",
      "20 FOR I = 1 TO 3",
      "30 PRINT I",
      "40 NEXT I",
      "50 FOR J = 1 TO 2",
      "60 GOTO 80",
      "70 NEXT J",
      "80 END",
    ].join("\n") + "\n",
    sourcePath,
  );

  assert.deepEqual(diagnosticSummary(result.diagnostics), [
    { code: "BAS1403", sourcePath, line: 1, column: 4 },
    { code: "BAS1403", sourcePath, line: 6, column: 4 },
  ]);
  for (const diagnostic of result.diagnostics) {
    assert.match(diagnostic.message, /for|next|jump|boundary/i);
  }
});

test("reports BAS1403 for same-depth jumps into a later FOR/NEXT boundary", () => {
  const sourcePath = "same-depth-jump-into-later-loop.bas";
  const source = [
    "10 FOR I = 1 TO 1",
    "20 GOTO 60",
    "30 NEXT I",
    "40 FOR J = 1 TO 1",
    "50 PRINT J",
    "60 NEXT J",
  ].join("\n") + "\n";

  const result = compile(source, { sourcePath });

  assert.equal(result.code, "");
  assert.deepEqual(diagnosticSummary(result.diagnostics), [
    { code: "BAS1403", sourcePath, line: 2, column: 4 },
  ]);
  assert.match(result.diagnostics[0].message, /for|next|jump|boundary/i);
});

test("allows jumps that stay within the same FOR/NEXT context", () => {
  const sourcePath = "jump-within-same-loop.bas";
  const result = analyzeSource(
    [
      "10 FOR I = 1 TO 1",
      "20 GOTO 40",
      "30 PRINT I",
      "40 NEXT I",
    ].join("\n") + "\n",
    sourcePath,
  );

  assert.deepEqual(result.diagnostics, []);
});

test("reports BAS1302 for statically known array use before DIM", () => {
  const sourcePath = "array-before-dim.bas";
  const result = analyzeSource("10 A(0) = 1\n20 PRINT B(0)\n30 DIM A(2)\n", sourcePath);

  assert.deepEqual(diagnosticSummary(result.diagnostics), [
    { code: "BAS1302", sourcePath, line: 1, column: 4 },
    { code: "BAS1302", sourcePath, line: 2, column: 10 },
  ]);
  for (const diagnostic of result.diagnostics) {
    assert.match(diagnostic.message, /array|dim/i);
  }
});
