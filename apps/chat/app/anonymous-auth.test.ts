import { describe, expect, it } from "vitest";
import { isAnonymousAccountEmail } from "./anonymous-auth";

describe("anonymous accounts", () => {
  it("recognizes app-owned guest addresses without exposing them", () => {
    expect(
      isAnonymousAccountEmail("guest-8c75583b-0b8d-4bda-97e4-6cd7286f1378@anonymous.emi.invalid"),
    ).toBe(true);
    expect(isAnonymousAccountEmail("coach@example.com")).toBe(false);
  });
});
