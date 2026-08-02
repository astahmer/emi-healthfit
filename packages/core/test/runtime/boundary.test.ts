import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as runtime from "../../src/runtime/index.ts";

describe("R2 runtime boundary", () => {
  it("exports only the facade contract from the runtime entrypoint", () => {
    expect(runtime.createChatRuntime).toBeTypeOf("function");
    expect("genericChatAppMachine" in runtime).toBe(false);
    expect("chatSessionMachine" in runtime).toBe(false);
    expect("createActor" in runtime).toBe(false);
  });

  it("keeps actor-graph access inside core and out of generic-web", async () => {
    const app = await readFile(join(process.cwd(), "../../apps/generic-web/src/app.tsx"), "utf8");
    expect(app).not.toMatch(/getSnapshot\(\)\.children/);
    expect(app).not.toMatch(/@xstate\/react/);
    expect(app).not.toMatch(/useActorRef|useSelector/);
  });
});
