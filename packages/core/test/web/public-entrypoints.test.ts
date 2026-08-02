import { describe, expect, it } from "vitest";
import * as components from "@emi/core/components";
import * as styled from "@emi/core/components/styled";

describe("@emi/core component package exports", () => {
  it("loads headless and optional styled target subpaths", () => {
    expect(components.ConnectedThread).toBeDefined();
    expect(components.ConnectedComposer).toBeDefined();
    expect(styled.ChatApp).toBeDefined();
    expect(styled.ChatShell).toBeDefined();
  });
});
