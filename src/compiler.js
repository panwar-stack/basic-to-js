"use strict";

const { parse } = require("./parser");
const { analyze } = require("./semantics");
const { generate } = require("./codegen");

function compile(source, options = {}) {
  const sourcePath = options.sourcePath || "<unknown>";

  if (typeof source !== "string") {
    return {
      code: "",
      diagnostics: [
        {
          file: sourcePath,
          line: 1,
          column: 1,
          code: "BASIC001",
          message: "Source must be a string",
        },
      ],
    };
  }

  const parseResult = parse(source, { sourcePath });
  if (parseResult.diagnostics.length > 0) {
    return {
      code: "",
      diagnostics: parseResult.diagnostics,
    };
  }

  const semanticResult = analyze(parseResult.program, { sourcePath });
  if (semanticResult.diagnostics.length > 0) {
    return {
      code: "",
      diagnostics: semanticResult.diagnostics,
    };
  }

  const code = generate(semanticResult.program, { sourcePath });

  return {
    code,
    diagnostics: [],
  };
}

module.exports = {
  compile,
};
