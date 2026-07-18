const listeners = new Set<() => void>();

export const notifyMemoriesChanged = () => {
  listeners.forEach((listener) => listener());
};

export const subscribeToMemoryChanges = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
