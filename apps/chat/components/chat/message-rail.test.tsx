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
          {
            id: "u1",
            text: "First user question about recovery",
            createdAt: "2026-07-14T10:00:00.000Z",
          },
          {
            id: "u2",
            text: "Second user question about sleep",
            createdAt: "2026-07-14T10:05:00.000Z",
          },
        ]}
        onSelect={onSelect}
        canScrollToPreviousUserMessage={false}
        onScrollToPreviousUserMessage={vi.fn()}
      />,
    );

    const items = screen.getAllByTestId("message-rail-item");
    expect(items).toHaveLength(2);

    await user.hover(items[1]!);
    const preview = screen.getByTestId("message-rail-preview");
    expect(preview).toHaveTextContent("Second user question about sleep");
    expect(preview.querySelector("time")).toHaveAttribute("datetime", "2026-07-14T10:05:00.000Z");

    await user.click(items[0]!);
    expect(onSelect).toHaveBeenCalledWith("u1");
  });

  it("opens the message sheet and jumps from a row", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MessageRail
        messages={[
          { id: "u1", text: "First user question about recovery" },
          {
            id: "u2",
            text: "Second user question about sleep",
            createdAt: "2026-07-14T10:05:00.000Z",
          },
        ]}
        onSelect={onSelect}
        canScrollToPreviousUserMessage={false}
        onScrollToPreviousUserMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("message-rail-sheet-trigger"));
    const sheetItems = screen.getAllByTestId("message-rail-sheet-item");
    expect(sheetItems).toHaveLength(2);
    expect(sheetItems[1]).toHaveTextContent("Second user question about sleep");
    expect(sheetItems[1]!.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-07-14T10:05:00.000Z",
    );

    await user.click(sheetItems[0]!);
    expect(onSelect).toHaveBeenCalledWith("u1");
  });

  it("shows the previous-message control when available", async () => {
    const user = userEvent.setup();
    const onScrollToPreviousUserMessage = vi.fn();
    render(
      <MessageRail
        messages={[{ id: "u1", text: "Only message" }]}
        onSelect={vi.fn()}
        canScrollToPreviousUserMessage
        onScrollToPreviousUserMessage={onScrollToPreviousUserMessage}
      />,
    );

    await user.click(screen.getByTestId("scroll-to-previous-user-message"));
    expect(onScrollToPreviousUserMessage).toHaveBeenCalledOnce();
  });
});
