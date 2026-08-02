import * as Schema from "effect/Schema";
import { ChatExtensions } from "@emi/core/extensions";

const extension = ChatExtensions.runPromise(
  ChatExtensions.define({
    id: "example",
    parts: { "example.card": Schema.Struct({ title: Schema.String }) },
  }),
);
const extensions = extension.then((value) =>
  ChatExtensions.runPromise(ChatExtensions.compose([value])),
);

void extensions;
