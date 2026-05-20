"use strict";

const { lex } = require("./lexer");

function parse(source, options = {}) {
  const sourcePath = options.sourcePath || options.file || "<unknown>";
  const lexResult = lex(source, { sourcePath });
  const parseResult = parseTokens(lexResult.tokens, { sourcePath });

  return {
    program: parseResult.program,
    diagnostics: lexResult.diagnostics.concat(parseResult.diagnostics),
  };
}

function parseTokens(tokens, options = {}) {
  const sourcePath = options.sourcePath || options.file || "<unknown>";
  const parser = new Parser(tokens, sourcePath);

  return parser.parseProgram();
}

class Parser {
  constructor(tokens, sourcePath) {
    this.tokens = tokens;
    this.sourcePath = sourcePath;
    this.current = 0;
    this.diagnostics = [];
    this.stopAtElse = false;
    this.program = {
      type: "Program",
      sourcePath,
      lines: [],
      statements: [],
      labels: new Map(),
    };
  }

  parseProgram() {
    while (!this.isAtEnd()) {
      this.parseLine();
    }

    return {
      program: this.program,
      diagnostics: this.diagnostics,
    };
  }

  parseLine() {
    const firstToken = this.peek();
    const sourceLine = firstToken ? firstToken.line : 1;
    let label = null;

    if (this.match("lineLabel")) {
      const token = this.previous();
      label = token.value;
      if (this.program.labels.has(label)) {
        this.addDiagnostic(token, "BAS1201", `Duplicate line label: ${label}`);
      } else {
        this.program.labels.set(label, this.program.statements.length);
      }
    }

    const line = {
      type: "Line",
      sourceLine,
      label,
      statements: [],
    };

    while (!this.isAtEnd() && !this.check("newline")) {
      if (this.match("colon")) {
        continue;
      }

      const statement = this.parseStatement();
      if (statement) {
        line.statements.push(statement);
        this.program.statements.push(statement);
      }

      if (statement && statement.type === "CommentStatement") {
        this.skipToLineEnd();
        break;
      }

      if (this.check("comment")) {
        this.skipToLineEnd();
        break;
      }

      if (!this.match("colon") && !this.check("newline") && !this.isAtEnd()) {
        this.synchronizeStatement();
      }
    }

    this.match("newline");
    this.program.lines.push(line);
  }

  parseStatement() {
    const token = this.peek();
    if (!token) {
      return null;
    }

    if (token.type === "comment") {
      this.advance();
      return {
        type: "CommentStatement",
        sourceLine: token.line,
        sourceColumn: token.column,
        marker: token.lexeme.startsWith("'") ? "'" : "REM",
        text: token.value || "",
      };
    }

    if (this.matchKeyword("PRINT")) {
      return this.parsePrintStatement(this.previous());
    }

    if (this.matchKeyword("INPUT")) {
      return this.parseInputStatement(this.previous());
    }

    if (this.matchKeyword("IF")) {
      return this.parseIfStatement(this.previous());
    }

    if (this.matchKeyword("GOTO")) {
      return this.parseBranchStatement("GotoStatement", this.previous());
    }

    if (this.matchKeyword("GOSUB")) {
      return this.parseBranchStatement("GosubStatement", this.previous());
    }

    if (this.matchKeyword("RETURN")) {
      return this.createSimpleStatement("ReturnStatement", this.previous());
    }

    if (this.matchKeyword("FOR")) {
      return this.parseForStatement(this.previous());
    }

    if (this.matchKeyword("NEXT")) {
      return this.parseNextStatement(this.previous());
    }

    if (this.matchKeyword("DIM")) {
      return this.parseDimStatement(this.previous());
    }

    if (this.matchKeyword("LET")) {
      return this.parseAssignmentStatement(this.previous(), true);
    }

    if (this.check("identifier")) {
      return this.parseAssignmentStatement(this.peek(), false);
    }

    if (this.matchKeyword("END")) {
      return this.createSimpleStatement("EndStatement", this.previous());
    }

    if (this.matchKeyword("STOP")) {
      return this.createSimpleStatement("StopStatement", this.previous());
    }

    this.addDiagnostic(token, "BAS1101", `Unknown statement: ${token.lexeme}`);
    this.advance();
    return null;
  }

