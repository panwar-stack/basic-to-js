#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { compile } = require("./compiler");
const { formatDiagnostic } = require("./diagnostics");

function main(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return 0;
  }

  if (argv[0] !== "compile") {
    return fail({
      file: "<cli>",
      line: 1,
      column: 1,
      code: "CLI001",
      message: `Unsupported command: ${argv[0]}`,
    });
  }

  const parsed = parseCompileArgs(argv.slice(1));
  if (parsed.diagnostic) {
    return fail(parsed.diagnostic);
  }

  const inputPath = parsed.inputPath;
  const outputPath = parsed.outputPath;

  let source;
  try {
    source = fs.readFileSync(inputPath, "utf8");
  } catch (error) {
    return fail({
      file: inputPath,
      line: 1,
      column: 1,
      code: "CLI005",
      message: `Unable to read input file: ${error.message}`,
    });
  }

  const result = compile(source, { sourcePath: inputPath });
  if (result.diagnostics.length > 0) {
    for (const diagnostic of result.diagnostics) {
      console.error(formatDiagnostic(diagnostic));
    }
    return 1;
  }

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, result.code, "utf8");
  } catch (error) {
    return fail({
      file: outputPath,
      line: 1,
      column: 1,
      code: "CLI006",
      message: `Unable to write output file: ${error.message}`,
    });
  }

  return 0;
}

function parseCompileArgs(args) {
  if (args.length !== 3 || args[1] !== "--out") {
    return {
      diagnostic: {
        file: "<cli>",
        line: 1,
        column: 1,
        code: "CLI002",
        message: "Expected: compile <input.bas> --out <output.js>",
      },
    };
  }

  const inputPath = args[0];
  const outputPath = args[2];

  if (path.extname(inputPath).toLowerCase() !== ".bas") {
    return {
      diagnostic: {
        file: inputPath,
        line: 1,
        column: 1,
        code: "CLI003",
        message: "Input file must use the .bas extension",
      },
    };
  }

  if (path.extname(outputPath).toLowerCase() !== ".js") {
    return {
      diagnostic: {
        file: outputPath,
        line: 1,
        column: 1,
        code: "CLI004",
        message: "Output file must use the .js extension",
      },
    };
  }

  return {
    inputPath,
    outputPath,
  };
}

function fail(diagnostic) {
  console.error(formatDiagnostic(diagnostic));
  return 1;
}

function printHelp() {
  console.log(`basicjs\n\nUsage:\n  basicjs --help\n  basicjs compile <input.bas> --out <output.js>\n\nCommands:\n  compile    Compile one BASIC .bas file to one Node.js .js file\n\nOptions:\n  --help     Show this help text\n  --out      Output JavaScript file path`);
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  main,
};
