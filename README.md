# BASIC To JavaScript Compiler

> **Created by opencode:** This entire project was created by opencode, using a personal fork(https://github.com/panwar-stack/opencode) with 1 agent team and 64 autonomous DAG agents.

This project is a small BASIC-to-JavaScript compiler implemented in plain JavaScript for Node.js. It reads one `.bas` source file, compiles a deterministic line-label BASIC subset inspired by GW-BASIC and QuickBASIC, and emits readable self-contained JavaScript that runs directly with Node.js.

## CLI Usage

Compile a BASIC file to JavaScript:

```sh
node src/cli.js compile examples/hello.bas --out dist/hello.js
```

Run the generated JavaScript:

```sh
node dist/hello.js
```

Compile and run the interactive example with piped stdin:

```sh
node src/cli.js compile examples/guess.bas --out dist/guess.js
printf '7\n' | node dist/guess.js
```

Print CLI help:

```sh
node src/cli.js --help
```

The first-pass CLI intentionally supports only `compile <input.bas> --out <output.js>`. It creates parent directories for `--out`, exits with code `0` on success, and exits with code `1` after printing diagnostics on compilation or file errors.

## Supported BASIC Subset

The compiler supports one program per `.bas` file. Keywords and identifiers are case-insensitive, while string literal content is preserved.

Supported statements and syntax:

| Feature | Support |
| --- | --- |
| Line labels | Optional numeric labels such as `10 PRINT "HI"` |
| Statement separator | Colon, such as `A = 1 : PRINT A` |
| Comments | `REM comment` and apostrophe comments |
| Variables | Numeric variables such as `A`, `COUNT`, `X1` |
| String variables | Names ending in `$`, such as `NAME$` |
| Assignment | `LET A = 1`, `A = 1`, `NAME$ = "Ada"` |
| Output | `PRINT`, comma separator, semicolon separator |
| Input | `INPUT A`, `INPUT A$`, `INPUT "Prompt"; A`, `INPUT "Prompt", A$` |
| Branching | `IF expr THEN statement`, `IF expr THEN lineNumber`, optional `ELSE` |
| Jumps | `GOTO lineNumber` |
| Subroutines | `GOSUB lineNumber`, `RETURN` |
| Loops | `FOR I = start TO end [STEP step]`, `NEXT [I]` |
| Arrays | One-dimensional `DIM A(10)` and `DIM NAMES$(10)` |
| Termination | `END`, `STOP` |

Supported expressions:

```text
numeric literals: 1, 1.5, .5
string literals: "hello"
arithmetic: + - * / ^
comparison: = <> < <= > >=
boolean: AND OR NOT
grouping: ( )
built-ins: ABS, INT, LEN, LEFT$, RIGHT$, MID$, STR$, VAL, RND
```

`INPUT` reads from standard input in generated JavaScript. Numeric targets parse one input line as a number and fail with a BASIC runtime error if the line is not numeric. String targets store the input line as text. Prompt strings are written before reading.

## Unsupported Features

These classic BASIC features are intentionally out of scope for the first pass:

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

The CLI also does not include watch mode, multi-file compilation, source maps, package publishing, or an in-process `run` command.

## Examples

`examples/hello.bas`:

```basic
10 PRINT "HELLO FROM BASIC"
20 END
```

`examples/guess.bas`:

```basic
10 PRINT "GUESS THE NUMBER"
20 INPUT "YOUR GUESS"; G
30 IF G = 7 THEN PRINT "RIGHT" ELSE PRINT "TRY 7"
40 END
```

The `examples/suite/` directory contains a broader compiler-check suite that exercises the supported BASIC subset, including printing, comments, colon-separated statements, numeric and string expressions, built-ins, `IF`, `GOTO`, `GOSUB`, `FOR/NEXT`, arrays, `INPUT`, `STOP`, selected runtime errors, and larger programs that combine several features in one flow.

Run the automated examples checks with the full test suite:

```sh
npm test
```

Compile any suite example manually:

```sh
node src/cli.js compile examples/suite/12-arrays.bas --out dist/12-arrays.js
node dist/12-arrays.js
```

## Tests

Run the full test suite:

```sh
npm test
```

Run the generated-code tests only:

```sh
npm test -- test/codegen.test.js
```

## Compatibility Notes

This compiler favors deterministic generated JavaScript and clear diagnostics over full historical BASIC compatibility.

Known differences from classic BASIC:

- `PRINT A, B` uses one space between values instead of classic tab zones.
- Invalid numeric `INPUT` exits with a runtime error instead of reprompting.
- Arrays are one-dimensional and use inclusive bounds, so `DIM A(10)` permits indexes `0` through `10`.
- `RND()` is deterministic in the first pass, and `RANDOMIZE` is not supported.
- Jumps into or out of a `FOR`/`NEXT` region are rejected to protect generated loop state.
- Generated JavaScript is self-contained except for Node built-ins needed by compiled programs, such as stdin handling for `INPUT`.