  parsePrintStatement(startToken) {
    const statement = {
      type: "PrintStatement",
      sourceLine: startToken.line,
      sourceColumn: startToken.column,
      items: [],
      trailingSeparator: null,
    };

    while (!this.isAtStatementBoundary()) {
      if (this.match("comma", "semicolon")) {
        statement.trailingSeparator = this.previous().lexeme;
        continue;
      }

      const expression = this.parseExpressionUntil(new Set(["comma", "semicolon"]));
      if (!expression) {
        const token = this.peek() || startToken;
        this.addDiagnostic(token, "BAS1103", "Expected expression");
        break;
      }

      statement.items.push({
        ...expression,
        expression,
        separator: null,
      });
      statement.trailingSeparator = null;

      if (this.match("comma", "semicolon")) {
        const separator = this.previous().lexeme;
        statement.items[statement.items.length - 1].separator = separator;
        statement.trailingSeparator = separator;
      }
    }

    return statement;
  }

  parseInputStatement(startToken) {
    const statement = {
      type: "InputStatement",
      sourceLine: startToken.line,
      sourceColumn: startToken.column,
      prompt: null,
      promptSeparator: null,
      target: null,
    };

    if (this.match("string")) {
      const promptToken = this.previous();
      statement.prompt = this.createExpression("StringLiteral", promptToken, {
        value: promptToken.value,
        raw: promptToken.lexeme,
        valueType: "string",
      });
      if (!this.match("semicolon", "comma")) {
        this.addDiagnostic(this.peek() || promptToken, "BAS1103", "Expected prompt separator");
        this.synchronizeStatement();
        return statement;
      }
      statement.promptSeparator = this.previous().lexeme;
    }

    if (!this.check("identifier")) {
      this.addDiagnostic(this.peek() || startToken, "BAS1102", "Expected INPUT target");
      this.synchronizeStatement();
      return statement;
    }

    const targetToken = this.advance();
    statement.target = this.parseTargetAfterIdentifier(targetToken);
    return statement;
  }

  parseAssignmentStatement(startToken, hasLet) {
    if (!this.check("identifier")) {
      this.addDiagnostic(this.peek() || startToken, "BAS1102", "Expected assignment target");
      this.synchronizeStatement();
      return null;
    }

    const targetToken = this.advance();
    const target = this.parseTargetAfterIdentifier(targetToken);
    const statement = {
      type: "AssignmentStatement",
      sourceLine: startToken.line,
      sourceColumn: startToken.column,
      keyword: hasLet ? "LET" : null,
      target,
      expression: null,
    };

    if (!this.matchOperator("=")) {
      this.addDiagnostic(this.peek() || targetToken, hasLet ? "BAS1103" : "BAS1102", hasLet ? "Expected = and expression" : "Expected assignment operator");
      this.synchronizeStatement();
      return statement;
    }

    const expression = this.parseExpressionUntil(new Set());
    if (!expression) {
      this.addDiagnostic(this.peek() || targetToken, "BAS1103", "Expected expression");
    }
    statement.expression = expression;

    return statement;
  }

  parseIfStatement(startToken) {
    const statement = {
      type: "IfStatement",
      sourceLine: startToken.line,
      sourceColumn: startToken.column,
      test: null,
      thenBranch: null,
      elseBranch: null,
    };

    statement.test = this.parseExpressionUntil(new Set(["THEN"]));
    if (!statement.test) {
      this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected IF condition");
    }

    if (!this.matchKeyword("THEN")) {
      this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected THEN");
      this.synchronizeStatement();
      return statement;
    }

    statement.thenBranch = this.parseIfBranch();
    if (!statement.thenBranch) {
      this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected THEN branch");
    }

    if (this.matchKeyword("ELSE")) {
      statement.elseBranch = this.parseIfBranch();
      if (!statement.elseBranch) {
        this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected ELSE branch");
      }
    }

    return statement;
  }

