"use strict";

/**
 * @typedef {Object} Program
 * @property {"Program"} type
 * @property {string} sourcePath
 * @property {BasicLine[]} lines
 * @property {Statement[]} statements
 * @property {Map<number, number>} labels
 */

/**
 * @typedef {Object} BasicLine
 * @property {"Line"} type
 * @property {number} sourceLine
 * @property {number | null} label
 * @property {Statement[]} statements
 */

/**
 * @typedef {PrintStatement | InputStatement | AssignmentStatement | IfStatement | GotoStatement | GosubStatement | ReturnStatement | ForStatement | NextStatement | DimStatement | EndStatement | StopStatement | CommentStatement} Statement
 */

/**
 * @typedef {Object} StatementBase
 * @property {string} type
 * @property {number} sourceLine
 * @property {number} sourceColumn
 */

/**
 * @typedef {NumericLiteral | StringLiteral | IdentifierExpression | ArrayExpression | UnaryExpression | BinaryExpression | GroupingExpression | CallExpression} Expression
 */

/**
 * @typedef {Object} ExpressionBase
 * @property {string} type
 * @property {"number" | "string" | "boolean" | "unknown"} valueType
 * @property {number} sourceLine
 * @property {number} sourceColumn
 */

/**
 * @typedef {ExpressionBase & Object} NumericLiteral
 * @property {"NumericLiteral"} type
 * @property {number} value
 * @property {string} raw
 */

/**
 * @typedef {ExpressionBase & Object} StringLiteral
 * @property {"StringLiteral"} type
 * @property {string} value
 * @property {string} raw
 */

/**
 * @typedef {ExpressionBase & Object} IdentifierExpression
 * @property {"IdentifierExpression"} type
 * @property {string} name
 */

/**
 * @typedef {ExpressionBase & Object} ArrayExpression
 * @property {"ArrayExpression"} type
 * @property {string} name
 * @property {Expression[]} indexes
 */

/**
 * @typedef {ExpressionBase & Object} UnaryExpression
 * @property {"UnaryExpression"} type
 * @property {string} operator
 * @property {Expression | null} argument
 */

/**
 * @typedef {ExpressionBase & Object} BinaryExpression
 * @property {"BinaryExpression"} type
 * @property {string} operator
 * @property {Expression} left
 * @property {Expression | null} right
 */

/**
 * @typedef {ExpressionBase & Object} GroupingExpression
 * @property {"GroupingExpression"} type
 * @property {Expression | null} expression
 */

/**
 * @typedef {ExpressionBase & Object} CallExpression
 * @property {"CallExpression"} type
 * @property {string} callee
 * @property {Expression[]} args
 */

/**
 * @typedef {ExpressionBase & Object} RawExpression
 * @property {"RawExpression"} type
 * @property {number} sourceLine
 * @property {number} sourceColumn
 * @property {import("./lexer").Token[]} tokens
 * @property {string} text
 */

/**
 * @typedef {Expression & Object} PrintItem
 * @property {Expression} expression
 * @property {"," | ";" | null} separator
 */

/**
 * @typedef {Object} IdentifierTarget
 * @property {"Identifier"} type
 * @property {string} name
 * @property {"number" | "string"} valueType
 * @property {number} sourceLine
 * @property {number} sourceColumn
 */

/**
 * @typedef {Object} ArrayTarget
 * @property {"ArrayTarget"} type
 * @property {string} name
 * @property {"number" | "string"} valueType
 * @property {Expression[]} indexes
 * @property {number} sourceLine
 * @property {number} sourceColumn
 */

/**
 * @typedef {StatementBase & Object} PrintStatement
 * @property {"PrintStatement"} type
 * @property {PrintItem[]} items
 * @property {"," | ";" | null} trailingSeparator
 */

/**
 * @typedef {StatementBase & Object} AssignmentStatement
 * @property {"AssignmentStatement"} type
 * @property {"LET" | null} keyword
 * @property {IdentifierTarget | ArrayTarget} target
 * @property {Expression | null} expression
 */

/**
 * @typedef {StatementBase & Object} InputStatement
 * @property {"InputStatement"} type
 * @property {StringLiteral | null} prompt
 * @property {"," | ";" | null} promptSeparator
 * @property {IdentifierTarget | ArrayTarget | null} target
 */

/**
 * @typedef {Object} LineNumberBranch
 * @property {"LineNumberBranch"} type
 * @property {number} targetLabel
 * @property {number} sourceLine
 * @property {number} sourceColumn
 */

/**
 * @typedef {Statement | LineNumberBranch} BranchTarget
 */

/**
 * @typedef {StatementBase & Object} IfStatement
 * @property {"IfStatement"} type
 * @property {Expression | null} test
 * @property {BranchTarget | null} thenBranch
 * @property {BranchTarget | null} elseBranch
 */

/**
 * @typedef {StatementBase & Object} GotoStatement
 * @property {"GotoStatement"} type
 * @property {number | null} targetLabel
 */

/**
 * @typedef {StatementBase & Object} GosubStatement
 * @property {"GosubStatement"} type
 * @property {number | null} targetLabel
 */

/**
 * @typedef {StatementBase & Object} ReturnStatement
 * @property {"ReturnStatement"} type
 */

/**
 * @typedef {StatementBase & Object} ForStatement
 * @property {"ForStatement"} type
 * @property {IdentifierTarget} variable
 * @property {Expression | null} start
 * @property {Expression | null} end
 * @property {Expression | null} step
 * @property {number | null} matchingNextIndex
 */

/**
 * @typedef {StatementBase & Object} NextStatement
 * @property {"NextStatement"} type
 * @property {IdentifierTarget | null} variable
 * @property {number | null} matchingForIndex
 */

/**
 * @typedef {StatementBase & Object} DimStatement
 * @property {"DimStatement"} type
 * @property {string} name
 * @property {"number" | "string"} valueType
 * @property {Expression | null} upperBound
 */

/**
 * @typedef {StatementBase & Object} EndStatement
 * @property {"EndStatement"} type
 */

/**
 * @typedef {StatementBase & Object} StopStatement
 * @property {"StopStatement"} type
 */

/**
 * @typedef {StatementBase & Object} CommentStatement
 * @property {"CommentStatement"} type
 * @property {"'" | "REM"} marker
 * @property {string} text
 */

module.exports = {};
