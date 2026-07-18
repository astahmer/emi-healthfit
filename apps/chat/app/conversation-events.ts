let revision = 0;
const listeners = new Set<() => void>();

export const notifyConversationsChanged = () => {
  revision += 1;
  listeners.forEach((listener) => listener());
};

export const subscribeToConversationChanges = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getConversationRevision = () => revision;