  parseForStatement(startToken) {
    const statement = {
      type: "ForStatement",
      sourceLine: startToken.line,
      sourceColumn: startToken.column,
      variable: null,
      start: null,
      end: null,
      step: null,
      matchingNextIndex: null,
    };

    if (!this.check("identifier")) {
      this.addDiagnostic(this.peek() || startToken, "BAS1102", "Expected FOR variable");
      this.synchronizeStatement();
      return statement;
    }

    statement.variable = this.createIdentifierTarget(this.advance());
    if (!this.matchOperator("=")) {
      this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected = in FOR statement");
      this.synchronizeStatement();
      return statement;
    }

    statement.start = this.parseExpressionUntil(new Set(["TO"]));
    if (!statement.start) {
      this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected FOR start expression");
    }

    if (!this.matchKeyword("TO")) {
      this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected TO in FOR statement");
      this.synchronizeStatement();
      return statement;
    }

    statement.end = this.parseExpressionUntil(new Set(["STEP"]));
    if (!statement.end) {
      this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected FOR end expression");
    }

    if (this.matchKeyword("STEP")) {
      statement.step = this.parseExpressionUntil(new Set());
      if (!statement.step) {
        this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected FOR STEP expression");
      }
    }

    return statement;
  }

  parseNextStatement(startToken) {
    let variable = null;
    if (this.check("identifier")) {
      variable = this.createIdentifierTarget(this.advance());
    }

    return {
      type: "NextStatement",
      sourceLine: startToken.line,
      sourceColumn: startToken.column,
      variable,
      matchingForIndex: null,
    };
  }

  parseDimStatement(startToken) {
    const statement = {
      type: "DimStatement",
      sourceLine: startToken.line,
      sourceColumn: startToken.column,
      name: null,
      valueType: "unknown",
      upperBound: null,
    };

    if (!this.check("identifier")) {
      this.addDiagnostic(this.peek() || startToken, "BAS1102", "Expected DIM array name");
      this.synchronizeStatement();
      return statement;
    }

    const nameToken = this.advance();
    statement.name = nameToken.value;
    statement.valueType = nameToken.value.endsWith("$") ? "string" : "number";

    if (!this.match("leftParen")) {
      this.addDiagnostic(this.peek() || nameToken, "BAS1103", "Expected array upper bound");
      this.synchronizeStatement();
      return statement;
    }

    statement.upperBound = this.parseOrExpression(new Set(["rightParen"]));
    if (!statement.upperBound) {
      this.addDiagnostic(this.peek() || nameToken, "BAS1103", "Expected array upper bound expression");
    }
    if (!this.match("rightParen")) {
      this.addDiagnostic(this.peek() || nameToken, "BAS1103", "Expected closing parenthesis");
      this.synchronizeStatement();
    }

    return statement;
  }

  parseIfBranch() {
    if (this.isAtStatementBoundary() || this.checkKeyword("ELSE")) {
      return null;
    }

    if (this.match("number")) {
      return this.createLineNumberBranch(this.previous());
    }

    const previousStopAtElse = this.stopAtElse;
    this.stopAtElse = true;
    const statement = this.parseStatement();
    this.stopAtElse = previousStopAtElse;
    return statement;
  }

  parseBranchStatement(type, startToken) {
    const statement = {
      type,
      sourceLine: startToken.line,
      sourceColumn: startToken.column,
      targetLabel: null,
    };

    if (!this.match("number")) {
      this.addDiagnostic(this.peek() || startToken, "BAS1103", "Expected line number");
      this.synchronizeStatement();
      return statement;
    }

    statement.targetLabel = this.previous().value;
    return statement;
  }

