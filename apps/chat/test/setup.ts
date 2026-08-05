import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Node 26 ships a localStorage getter that returns undefined without
// --localstorage-file, so vitest skips jsdom's implementation; bridge it.
const jsdomWindow = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  Object.defineProperty(globalThis, "localStorage", {
    get: () => jsdomWindow.localStorage,
    configurable: true,
  });
}

class TestResizeObserver implements ResizeObserver {
  disconnect = () => {};
  observe = () => {};
  unobserve = () => {};
}

globalThis.ResizeObserver = TestResizeObserver;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
