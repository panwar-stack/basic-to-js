# BASIC To JavaScript Compiler

## Goal

Build a greenfield JavaScript compiler that reads `.bas` BASIC source files and emits JavaScript files that run directly in Node.js.

The first implementation must support a small, deterministic BASIC dialect inspired by GW-BASIC and QuickBASIC. The compiler should favor readable generated JavaScript, clear diagnostics, and incremental language coverage over optimization or full historical BASIC compatibility.

## Current State

- Workspace path: `/Users/srpanwar/Documents/Workspace/brain/basic`.
- The workspace is currently empty except for this spec once saved.
- There is no `package.json`, source tree, README, tests, examples, or existing compiler code.
- This spec is saved at `specs/basic-to-js-compiler.md`.
- The project must define its own structure, scripts, examples, and test fixtures from scratch.

## Non-Negotiables

- The compiler must be implemented in plain JavaScript for Node.js.
- Target runtime must be Node.js, not browsers.
- Generated JavaScript must run without requiring the original `.bas` file.
- The first pass must compile to readable JavaScript, not optimized JavaScript.
- BASIC keywords and identifiers must be case-insensitive.
- String literals must preserve case and content.
- Diagnostics must include file path, source line, column where available, diagnostic code, and message.
- The compiler must not use `eval` or execute BASIC source during compilation.
- The first pass must not include graphics, file I/O, networking, user-defined functions, modules, or browser APIs.
- The first pass should use zero external runtime dependencies unless a later decision explicitly adds one.

## Project Layout

```text
package.json
README.md
specs/basic-to-js-compiler.md
src/cli.js
src/compiler.js
src/lexer.js
src/parser.js
src/ast.js
src/semantics.js
src/codegen.js
src/runtime-template.js
src/diagnostics.js
test/lexer.test.js
test/parser.test.js
test/semantics.test.js
test/codegen.test.js
test/fixtures/
examples/hello.bas
examples/guess.bas
```

## Package And Runtime

Use CommonJS for the first pass to avoid Node package mode ambiguity.

```json
{
  "name": "basic-js-compiler",
  "private": true,
  "version": "0.1.0",
  "bin": {
    "basicjs": "src/cli.js"
  },
  "scripts": {
    "test": "node --test"
  },
  "engines": {
    "node": ">=20"
  }
}
```

## CLI Behavior

Primary command:

```text
node src/cli.js compile <input.bas> --out <output.js>
```

Required behavior:

- `compile` must read one `.bas` file.
- `--out` must write one generated `.js` file.
- Parent directories for `--out` must be created automatically.
- Compilation errors must exit with code `1`.
- Successful compilation must exit with code `0`.
- Generated JavaScript must be executable with `node <output.js>`.
- `node src/cli.js --help` must print supported commands and options.

Example:

```text
node src/cli.js compile examples/hello.bas --out dist/hello.js
node dist/hello.js
```

Leave out of first pass:

- Watch mode.
- Multi-file compilation.
- Source maps.
- In-process `run` command.
- Package publishing.

## BASIC Dialect

The first dialect is a small line-label BASIC.

| Construct | First-Pass Support |
| --- | --- |
| File extension | `.bas` |
| Program model | One program per file |
| Line labels | Optional numeric labels, for example `10 PRINT "HI"` |
| Statement separator | Colon, for example `A = 1 : PRINT A` |
| Comments | `REM comment` and apostrophe comments |
| Variables | Numeric variables like `A`, `COUNT`, `X1` |
| String variables | Names ending in `$`, like `A$`, `NAME$` |
| Assignment | `LET A = 1`, `A = 1`, `NAME$ = "Ada"` |
| Output | `PRINT`, semicolon separator, comma separator |
| Input | `INPUT A`, `INPUT "Name"; NAME$` |
| Branching | `IF expr THEN statement`, `IF expr THEN lineNumber`, optional `ELSE` |
| Jumps | `GOTO lineNumber` |
| Subroutines | `GOSUB lineNumber`, `RETURN` |
| Loops | `FOR I = start TO end [STEP step]`, `NEXT [I]` |
| Arrays | `DIM A(10)`, `DIM NAMES$(10)` |
| Termination | `END`, `STOP` |

Expression support:

```text
numeric literals: 1, 1.5, .5
string literals: "hello"
arithmetic: + - * / ^
comparison: = <> < <= > >=
boolean: AND OR NOT
grouping: ( )
built-ins: ABS, INT, LEN, LEFT$, RIGHT$, MID$, STR$, VAL, RND
```

Unsupported in first pass:

```text
DATA, READ, RESTORE
ON GOTO, ON GOSUB
WHILE/WEND
DO/LOOP
SELECT CASE
DEF FN
SUB, FUNCTION
multi-dimensional arrays
OPTION BASE
file I/O
graphics
ON ERROR
RANDOMIZE
```

