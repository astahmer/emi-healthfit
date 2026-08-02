import * as Layer from "effect/Layer";
import { ChatServerEffect } from "@emi/core/server/effect";
import { ChatFetchHandlers } from "@emi/core/server/fetch";

const handlersLayer = ChatFetchHandlers.layer().pipe(Layer.provide(ChatServerEffect.Live));
const response = ChatFetchHandlers.handle({
  layer: handlersLayer,
  request: new Request("https://example.test/api/chat"),
});
void response;
