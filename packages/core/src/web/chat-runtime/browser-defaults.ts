import type { KeyValueStorage } from "../../runtime/types.ts";

export interface BrowserChatDefaults {
  storage: {
    drafts: KeyValueStorage;
  };
  browser: {
    online: boolean;
    subscribeOnline: (listener: (online: boolean) => void) => () => void;
  };
  identity: {
    createId: () => string;
    now: () => string;
  };
}

export interface BrowserDraftsStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface BrowserOnlineEventTarget {
  addEventListener: (type: "online" | "offline", listener: () => void) => void;
  removeEventListener: (type: "online" | "offline", listener: () => void) => void;
}

export interface BrowserChatDefaultsInput {
  draftsStorage?: BrowserDraftsStorage;
  navigator?: { readonly onLine: boolean };
  eventTarget?: BrowserOnlineEventTarget;
  createId: () => string;
  now: () => string;
}

const nullStorage: KeyValueStorage = {
  get: () => Promise.resolve(null),
  set: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

export const createBrowserChatDefaults = ({
  draftsStorage,
  navigator,
  eventTarget,
  createId,
  now,
}: BrowserChatDefaultsInput): BrowserChatDefaults => {
  const drafts: KeyValueStorage =
    draftsStorage === undefined
      ? nullStorage
      : {
          get: (key) => Promise.resolve(draftsStorage.getItem(key)),
          set: (key, value) => {
            draftsStorage.setItem(key, value);
            return Promise.resolve();
          },
          remove: (key) => {
            draftsStorage.removeItem(key);
            return Promise.resolve();
          },
        };

  return {
    storage: { drafts },
    browser: {
      online: navigator?.onLine ?? true,
      subscribeOnline: (listener) => {
        if (eventTarget === undefined) return () => undefined;
        const update = () => listener(navigator?.onLine ?? true);
        eventTarget.addEventListener("online", update);
        eventTarget.addEventListener("offline", update);
        return () => {
          eventTarget.removeEventListener("online", update);
          eventTarget.removeEventListener("offline", update);
        };
      },
    },
    identity: { createId, now },
  };
};
