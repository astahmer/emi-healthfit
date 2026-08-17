import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { fitnessCoachV1 } from "../src/chat/prompts/fitness-coach-v1.ts";

const promptSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../docs/prompts/fitness-coach-v1.md"),
  "utf8",
);

describe("fitness coach prompt session resolution", () => {
  it("requires tool-backed session resolution before quoting weights or exercises", () => {
    assert.match(fitnessCoachV1, /get_session_template/);
    assert.match(fitnessCoachV1, /resolve which logged session is the actual template/);
    assert.match(fitnessCoachV1, /Never invent, mix, or approximate exercises/);
    assert.match(
      fitnessCoachV1,
      /An answer about the user's own session without a tool call that returns that session's exercise\/set detail is a failure/,
    );
  });

  it("anchors today and weekly planning on the derived schedule in the context", () => {
    assert.match(
      fitnessCoachV1,
      /The system context always provides today's date, the weekday, the expected session for today/,
    );
    assert.match(fitnessCoachV1, /never guess the day of the week or the program from memory/);
    assert.match(fitnessCoachV1, /Weekly schedule derived from the last 6 weeks/);
  });

  it("keeps the markdown source and generated TypeScript prompt in sync", () => {
    const sourceStep = promptSource.match(
      /--- STEP 1\.5: RESOLVE THE SESSION FROM REAL HISTORY ---/,
    );
    const tsStep = fitnessCoachV1.match(/--- STEP 1\.5: RESOLVE THE SESSION FROM REAL HISTORY ---/);
    assert.ok(sourceStep, "markdown source is missing STEP 1.5");
    assert.ok(tsStep, "generated TypeScript prompt is missing STEP 1.5");
    const sourceLine = promptSource
      .split("\n")
      .find((line) => line.includes("get_session_template"));
    const tsLine = fitnessCoachV1.split("\n").find((line) => line.includes("get_session_template"));
    assert.ok(sourceLine !== undefined && tsLine !== undefined);
    assert.strictEqual(
      tsLine.replaceAll("\\`", "`"),
      sourceLine,
      "generated prompt drifted from the markdown source",
    );
  });
});
