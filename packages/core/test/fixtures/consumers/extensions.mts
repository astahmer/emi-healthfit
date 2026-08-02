// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { ChatExtensions } from "@emi/core/extensions";

const extension = ChatExtensions.define({
  id: "example",
  parts: { "example.card": {} },
});
const extensions = ChatExtensions.compose([extension]);

void extensions;
