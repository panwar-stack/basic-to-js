"use strict";

const KEYWORDS = new Set([
  "ABS",
  "AND",
  "DIM",
  "ELSE",
  "END",
  "FOR",
  "GOSUB",
  "GOTO",
  "IF",
  "INPUT",
  "INT",
  "LEFT$",
  "LEN",
  "LET",
  "MID$",
  "NEXT",
  "NOT",
  "OR",
  "PRINT",
  "REM",
  "RETURN",
  "RIGHT$",
  "RND",
  "STEP",
  "STOP",
  "STR$",
  "THEN",
  "TO",
  "VAL",
]);

const SINGLE_CHARACTER_TOKENS = {
  "+": "operator",
  "-": "operator",
  "*": "operator",
  "/": "operator",
  "^": "operator",
  "=": "operator",
  "<": "operator",
  ">": "operator",
  "(": "leftParen",
  ")": "rightParen",
  ",": "comma",
  ";": "semicolon",
  ":": "colon",
};

function lex(source, options = {}) {
  const sourcePath = options.sourcePath || options.file || "<unknown>";
  const tokens = [];
  const diagnostics = [];

  if (typeof source !== "string") {
    return {
      tokens,
      diagnostics: [
        createDiagnostic(sourcePath, 1, 1, "BAS1002", "Source must be a string"),
      ],
    };
  }

  let index = 0;
  let line = 1;
  let column = 1;
  let atLineStart = true;
  let canStartStatement = true;

  while (index < source.length) {
    const char = source[index];

    if (char === " " || char === "\t" || char === "\v" || char === "\f") {
      advance();
      continue;
    }

    if (char === "\r" || char === "\n") {
      const startLine = line;
      const startColumn = column;
      const lexeme = consumeNewline();
      tokens.push(createToken("newline", lexeme, startLine, startColumn));
      atLineStart = true;
      canStartStatement = true;
      continue;
    }

    if (char === "\"") {
      consumeString();
      canStartStatement = false;
      continue;
    }

    if (char === "'") {
      consumeApostropheComment();
      atLineStart = false;
      canStartStatement = false;
      continue;
    }

    if (isDigit(char) || (char === "." && isDigit(peek(1)))) {
      const type = consumeNumber(atLineStart && isDigit(char));
      atLineStart = false;
      canStartStatement = type === "lineLabel";
      continue;
    }

    if (isIdentifierStart(char)) {
      consumeIdentifierOrKeyword();
      atLineStart = false;
      continue;
    }

    const twoCharacters = char + peek(1);
    if (twoCharacters === "<>" || twoCharacters === "<=" || twoCharacters === ">=") {
      tokens.push(createToken("operator", twoCharacters, line, column));
      advance();
      advance();
      atLineStart = false;
      canStartStatement = false;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(SINGLE_CHARACTER_TOKENS, char)) {
      const token = createToken(SINGLE_CHARACTER_TOKENS[char], char, line, column);
      tokens.push(token);
      advance();
      atLineStart = false;
      canStartStatement = char === ":";
      continue;
    }

    diagnostics.push(createDiagnostic(sourcePath, line, column, "BAS1002", `Unknown token: ${char}`));
    tokens.push(createToken("unknown", char, line, column));
    advance();
    atLineStart = false;
    canStartStatement = false;
  }

  return {
    tokens,
    diagnostics,
  };

  function consumeString() {
    const startIndex = index;
    const startLine = line;
    const startColumn = column;
    advance();

    while (index < source.length && source[index] !== "\"" && source[index] !== "\r" && source[index] !== "\n") {
      advance();
    }

    if (source[index] !== "\"") {
      const lexeme = source.slice(startIndex, index);
      diagnostics.push(createDiagnostic(sourcePath, startLine, startColumn, "BAS1001", "Unterminated string literal"));
      tokens.push(createToken("string", lexeme, startLine, startColumn, lexeme.slice(1)));
      return;
    }

    advance();
    const lexeme = source.slice(startIndex, index);
    tokens.push(createToken("string", lexeme, startLine, startColumn, lexeme.slice(1, -1)));
  }

  function consumeApostropheComment() {
    const startIndex = index;
    const startLine = line;
    const startColumn = column;

    while (index < source.length && source[index] !== "\r" && source[index] !== "\n") {
      advance();
    }

    const lexeme = source.slice(startIndex, index);
    tokens.push(createToken("comment", lexeme, startLine, startColumn, lexeme.slice(1).trimStart()));
  }

  function consumeNumber(isLineLabel) {
    const startIndex = index;
    const startLine = line;
    const startColumn = column;

    if (source[index] === ".") {
      advance();
    }

    while (isDigit(source[index])) {
      advance();
    }

    if (source[index] === "." && isDigit(peek(1))) {
      advance();
      while (isDigit(source[index])) {
        advance();
      }
    }

    const lexeme = source.slice(startIndex, index);
    const type = isLineLabel ? "lineLabel" : "number";
    tokens.push(createToken(type, lexeme, startLine, startColumn, Number(lexeme)));
    return type;
  }

  function consumeIdentifierOrKeyword() {
    const startIndex = index;
    const startLine = line;
    const startColumn = column;

    advance();
    while (isIdentifierPart(source[index])) {
      advance();
    }

    if (source[index] === "$" && source[index - 1] !== "$") {
      advance();
    }

    const lexeme = source.slice(startIndex, index).toUpperCase();
    const type = KEYWORDS.has(lexeme) ? "keyword" : "identifier";

    if (lexeme === "REM" && canStartStatement) {
      consumeRemComment(startIndex, startLine, startColumn);
      canStartStatement = false;
      return;
    }

    tokens.push(createToken(type, lexeme, startLine, startColumn, lexeme));
    canStartStatement = false;
  }

  function consumeRemComment(startIndex, startLine, startColumn) {
    while (index < source.length && source[index] !== "\r" && source[index] !== "\n") {
      advance();
    }

    const lexeme = source.slice(startIndex, index);
    tokens.push(createToken("comment", normalizeRemLexeme(lexeme), startLine, startColumn, lexeme.slice(3).trimStart()));
  }

  function consumeNewline() {
    if (source[index] === "\r" && source[index + 1] === "\n") {
      index += 2;
      line += 1;
      column = 1;
      return "\r\n";
    }

    const lexeme = source[index];
    index += 1;
    line += 1;
    column = 1;
    return lexeme;
  }

  function advance() {
    index += 1;
    column += 1;
  }

  function peek(offset) {
    return source[index + offset] || "";
  }
}

function createToken(type, lexeme, line, column, value) {
  const token = {
    type,
    lexeme,
    line,
    column,
  };

  if (value !== undefined) {
    token.value = value;
  }

  return token;
}

function createDiagnostic(file, line, column, code, message) {
  return {
    file,
    sourcePath: file,
    line,
    column,
    code,
    message,
  };
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}

function isIdentifierStart(char) {
  const upper = char && char.toUpperCase();
  return upper >= "A" && upper <= "Z";
}

function isIdentifierPart(char) {
  return isIdentifierStart(char) || isDigit(char);
}

function normalizeRemLexeme(lexeme) {
  return "REM" + lexeme.slice(3);
}

module.exports = {
  lex,
};
