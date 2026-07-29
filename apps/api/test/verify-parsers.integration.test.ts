import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const verifyParsersScript = fileURLToPath(new URL("../scripts/verify-parsers.ts", import.meta.url));

describe("parser verification", () => {
  it("uses committed anonymized fixtures without a local data directory", async () => {
    const { stdout } = await executeFile(process.execPath, [
      "--experimental-strip-types",
      verifyParsersScript,
    ]);

    assert.match(stdout, /daily: 2/);
    assert.match(stdout, /workouts: 2/);
    assert.match(stdout, /sleep: 2/);
    assert.match(stdout, /body: 2/);
    assert.match(stdout, /sessions: 2/);
    assert.match(stdout, /sets: 3/);
  });
});
