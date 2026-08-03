import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  ChatAppConfigSchema,
  defaultChatAppConfig,
  type ChatAppConfig,
} from "../chat/app-config.ts";

export class ChatRouteApp {
  static make({ appConfig = defaultChatAppConfig }: { readonly appConfig?: ChatAppConfig } = {}) {
    const config = Schema.decodeUnknownSync(ChatAppConfigSchema)(appConfig);
    const settings = Effect.fn("core.chat.settings")(function* (_request: HttpServerRequest) {
      return yield* HttpServerResponse.json({
        storage: "local",
        key: config.settingsStorageKey,
        apiKey: "browser-only",
      });
    });
    const releases = Effect.fn("core.chat.releases")(function* (_request: HttpServerRequest) {
      return yield* HttpServerResponse.json({
        releases: [
          {
            version: config.version,
            changes: config.releaseNotes,
          },
        ],
      });
    });
    return { releases, settings };
  }
}