## Grammar

Use a hand-written lexer and parser. Do not introduce a parser generator in the first pass.

```text
program        := line*
line           := [lineNumber] [statementList] newline
statementList  := statement (":" statement)*
statement      := assignment
                | print
                | input
                | if
                | goto
                | gosub
                | return
                | for
                | next
                | dim
                | end
                | stop
                | comment
assignment     := ["LET"] target "=" expression
target         := identifier | identifier "(" expression ")"
print          := "PRINT" [printItem (("," | ";") printItem)*] ["," | ";"]
input          := "INPUT" [stringLiteral (";" | ",")] target
if             := "IF" expression "THEN" (statement | lineNumber) ["ELSE" (statement | lineNumber)]
goto           := "GOTO" lineNumber
gosub          := "GOSUB" lineNumber
return         := "RETURN"
for            := "FOR" identifier "=" expression "TO" expression ["STEP" expression]
next           := "NEXT" [identifier]
dim            := "DIM" identifier "(" expression ")"
end            := "END"
stop           := "STOP"
```

Parsing rules:

- Numeric line labels must be unique.
- Empty lines must be allowed.
- Comment-only lines must be allowed.
- `REM` comments consume the rest of the logical line.
- Apostrophe comments consume the rest of the logical line unless inside a string literal.
- Identifiers must match `[A-Z][A-Z0-9]*[$]?` after case normalization.
- Variable names that contain keywords, such as `PRINTCOUNT`, must remain valid identifiers.
- String literals may contain BASIC keywords without tokenization side effects.
- Unterminated string literals must be lexer errors.

## AST Shape

Use JSDoc typedefs in `src/ast.js` to document AST objects.

```js
Program {
  type: "Program",
  sourcePath: string,
  lines: BasicLine[],
  statements: Statement[],
  labels: Map<number, number>
}

BasicLine {
  type: "Line",
  sourceLine: number,
  label: number | null,
  statements: Statement[]
}

Statement {
  type: string,
  sourceLine: number,
  sourceColumn: number
}

Expression {
  type: string,
  valueType: "number" | "string" | "boolean" | "unknown"
}
```

Statement examples:

```js
{ type: "PrintStatement", items, trailingSeparator }
{ type: "AssignmentStatement", target, expression }
{ type: "IfStatement", test, thenBranch, elseBranch }
{ type: "GotoStatement", targetLabel }
{ type: "ForStatement", variable, start, end, step }
{ type: "NextStatement", variable }
{ type: "DimStatement", name, valueType, upperBound }
```

## Semantic Rules

- Numeric variables default to `0`.
- String variables default to `""`.
- Variables ending in `$` must only hold strings.
- Variables without `$` must only hold numbers.
- Boolean expressions may be represented internally as JavaScript booleans.
- BASIC truth conversion must treat `0` as false and non-zero numbers as true.
- Comparison expressions must be valid in `IF`, `AND`, `OR`, and `NOT`.
- String concatenation with `+` is allowed only when both operands are strings.
- Numeric `+` is allowed only when both operands are numbers.
- Type mismatches that are statically knowable must fail compilation.
- Type mismatches that depend on runtime input must throw generated runtime errors.
- `GOTO`, `GOSUB`, and `IF THEN lineNumber` targets must refer to existing labels.
- `RETURN` without a matching runtime `GOSUB` stack frame must be a runtime error.
- `FOR` loop start, end, and step expressions must be evaluated once when entering the loop.
- `STEP` defaults to `1`.
- `STEP 0` must be a runtime error.
- `NEXT X` must match the active loop variable when a variable is provided.
- `NEXT` without a variable must close the active innermost loop.
- Jumps into or out of a `FOR/NEXT` region should be rejected in the first pass to avoid corrupt loop state.
- `DIM A(10)` creates valid indices `0` through `10`.
- Array upper bounds must be non-negative integers at runtime.
- Array indices must be integers at runtime.
- Array reads before `DIM` must be compile-time errors when statically known.
- Array out-of-bounds access must be a runtime error.

## Code Generation

Generated JavaScript should be self-contained.

Use a statement-index execution loop so BASIC control flow maps cleanly to JavaScript:

```js
let pc = 0;
const vars = Object.create(null);
const arrays = Object.create(null);
const gosubStack = [];
const forStack = [];

while (pc < statements.length) {
  switch (pc) {
    case 0:
      // generated statement
      pc += 1;
      break;
  }
}
```

Codegen requirements:

- Emit one JavaScript statement block per BASIC statement.
- Emit a `labels` object mapping BASIC line labels to statement indexes.
- Emit runtime helpers only when needed by the program.
- Do not require imports except Node built-ins needed for `INPUT`.
- Preserve generated code readability with stable names and indentation.
- Include a generated header with source path and timestamp-free compiler metadata.
- Do not include timestamps, absolute temp paths, or nondeterministic comments in generated output.
- `STOP` and `END` must terminate with exit code `0`.
- Runtime errors must print a clear message and exit with code `1`.

