// @ts-expect-error AI SDK UIMessage types must stay inside the provider adapter.
import type { FileUIPart, UIMessage } from "@emi/core/protocol";

declare const filePart: FileUIPart;
declare const uiMessage: UIMessage;

void filePart;
void uiMessage;
