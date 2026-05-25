"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { compile } = require("../src/compiler");

const examplesDir = path.join(__dirname, "..", "examples", "suite");

const examples = [
  {
    file: "01-hello.bas",
    stdout: "HELLO FROM BASIC\n",
  },
  {
    file: "02-print-separators.bas",
    stdout: "A B\nCD\n\nNO NEWLINE\n",
  },
  {
    file: "03-comments-case-colons.bas",
    stdout: "START\nTOTAL 2\n",
  },
  {
    file: "04-numeric-expressions.bas",
    stdout: "7 9 -4 512\n",
  },
  {
    file: "05-string-builtins.bas",
    stdout: "5 BA SIC ASI\n123! 50\n",
  },
  {
    file: "06-numeric-builtins-rnd.bas",
    stdout: "7 3\n0.10793783515691757\n0.6079612672328949\n",
  },
  {
    file: "07-boolean-if-inline.bas",
    stdout: "EQ\nTRUE\n",
  },
  {
    file: "08-if-line-branches.bas",
    stdout: "HIGH\n",
  },
  {
    file: "09-goto-loop.bas",
    stdout: "LOOP 1\nLOOP 2\nLOOP 3\nDONE\n",
  },
  {
    file: "10-gosub-nested.bas",
    stdout: "MAIN\nSUB1\nSUB2\nSUB1 DONE\nMAIN DONE\n",
  },
  {
    file: "11-for-next-steps.bas",
    stdout: "LOOPS\n1\n2\n3\n6\n4\n2\n",
  },
  {
    file: "12-arrays.bas",
    stdout: "35 Lovelace\n",
  },
  {
    file: "13-input-number.bas",
    input: "40\n",
    stdout: "NUMBER 42\n",
  },
  {
    file: "14-input-string.bas",
    input: "Ada\n",
    stdout: "NAME HELLO Ada\n",
  },
  {
    file: "15-input-invalid-number-error.bas",
    input: "oops\n",
    status: 1,
    stderr: "BASIC runtime error BASRT009: Invalid numeric input: oops\n",
  },
  {
    file: "16-return-without-gosub-error.bas",
    status: 1,
    stdout: "BEFORE\n",
    stderr: "BASIC runtime error BASRT002: RETURN without GOSUB\n",
  },
  {
    file: "17-for-step-zero-error.bas",
    status: 1,
    stderr: "BASIC runtime error BASRT003: FOR STEP cannot be 0\n",
  },
  {
    file: "18-array-bounds-error.bas",
    status: 1,
    stderr: "BASIC runtime error BASRT008: Array A index 3 out of bounds 0..2\n",
  },
  {
    file: "19-val-error.bas",
    status: 1,
    stderr: "BASIC runtime error BASRT001: VAL expected numeric string, got abc\n",
  },
  {
    file: "20-stop-terminates.bas",
    stdout: "BEFORE\n",
  },
  {
    file: "21-empty-and-comments.bas",
    stdout: "",
  },
  {
    file: "22-complex-survey.bas",
    cases: [
      {
        name: "caps rounds and scores results",
        input: "Beatrice\n4\n8\n-2\n12\n",
        stdout: "PLAYER ROUNDS HELLO Bea LEN8\nUSING 3 ROUNDS\nSCORE ROUND 1: LOW ABS9\nSCORE ROUND 2: LOW ABS0\nSCORE ROUND 3: HIGH ABS13\nTOTAL 22 AVG 7\nITEM 1=9 LOW\nITEM 2=0 LOW\nITEM 3=13 HIGH\nDONE\n",
      },
      {
        name: "skips scoring for zero rounds",
        input: "Al\n0\n",
        stdout: "PLAYER ROUNDS HELLO Al LEN2\nUSING 0 ROUNDS\nDONE\n",
      },
    ],
  },
  {
    file: "23-order-scorecard.bas",
    cases: [
      {
        name: "caps order count and classifies items",
        input: "Caroline\n4\nA1\n3\n7\nX9\n12\n8\nB2\n1\n120\n",
        stdout: "CUSTOMER ITEMS ORDER Caro LEN8\nCOUNT 3\nCODE QTY PRICE ITEM A1\nLINE 1 3X7=21\nCODE QTY PRICE SPECIAL X9\nLINE 2 12X8=96\nCODE QTY PRICE ITEM B2\nLINE 3 1X120=120\nTOTAL 237 AVG79 FLAGS2\nREG 1 A1\nBULK 2 X9\nREG 3 B2\nDONE\n",
      },
      {
        name: "takes no-items branch",
        input: "Zed\n0\n",
        stdout: "CUSTOMER ITEMS ORDER Zed LEN3\nCOUNT 0\nNO ITEMS\nDONE\n",
      },
    ],
  },
  {
    file: "24-route-planner.bas",
    cases: [
      {
        name: "walks forward and reverse route legs",
        input: "AB12XY\n3\nNorth\n5\nHill\n-7\nDock\n4\n",
        stdout: "ROUTE LEGS PLAN AB12XY LEGS3\nSTOP MILES LEG 1 OUT North 5\nSTOP MILES LEG 2 BACK Hill 7\nSTOP MILES LEG 3 OUT Dock 4\nTOTAL 16\nCODE AB-XY MIDB12\nRETURN 3 Dock SHORT4\nRETURN 2 Hill LONG11\nRETURN 1 North LONG16\nSERIES 12\nDONE\n",
      },
      {
        name: "clamps to minimum leg count",
        input: "CD03QR\n0\nBase\n-2\n",
        stdout: "ROUTE LEGS PLAN CD03QR LEGS1\nSTOP MILES LEG 1 BACK Base 2\nTOTAL 2\nCODE CD-QR MIDD03\nRETURN 1 Base SHORT2\nSERIES LOW\nDONE\n",
      },
    ],
  },
  {
    file: "25-inventory-restock.bas",
    cases: [
      {
        name: "caps item count and restocks low inventory",
        input: "Morgan\n5\nAX19\n3\n12\nBZ02\n-1\n7\nCR55\n2\n80\nDL10\n6\n5\n",
        stdout: "CLERK ITEMS CLERK Morg LEN6\nCOUNT 4\nSKU QTY PRICE AX1 Q3 V36 T19\nSKU QTY PRICE BZ0 Q0 V0 T02\nSKU QTY PRICE CR5 Q2 V160 T55\nSKU QTY PRICE DL1 Q6 V30 T10\nTOTAL 226 AVG56 FLAGS2\nOK AX19\nRESTOCK BZ02 BY 5\nRESTOCK CR55 BY 3\nOK DL10\nINVENTORY DONE\n",
      },
      {
        name: "skips item loop for zero items",
        input: "Li\n0\n",
        stdout: "CLERK ITEMS CLERK Li LEN2\nCOUNT 0\nINVENTORY DONE\n",
      },
    ],
  },
  {
    file: "26-text-scanner-menu.bas",
    cases: [
      {
        name: "mode two prints captured characters",
        input: "ORBITAL\nA\n2\n",
        stdout: "TEXT KEY MODE LEN 7 KEY A MODE2\nMATCHES 1 VOWELS3\nSNAP 1=O\nSNAP 2=R\nSNAP 3=B\nSNAP 4=I\nSNAP 5=T\nTEXT DONE\n",
      },
      {
        name: "clamps low mode and prints summary",
        input: "STACK\nT\n0\n",
        stdout: "TEXT KEY MODE LEN 5 KEY T MODE1\nMATCHES 1 VOWELS1\nLEFT STA RIGHT ACK\nTEXT DONE\n",
      },
    ],
  },
];