## Runtime Semantics

`PRINT` behavior:

- `PRINT` with no arguments writes a newline.
- `PRINT A` writes the value followed by newline.
- `PRINT A;` writes the value without trailing newline.
- `PRINT A, B` writes values separated by one space in the first pass.
- `PRINT A; B` writes values without inserted spacing.
- Better tab-zone compatibility is future work.

`INPUT` behavior:

- Prompt text must be written before reading.
- `INPUT A` reads one line from stdin and parses it as a number.
- `INPUT A$` reads one line from stdin as a string.
- Invalid numeric input must throw a runtime error in the first pass.
- Reprompting on invalid numeric input is future work.

Built-in behavior:

| Built-In | Behavior |
| --- | --- |
| `ABS(n)` | `Math.abs(n)` |
| `INT(n)` | `Math.floor(n)` |
| `LEN(s$)` | string length |
| `LEFT$(s$, n)` | left substring |
| `RIGHT$(s$, n)` | right substring |
| `MID$(s$, start, length)` | one-based substring start for BASIC familiarity |
| `STR$(n)` | convert number to string |
| `VAL(s$)` | parse number, runtime error if invalid |
| `RND()` | deterministic pseudo-random number from compiler runtime seed |

## Diagnostics

Diagnostic format:

```text
<file>:<line>:<column> <code>: <message>
```

Required diagnostic codes:

| Code | Condition |
| --- | --- |
| `BAS1001` | Unterminated string literal |
| `BAS1002` | Unknown token |
| `BAS1101` | Unknown statement |
| `BAS1102` | Invalid assignment target |
| `BAS1103` | Expected expression |
| `BAS1201` | Duplicate line label |
| `BAS1202` | Missing branch target label |
| `BAS1301` | Type mismatch |
| `BAS1302` | Array used before `DIM` |
| `BAS1303` | Wrong number of array indexes |
| `BAS1401` | `NEXT` without matching `FOR` |
| `BAS1402` | Mismatched `NEXT` variable |
| `BAS1403` | Unsupported jump across `FOR/NEXT` boundary |
| `BAS9001` | Unsupported BASIC feature |

Runtime error prefix:

```text
BASIC runtime error <code>: <message>
```

## Documentation

`README.md` must document:

- What the compiler does.
- Supported BASIC subset.
- Unsupported language features.
- CLI usage.
- Example `.bas` source.
- Generated JavaScript execution command.
- Test command.
- Known compatibility differences from classic BASIC.

## Implementation Slices

### PR 1: Project Scaffold And CLI Shell

- Create `package.json` with Node `>=20` and `npm test`.
- Create `src/cli.js` with `--help` and `compile <input.bas> --out <output.js>` argument parsing.
- Create `src/compiler.js` with a stub compile pipeline.
- Create `src/diagnostics.js` with diagnostic formatting.
- Create `README.md` with project purpose and placeholder dialect status.
- Create `examples/hello.bas`.

Verification:

- `npm install`
- `npm test`
- `node src/cli.js --help`
- `node src/cli.js compile examples/hello.bas --out dist/hello.js`

Review:

Confirm the repo has a minimal Node project, deterministic CLI errors, and no language implementation hidden in the scaffold.

### PR 2: Lexer And Line Model

- Implement `src/lexer.js`.
- Tokenize identifiers, keywords, numbers, strings, operators, separators, line labels, comments, and newlines.
- Preserve source line and column on every token.
- Normalize identifiers and keywords to uppercase outside string literals.
- Add lexer fixtures for empty lines, comments, strings, keywords inside strings, and colon-separated statements.
- Add `test/lexer.test.js`.

Verification:

- `npm test -- test/lexer.test.js`
- `node src/cli.js compile examples/hello.bas --out dist/hello.js`

Review:

Check token boundaries, comment handling, line label detection, and diagnostic locations.

### PR 3: Parser And AST For Core Statements

- Implement `src/parser.js`.
- Implement `src/ast.js` JSDoc typedefs.
- Parse `PRINT`, `LET`, direct assignment, `END`, `STOP`, `REM`, apostrophe comments, and colon-separated statements.
- Build flattened statement indexes while retaining source line metadata.
- Detect duplicate line labels.
- Add `test/parser.test.js`.

Verification:

- `npm test -- test/parser.test.js`
- `npm test -- test/lexer.test.js`

Review:

Check that AST shape is stable, source locations survive parsing, and parser errors do not depend on generated code.

### PR 4: Expressions And Type Semantics