  createLineNumberBranch(token) {
    return {
      type: "LineNumberBranch",
      targetLabel: token.value,
      sourceLine: token.line,
      sourceColumn: token.column,
    };
  }

  parseExpressionUntil(stopTypes) {
    if (this.isAtExpressionBoundary(stopTypes)) {
      return null;
    }

    const expression = this.parseOrExpression(stopTypes);
    if (!expression) {
      return null;
    }

    if (!this.isAtExpressionBoundary(stopTypes)) {
      this.addDiagnostic(this.peek(), "BAS1103", "Expected expression");
      this.synchronizeExpression(stopTypes);
    }

    return expression;
  }

  parseOrExpression(stopTypes) {
    let expression = this.parseAndExpression(stopTypes);

    while (expression && this.matchExpressionKeyword("OR", stopTypes)) {
      expression = this.createBinaryExpression(expression, this.previous(), this.parseAndExpression(stopTypes));
    }

    return expression;
  }

  parseAndExpression(stopTypes) {
    let expression = this.parseComparisonExpression(stopTypes);

    while (expression && this.matchExpressionKeyword("AND", stopTypes)) {
      expression = this.createBinaryExpression(expression, this.previous(), this.parseComparisonExpression(stopTypes));
    }

    return expression;
  }

  parseComparisonExpression(stopTypes) {
    let expression = this.parseAdditiveExpression(stopTypes);

    while (expression && this.matchComparisonOperator(stopTypes)) {
      expression = this.createBinaryExpression(expression, this.previous(), this.parseAdditiveExpression(stopTypes));
    }

    return expression;
  }

  parseAdditiveExpression(stopTypes) {
    let expression = this.parseMultiplicativeExpression(stopTypes);

    while (expression && this.matchExpressionOperator(stopTypes, "+", "-")) {
      expression = this.createBinaryExpression(expression, this.previous(), this.parseMultiplicativeExpression(stopTypes));
    }

    return expression;
  }

  parseMultiplicativeExpression(stopTypes) {
    let expression = this.parseUnaryExpression(stopTypes);

    while (expression && this.matchExpressionOperator(stopTypes, "*", "/")) {
      expression = this.createBinaryExpression(expression, this.previous(), this.parseUnaryExpression(stopTypes));
    }

    return expression;
  }

  parsePowerExpression(stopTypes) {
    let expression = this.parsePrimaryExpression(stopTypes);

    if (expression && this.matchExpressionOperator(stopTypes, "^")) {
      expression = this.createBinaryExpression(expression, this.previous(), this.parseUnaryExpression(stopTypes));
    }

    return expression;
  }

  parseUnaryExpression(stopTypes) {
    if (this.matchExpressionOperator(stopTypes, "+", "-")) {
      const operator = this.previous();
      return this.createUnaryExpression(operator, this.parsePowerExpression(stopTypes));
    }

    if (this.matchExpressionKeyword("NOT", stopTypes)) {
      const operator = this.previous();
      return this.createUnaryExpression(operator, this.parsePowerExpression(stopTypes));
    }

    return this.parsePowerExpression(stopTypes);
  }

