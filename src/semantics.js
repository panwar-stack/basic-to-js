"use strict";

const BUILT_INS = {
  ABS: { args: ["number"], returns: "number" },
  INT: { args: ["number"], returns: "number" },
  LEN: { args: ["string"], returns: "number" },
  "LEFT$": { args: ["string", "number"], returns: "string" },
  "RIGHT$": { args: ["string", "number"], returns: "string" },
  "MID$": { args: ["string", "number", "number"], returns: "string" },
  "STR$": { args: ["number"], returns: "string" },
  VAL: { args: ["string"], returns: "number" },
  RND: { args: [], returns: "number" },
};

function analyze(program, options = {}) {
  const sourcePath = options.sourcePath || program.sourcePath || options.file || "<unknown>";
  const analyzer = new SemanticAnalyzer(sourcePath);
  analyzer.analyzeProgram(program);

  return {
    program,
    diagnostics: analyzer.diagnostics,
  };
}

class SemanticAnalyzer {
  constructor(sourcePath) {
    this.sourcePath = sourcePath;
    this.diagnostics = [];
    this.arrays = new Map();
    this.loopContextByIndex = [];
  }

  analyzeProgram(program) {
    this.program = program;
    this.pairLoops(program);
    for (let index = 0; index < program.statements.length; index += 1) {
      const statement = program.statements[index];
      this.analyzeStatement(statement, index);
    }
    this.validateJumpBoundaries(program);
  }

  pairLoops(program) {
    const stack = [];

    for (let index = 0; index < program.statements.length; index += 1) {
      const statement = program.statements[index];
      if (statement.type === "NextStatement") {
        this.loopContextByIndex[index] = stack.map((active) => active.index);
        const active = stack[stack.length - 1];
        if (!active) {
          this.addDiagnostic(statement, "BAS1401", "NEXT without matching FOR");
          continue;
        }
        if (statement.variable && statement.variable.name !== active.statement.variable.name) {
          this.addDiagnostic(statement.variable, "BAS1402", `Mismatched NEXT variable: expected ${active.statement.variable.name}, got ${statement.variable.name}`);
          stack.pop();
          continue;
        }
        statement.matchingForIndex = active.index;
        active.statement.matchingNextIndex = index;
        stack.pop();
        continue;
      }

      this.loopContextByIndex[index] = stack.map((active) => active.index);
      if (statement.type === "ForStatement") {
        if (statement.variable) {
          stack.push({ statement, index });
        }
      }
    }

    for (const active of stack.reverse()) {
      this.addDiagnostic(active.statement, "BAS1401", `FOR without matching NEXT: ${active.statement.variable.name}`);
    }
  }

  analyzeStatement(statement, sourceIndex = null) {
    if (statement.type === "AssignmentStatement") {
      const targetType = this.analyzeTarget(statement.target);
      const expressionType = this.analyzeExpression(statement.expression);
      if (expressionType !== "unknown" && targetType !== "unknown" && expressionType !== targetType) {
        this.addDiagnostic(statement.expression || statement.target, "BAS1301", `Type mismatch: cannot assign ${expressionType} to ${targetType} variable ${statement.target.name}`);
      }
      return;
    }

    if (statement.type === "InputStatement") {
      this.analyzeTarget(statement.target);
      if (statement.prompt) {
        const promptType = this.analyzeExpression(statement.prompt);
        if (promptType !== "unknown" && promptType !== "string") {
          this.addDiagnostic(statement.prompt, "BAS1301", `Type mismatch: INPUT prompt expects string, got ${promptType}`);
        }
      }
      return;
    }

    if (statement.type === "ForStatement") {
      if (statement.variable && statement.variable.valueType !== "number") {
        this.addDiagnostic(statement.variable, "BAS1301", `Type mismatch: FOR variable must be numeric, got ${statement.variable.name}`);
      }
      this.expectNumber(statement.start, "FOR start expression");
      this.expectNumber(statement.end, "FOR end expression");
      if (statement.step) {
        this.expectNumber(statement.step, "FOR STEP expression");
      }
      return;
    }

    if (statement.type === "NextStatement") {
      if (statement.variable && statement.variable.valueType !== "number") {
        this.addDiagnostic(statement.variable, "BAS1301", `Type mismatch: NEXT variable must be numeric, got ${statement.variable.name}`);
      }
      return;
    }

    if (statement.type === "DimStatement") {
      const upperBoundType = this.analyzeExpression(statement.upperBound);
      if (upperBoundType !== "unknown" && upperBoundType !== "number") {
        this.addDiagnostic(statement.upperBound || statement, "BAS1301", `Type mismatch: DIM upper bound expects number, got ${upperBoundType}`);
      }
      if (statement.name) {
        this.arrays.set(statement.name, statement);
      }
      return;
    }

    if (statement.type === "PrintStatement") {
      for (const item of statement.items) {
        this.analyzeExpression(item.expression || item);
      }
      return;
    }

    if (statement.type === "IfStatement") {
      const testType = this.analyzeExpression(statement.test);
      if (testType !== "unknown" && !isTruthCompatible(testType)) {
        this.addDiagnostic(statement.test || statement, "BAS1301", `Type mismatch: IF expects boolean or number condition, got ${testType}`);
      }
      this.analyzeBranchTarget(statement.thenBranch, sourceIndex);
      this.analyzeBranchTarget(statement.elseBranch, sourceIndex);
      return;
    }

    if (statement.type === "GotoStatement" || statement.type === "GosubStatement") {
      this.validateLabelTarget(statement, statement.targetLabel);
    }
  }