- Implement expression parsing with precedence for arithmetic, comparison, boolean operators, unary operators, and parentheses.
- Implement semantic type checks in `src/semantics.js`.
- Support numeric variables, string variables, numeric literals, string literals, and assignment type validation.
- Implement built-in signatures for `ABS`, `INT`, `LEN`, `LEFT$`, `RIGHT$`, `MID$`, `STR$`, `VAL`, and `RND`.
- Add `test/semantics.test.js`.

Verification:

- `npm test -- test/semantics.test.js`
- `npm test -- test/parser.test.js`

Review:

Check operator precedence, string versus numeric validation, and clear diagnostics for invalid expressions.

### PR 5: Codegen For Linear Programs

- Implement `src/codegen.js`.
- Implement `src/runtime-template.js`.
- Generate self-contained JavaScript for assignment, expression evaluation, `PRINT`, `END`, and `STOP`.
- Ensure generated output is deterministic and timestamp-free.
- Add codegen snapshot or text-assertion tests that avoid brittle full-file snapshots where possible.
- Add an end-to-end `examples/hello.bas` compile-and-run test.

Verification:

- `npm test -- test/codegen.test.js`
- `node src/cli.js compile examples/hello.bas --out dist/hello.js`
- `node dist/hello.js`

Review:

Check generated JavaScript readability, no `eval`, deterministic output, and correct stdout behavior.

### PR 6: Labels, Branching, And Subroutines

- Implement label map generation.
- Implement `IF expr THEN statement`.
- Implement `IF expr THEN lineNumber`.
- Implement optional `ELSE`.
- Implement `GOTO`.
- Implement `GOSUB` and `RETURN` with a runtime stack.
- Validate missing labels at compile time.
- Add fixtures for forward jumps, backward jumps, nested `GOSUB`, and `RETURN` without `GOSUB`.

Verification:

- `npm test -- test/parser.test.js test/semantics.test.js test/codegen.test.js`
- `node src/cli.js compile test/fixtures/branching.bas --out dist/branching.js`
- `node dist/branching.js`

Review:

Check program counter transitions, label resolution, runtime stack behavior, and branch diagnostics.

### PR 7: FOR/NEXT Loops And Arrays

- Implement parsing for `FOR`, `NEXT`, and `DIM`.
- Implement semantic pairing for `FOR/NEXT`.
- Reject unsupported jumps across `FOR/NEXT` boundaries.
- Generate runtime loop stack behavior for positive and negative `STEP`.
- Implement one-dimensional numeric and string arrays.
- Add runtime checks for `STEP 0`, invalid array bounds, non-integer indexes, and out-of-bounds indexes.
- Add fixtures for nested loops, omitted `NEXT` variable, mismatched `NEXT`, and arrays.

Verification:

- `npm test -- test/semantics.test.js test/codegen.test.js`
- `node src/cli.js compile test/fixtures/loops.bas --out dist/loops.js`
- `node dist/loops.js`
- `node src/cli.js compile test/fixtures/arrays.bas --out dist/arrays.js`
- `node dist/arrays.js`

Review:

Check loop stack correctness, array bounds semantics, and rejection of control-flow cases that would corrupt loop state.

### PR 8: INPUT And End-To-End Examples

- Implement blocking stdin line reads in generated JavaScript using Node built-ins.
- Implement numeric and string `INPUT`.
- Implement optional prompt text for `INPUT`.
- Add `examples/guess.bas` or another small interactive example.
- Add piped-input tests for generated programs.
- Update `README.md` with complete first-pass CLI and dialect documentation.

Verification:

- `npm test`
- `node src/cli.js compile examples/guess.bas --out dist/guess.js`
- `printf 'Ada\n' | node dist/guess.js`

Review:

Check stdin behavior, prompt formatting, invalid numeric input errors, and documentation accuracy.

## Future Work

- Add `DATA`, `READ`, and `RESTORE`.
- Add `ON GOTO` and `ON GOSUB`.
- Add `WHILE/WEND` and `DO/LOOP`.
- Add `SELECT CASE`.
- Add `DEF FN`, `SUB`, and `FUNCTION`.
- Add multi-dimensional arrays.
- Add `OPTION BASE`.
- Add file I/O statements.
- Add `RANDOMIZE` and classic-compatible `RND` behavior.
- Add more math and string built-ins.
- Add better `PRINT` tab zones.
- Add source maps.
- Add a `run` CLI command.
- Add compatibility modes for strict greenfield BASIC versus classic BASIC.

## Open Questions

- Should line labels control execution order or act only as jump labels? Default recommendation: execute source order and treat labels only as jump targets.
- Should arrays use classic inclusive upper bounds? Default recommendation: yes, `DIM A(10)` permits indexes `0` through `10`.
- Should generated JavaScript import a shared runtime or remain self-contained? Default recommendation: self-contained for the first pass.