  parsePrimaryExpression(stopTypes) {
    if (this.isAtExpressionBoundary(stopTypes)) {
      return null;
    }

    if (this.match("number")) {
      const token = this.previous();
      return this.createExpression("NumericLiteral", token, {
        value: token.value,
        raw: token.lexeme,
        valueType: "number",
      });
    }

    if (this.match("string")) {
      const token = this.previous();
      return this.createExpression("StringLiteral", token, {
        value: token.value,
        raw: token.lexeme,
        valueType: "string",
      });
    }

    if (this.match("identifier")) {
      const token = this.previous();
      if (this.match("leftParen")) {
        return this.parseArrayExpression(token, stopTypes);
      }
      return this.createExpression("IdentifierExpression", token, {
        name: token.value,
        valueType: token.value.endsWith("$") ? "string" : "number",
      });
    }

    if (this.check("keyword") && this.isCallName(this.peek().value)) {
      return this.parseCallExpression(stopTypes);
    }

    if (this.match("leftParen")) {
      const leftParen = this.previous();
      const expression = this.parseOrExpression(new Set(["rightParen"]));
      if (!expression) {
        this.addDiagnostic(this.peek() || leftParen, "BAS1103", "Expected expression");
      }
      if (!this.match("rightParen")) {
        this.addDiagnostic(this.peek() || leftParen, "BAS1103", "Expected closing parenthesis");
      }
      return this.createExpression("GroupingExpression", leftParen, {
        expression,
        valueType: expression ? expression.valueType : "unknown",
      });
    }

    this.addDiagnostic(this.peek(), "BAS1103", "Expected expression");
    this.advance();
    return null;
  }

  parseArrayExpression(token, stopTypes) {
    const indexes = this.parseArrayIndexes(token, stopTypes);
    return this.createExpression("ArrayExpression", token, {
      name: token.value,
      indexes,
      valueType: token.value.endsWith("$") ? "string" : "number",
    });
  }

  parseArrayIndexes(token, stopTypes) {
    const indexes = [];
    if (!this.check("rightParen")) {
      do {
        const index = this.parseOrExpression(new Set(["comma", "rightParen"]));
        if (!index) {
          this.addDiagnostic(this.peek() || token, "BAS1103", "Expected array index expression");
          break;
        }
        indexes.push(index);
      } while (this.match("comma"));
    }
    if (!this.match("rightParen")) {
      this.addDiagnostic(this.peek() || token, "BAS1103", "Expected closing parenthesis");
      this.synchronizeExpression(stopTypes);
    }
    return indexes;
  }

  parseTargetAfterIdentifier(token) {
    if (this.match("leftParen")) {
      return {
        type: "ArrayTarget",
        name: token.value,
        valueType: token.value.endsWith("$") ? "string" : "number",
        indexes: this.parseArrayIndexes(token, new Set()),
        sourceLine: token.line,
        sourceColumn: token.column,
      };
    }
    return this.createIdentifierTarget(token);
  }

  parseCallExpression(stopTypes) {
    const callee = this.advance();
    const args = [];

    if (!this.match("leftParen")) {
      this.addDiagnostic(this.peek() || callee, "BAS1103", "Expected function arguments");
      return this.createExpression("CallExpression", callee, {
        callee: callee.value,
        args,
        valueType: inferCallValueType(callee.value),
      });
    }

    if (!this.check("rightParen")) {
      do {
        const arg = this.parseOrExpression(new Set(["comma", "rightParen"]));
        if (!arg) {
          this.addDiagnostic(this.peek() || callee, "BAS1103", "Expected expression");
          break;
        }
        args.push(arg);
      } while (this.match("comma"));
    }

    if (!this.match("rightParen")) {
      this.addDiagnostic(this.peek() || callee, "BAS1103", "Expected closing parenthesis");
      this.synchronizeExpression(stopTypes);
    }

    return this.createExpression("CallExpression", callee, {
      callee: callee.value,
      args,
      valueType: inferCallValueType(callee.value),
    });
  }

  createBinaryExpression(left, operator, right) {
    if (!right) {
      this.addDiagnostic(operator, "BAS1103", "Expected expression");
    }

    return this.createExpression("BinaryExpression", operator, {
      operator: operator.value || operator.lexeme,
      left,
      right,
      valueType: inferBinaryValueType(operator.value || operator.lexeme, left, right),
    });
  }

  createUnaryExpression(operator, argument) {
    if (!argument) {
      this.addDiagnostic(operator, "BAS1103", "Expected expression");
    }

    return this.createExpression("UnaryExpression", operator, {
      operator: operator.value || operator.lexeme,
      argument,
      valueType: operator.value === "NOT" ? "boolean" : "number",
    });
  }

