import { describe, expect, it } from "vitest";
import * as styled from "@emi/core/web/styled";
import * as web from "@emi/core/web";

describe("@emi/core web package exports", () => {
  it("loads headless and optional styled subpaths", () => {
    expect(web.genericChatAppMachine).toBeDefined();
    expect(web.ChatShell).toBeDefined();
    expect(styled.ChatHeader).toBeDefined();
    expect(styled.ChatSidebar).toBeDefined();
  });
});