for (const example of examples) {
  const cases = example.cases || [example];

  for (const exampleCase of cases) {
    const suffix = exampleCase.name ? ` (${exampleCase.name})` : "";

    test(`example ${example.file}${suffix} compiles and runs`, () => {
      const sourcePath = path.join(examplesDir, example.file);
      const source = fs.readFileSync(sourcePath, "utf8");
      const result = compile(source, { sourcePath });

      assert.deepEqual(result.diagnostics, []);
      assert.equal(typeof result.code, "string");

      const run = runGenerated(result.code, { input: exampleCase.input });

      assert.ifError(run.error);
      assert.equal(run.status, exampleCase.status || 0);
      assert.equal(run.stdout, exampleCase.stdout || "");
      assert.equal(run.stderr, exampleCase.stderr || "");
    });
  }
}

test("examples suite manifest covers every BASIC example", () => {
  const manifestFiles = examples.map((example) => example.file).sort();
  const suiteFiles = fs.readdirSync(examplesDir).filter((file) => file.endsWith(".bas")).sort();

  assert.deepEqual(manifestFiles, suiteFiles);
});

function runGenerated(code, options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "basic-examples-"));
  const outputPath = path.join(tempDir, "program.js");
  fs.writeFileSync(outputPath, code, "utf8");

  try {
    return childProcess.spawnSync(process.execPath, [outputPath], {
      encoding: "utf8",
      input: options.input,
      timeout: 5000,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