  createExpression(type, token, fields) {
    return {
      type,
      sourceLine: token.line,
      sourceColumn: token.column,
      ...fields,
    };
  }

  createSimpleStatement(type, token) {
    return {
      type,
      sourceLine: token.line,
      sourceColumn: token.column,
    };
  }

  createIdentifierTarget(token) {
    return {
      type: "Identifier",
      name: token.value,
      valueType: token.value.endsWith("$") ? "string" : "number",
      sourceLine: token.line,
      sourceColumn: token.column,
    };
  }

  synchronizeStatement() {
    while (!this.isAtEnd() && !this.check("colon") && !this.check("newline")) {
      this.advance();
    }
  }

  skipToLineEnd() {
    while (!this.isAtEnd() && !this.check("newline")) {
      this.advance();
    }
  }

  isAtStatementBoundary() {
    return this.isAtEnd() || this.check("colon") || this.check("newline") || this.check("comment") || (this.stopAtElse && this.checkKeyword("ELSE"));
  }

  isAtExpressionBoundary(stopTypes) {
    const token = this.peek();
    return this.isAtStatementBoundary() || stopTypes.has(token && token.type) || stopTypes.has(token && token.value);
  }

  synchronizeExpression(stopTypes) {
    while (!this.isAtExpressionBoundary(stopTypes)) {
      this.advance();
    }
  }

  matchExpressionKeyword(keyword, stopTypes) {
    if (!this.isAtExpressionBoundary(stopTypes) && this.check("keyword") && this.peek().value === keyword) {
      this.advance();
      return true;
    }
    return false;
  }

  matchExpressionOperator(stopTypes, ...operators) {
    if (!this.isAtExpressionBoundary(stopTypes) && this.check("operator") && operators.includes(this.peek().lexeme)) {
      this.advance();
      return true;
    }
    return false;
  }

  matchComparisonOperator(stopTypes) {
    return this.matchExpressionOperator(stopTypes, "=", "<>", "<", "<=", ">", ">=");
  }

  isCallName(name) {
    return BUILT_IN_CALLS.has(name);
  }

  matchKeyword(keyword) {
    if (this.checkKeyword(keyword)) {
      this.advance();
      return true;
    }
    return false;
  }

  checkKeyword(keyword) {
    return this.check("keyword") && this.peek().value === keyword;
  }

  matchOperator(operator) {
    if (this.check("operator") && this.peek().lexeme === operator) {
      this.advance();
      return true;
    }
    return false;
  }

  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  check(type) {
    return !this.isAtEnd() && this.peek().type === type;
  }

  advance() {
    if (!this.isAtEnd()) {
      this.current += 1;
    }
    return this.previous();
  }

  isAtEnd() {
    return this.current >= this.tokens.length;
  }

  peek() {
    return this.tokens[this.current];
  }

  previous() {
    return this.tokens[this.current - 1];
  }

  addDiagnostic(token, code, message) {
    this.diagnostics.push({
      file: this.sourcePath,
      sourcePath: this.sourcePath,
      line: token && token.line ? token.line : 1,
      column: token && token.column ? token.column : 1,
      code,
      message,
    });
  }
}

const BUILT_IN_CALLS = new Set(["ABS", "INT", "LEN", "LEFT$", "RIGHT$", "MID$", "STR$", "VAL", "RND"]);

function inferCallValueType(name) {
  return name.endsWith("$") ? "string" : "number";
}

function inferBinaryValueType(operator, left, right) {
  if (["=", "<>", "<", "<=", ">", ">="].includes(operator) || operator === "AND" || operator === "OR") {
    return "boolean";
  }
  if (operator === "+" && left && right && left.valueType === "string" && right.valueType === "string") {
    return "string";
  }
  if (["+", "-", "*", "/", "^"].includes(operator)) {
    return "number";
  }
  return "unknown";
}

module.exports = {
  parse,
  parseTokens,
};