  analyzeBranchTarget(branch, sourceIndex) {
    if (!branch) {
      return;
    }
    if (branch.type === "LineNumberBranch") {
      this.validateLabelTarget(branch, branch.targetLabel);
      return;
    }
    if (branch.type === "ForStatement" || branch.type === "NextStatement") {
      this.validateInlineLoopBranch(branch, sourceIndex);
    }
    this.analyzeStatement(branch, sourceIndex);
  }

  validateInlineLoopBranch(branch, sourceIndex) {
    if (branch.type === "ForStatement") {
      this.addDiagnostic(branch, "BAS1401", `FOR without matching NEXT: ${branch.variable ? branch.variable.name : "<unknown>"}`);
      return;
    }

    const context = sourceIndex === null ? [] : this.loopContextByIndex[sourceIndex] || [];
    const activeIndex = context[context.length - 1];
    if (activeIndex === undefined) {
      this.addDiagnostic(branch, "BAS1401", "NEXT without matching FOR");
      return;
    }

    const active = this.program.statements[activeIndex];
    if (branch.variable && active.variable && branch.variable.name !== active.variable.name) {
      this.addDiagnostic(branch.variable, "BAS1402", `Mismatched NEXT variable: expected ${active.variable.name}, got ${branch.variable.name}`);
      return;
    }

    this.addDiagnostic(branch, "BAS1403", "Unsupported inline IF NEXT across FOR/NEXT boundary");
  }

  validateLabelTarget(node, targetLabel) {
    if (typeof targetLabel !== "number" || !this.program.labels.has(targetLabel)) {
      this.addDiagnostic(node, "BAS1202", `Missing branch target label: ${targetLabel}`);
    }
  }

  validateJumpBoundaries(program) {
    for (let index = 0; index < program.statements.length; index += 1) {
      const statement = program.statements[index];
      if (statement.type === "GotoStatement" || statement.type === "GosubStatement") {
        this.validateJumpBoundary(statement, index, statement.targetLabel);
      } else if (statement.type === "IfStatement") {
        this.validateBranchBoundary(statement.thenBranch, index);
        this.validateBranchBoundary(statement.elseBranch, index);
      }
    }
  }

  validateBranchBoundary(branch, sourceIndex) {
    if (branch && branch.type === "LineNumberBranch") {
      this.validateJumpBoundary(branch, sourceIndex, branch.targetLabel);
    }
  }

  validateJumpBoundary(node, sourceIndex, targetLabel) {
    if (typeof targetLabel !== "number" || !this.program.labels.has(targetLabel)) {
      return;
    }
    const targetIndex = this.program.labels.get(targetLabel);
    if (!sameLoopContext(this.loopContextByIndex[sourceIndex], this.loopContextByIndex[targetIndex])) {
      this.addDiagnostic(node, "BAS1403", "Unsupported jump across FOR/NEXT boundary");
    }
  }

  analyzeTarget(target) {
    if (!target) {
      return "unknown";
    }
    if (target.type === "ArrayTarget") {
      this.validateArrayAccess(target);
      return target.valueType;
    }
    return target.valueType || "unknown";
  }

  expectNumber(expression, context) {
    const valueType = this.analyzeExpression(expression);
    if (valueType !== "unknown" && valueType !== "number") {
      this.addDiagnostic(expression, "BAS1301", `Type mismatch: ${context} expects number, got ${valueType}`);
    }
  }

  analyzeExpression(expression) {
    if (!expression) {
      return "unknown";
    }

    switch (expression.type) {
      case "NumericLiteral":
        expression.valueType = "number";
        return expression.valueType;
      case "StringLiteral":
        expression.valueType = "string";
        return expression.valueType;
      case "IdentifierExpression":
        expression.valueType = expression.name.endsWith("$") ? "string" : "number";
        return expression.valueType;
      case "ArrayExpression":
        this.validateArrayAccess(expression);
        expression.valueType = expression.name.endsWith("$") ? "string" : "number";
        return expression.valueType;
      case "GroupingExpression":
        expression.valueType = this.analyzeExpression(expression.expression);
        return expression.valueType;
      case "UnaryExpression":
        return this.analyzeUnaryExpression(expression);
      case "BinaryExpression":
        return this.analyzeBinaryExpression(expression);
      case "CallExpression":
        return this.analyzeCallExpression(expression);
      default:
        expression.valueType = expression.valueType || "unknown";
        return expression.valueType;
    }
  }

