import { ChatServerEffect } from "@emi/core/server/effect";
import type { ChatServerOptions } from "@emi/core/server";

declare const options: ChatServerOptions;
const serverEffect = ChatServerEffect.create(options);
void serverEffect;
