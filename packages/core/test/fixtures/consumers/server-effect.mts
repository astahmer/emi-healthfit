// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { createEffectChatServer } from "@emi/core/server/effect";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import type { ChatServerOptions } from "@emi/core/server";

declare const options: ChatServerOptions;
const serverEffect = createEffectChatServer(options);
void serverEffect;
