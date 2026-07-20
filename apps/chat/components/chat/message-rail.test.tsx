import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageRail } from "./message-rail";

describe("MessageRail", () => {
  it("shows a preview on hover and selects a message", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MessageRail
        messages={[
          { id: "u1", text: "First user question about recovery" },
          { id: "u2", text: "Second user question about sleep" },
        ]}
        onSelect={onSelect}
      />,
    );

    const items = screen.getAllByTestId("message-rail-item");
    expect(items).toHaveLength(2);

    await user.hover(items[1]!);
    expect(screen.getByTestId("message-rail-preview")).toHaveTextContent(
      "Second user question about sleep",
    );

    await user.click(items[0]!);
    expect(onSelect).toHaveBeenCalledWith("u1");
  });
});
