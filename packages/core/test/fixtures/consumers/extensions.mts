// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { composeChatExtensions, defineChatExtension } from "@emi/core/extensions";

const extension = defineChatExtension({
  id: "example",
  parts: { "example.card": {} },
});
const extensions = composeChatExtensions([extension]);

void extensions;
