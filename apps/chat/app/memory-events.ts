import { notifyQueryResourceChanged } from "./query-cache";

export const notifyMemoriesChanged = () => {
  notifyQueryResourceChanged("memories");
};