  analyzeUnaryExpression(expression) {
    const argumentType = this.analyzeExpression(expression.argument);

    if (expression.operator === "NOT") {
      if (!isTruthCompatible(argumentType)) {
        this.addDiagnostic(expression.argument || expression, "BAS1301", `Type mismatch: NOT expects boolean or number, got ${argumentType}`);
        expression.valueType = "unknown";
        return expression.valueType;
      }
      expression.valueType = "boolean";
      return expression.valueType;
    }

    if (argumentType !== "number") {
      this.addDiagnostic(expression.argument || expression, "BAS1301", `Type mismatch: unary ${expression.operator} expects number, got ${argumentType}`);
      expression.valueType = "unknown";
      return expression.valueType;
    }

    expression.valueType = "number";
    return expression.valueType;
  }

  analyzeBinaryExpression(expression) {
    const leftType = this.analyzeExpression(expression.left);
    const rightType = this.analyzeExpression(expression.right);

    if (leftType === "unknown" || rightType === "unknown") {
      expression.valueType = "unknown";
      return expression.valueType;
    }

    if (expression.operator === "AND" || expression.operator === "OR") {
      if (!isTruthCompatible(leftType) || !isTruthCompatible(rightType)) {
        this.addDiagnostic(expression, "BAS1301", `Type mismatch: ${expression.operator} expects boolean or number operands`);
        expression.valueType = "unknown";
        return expression.valueType;
      }
      expression.valueType = "boolean";
      return expression.valueType;
    }

    if (isComparisonOperator(expression.operator)) {
      if (leftType !== rightType) {
        this.addDiagnostic(expression, "BAS1301", `Type mismatch: cannot compare ${leftType} with ${rightType}`);
        expression.valueType = "unknown";
        return expression.valueType;
      }
      expression.valueType = "boolean";
      return expression.valueType;
    }

    if (expression.operator === "+" && leftType === "string" && rightType === "string") {
      expression.valueType = "string";
      return expression.valueType;
    }

    if (["+", "-", "*", "/", "^"].includes(expression.operator)) {
      if (leftType !== "number" || rightType !== "number") {
        this.addDiagnostic(expression, "BAS1301", `Type mismatch: ${expression.operator} expects number operands`);
        expression.valueType = "unknown";
        return expression.valueType;
      }
      expression.valueType = "number";
      return expression.valueType;
    }

    expression.valueType = "unknown";
    return expression.valueType;
  }

  analyzeCallExpression(expression) {
    const signature = BUILT_INS[expression.callee];
    if (!signature) {
      expression.valueType = "unknown";
      return expression.valueType;
    }

    const argTypes = expression.args.map((arg) => this.analyzeExpression(arg));
    let valid = true;

    if (argTypes.length !== signature.args.length) {
      this.addDiagnostic(expression, "BAS1301", `Type mismatch: ${expression.callee} expects ${signature.args.length} argument(s), got ${argTypes.length}`);
      valid = false;
    }

    const count = Math.min(argTypes.length, signature.args.length);
    for (let index = 0; index < count; index += 1) {
      if (argTypes[index] !== "unknown" && argTypes[index] !== signature.args[index]) {
        this.addDiagnostic(expression.args[index], "BAS1301", `Type mismatch: ${expression.callee} argument ${index + 1} expects ${signature.args[index]}, got ${argTypes[index]}`);
        valid = false;
      }
    }

    expression.valueType = valid ? signature.returns : "unknown";
    return expression.valueType;
  }

  validateArrayAccess(node) {
    if (!this.arrays.has(node.name)) {
      this.addDiagnostic(node, "BAS1302", `Array used before DIM: ${node.name}`);
    }
    if (!node.indexes || node.indexes.length !== 1) {
      this.addDiagnostic(node, "BAS1303", `Wrong number of array indexes for ${node.name}: expected 1, got ${node.indexes ? node.indexes.length : 0}`);
    }
    for (const index of node.indexes || []) {
      const indexType = this.analyzeExpression(index);
      if (indexType !== "unknown" && indexType !== "number") {
        this.addDiagnostic(index, "BAS1301", `Type mismatch: array index expects number, got ${indexType}`);
      }
    }
  }

  addDiagnostic(node, code, message) {
    this.diagnostics.push({
      file: this.sourcePath,
      sourcePath: this.sourcePath,
      line: node && node.sourceLine ? node.sourceLine : 1,
      column: node && node.sourceColumn ? node.sourceColumn : 1,
      code,
      message,
    });
  }
}

function isTruthCompatible(valueType) {
  return valueType === "boolean" || valueType === "number";
}

function isComparisonOperator(operator) {
  return ["=", "<>", "<", "<=", ">", ">="].includes(operator);
}

function sameLoopContext(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

module.exports = {
  analyze,
};
