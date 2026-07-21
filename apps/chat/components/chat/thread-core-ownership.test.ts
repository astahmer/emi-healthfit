import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("chat thread ownership", () => {
  it("imports MessagePart and ComposerControls shape from @emi/core/web", async () => {
    const source = await readFile(join(process.cwd(), "components/chat/thread.tsx"), "utf8");
    expect(source).toContain('from "@emi/core/web"');
    expect(source).toContain("MessagePart");
    expect(source).toContain("CoreComposerControls");
    expect(source).not.toContain("react-markdown");
  });

  it("keeps GenUI render_component wiring in the chat tool-result wrapper", async () => {
    const source = await readFile(
      join(process.cwd(), "components/chat/tool-result-content.tsx"),
      "utf8",
    );
    expect(source).toContain("CoreToolResultContent");
    expect(source).toContain("GenUIRenderer");
    expect(source).toContain("@emi/flavor-healthfit/web");
  });
});
