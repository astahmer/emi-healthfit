import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const Identifier = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/i),
);
const Namespace = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isPattern(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/i),
);
const PartName = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isPattern(/^[a-z0-9]+(?:[.-][a-z0-9]+)+\.[a-z0-9][a-z0-9._-]*$/i),
);

export interface ChatExtensionDefinition {
  readonly id: string;
  readonly namespace?: string;
  readonly parts?: Readonly<Record<string, Schema.ConstraintDecoder<unknown>>>;
  readonly tools?: Readonly<Record<string, unknown>>;
  readonly navigation?: ReadonlyArray<unknown>;
}

export interface ChatExtension {
  readonly id: string;
  readonly namespace: string;
  readonly parts: Readonly<Record<string, Schema.ConstraintDecoder<unknown>>>;
  readonly tools: Readonly<Record<string, unknown>>;
  readonly navigation: ReadonlyArray<unknown>;
}

export class ChatExtensionError extends Schema.TaggedErrorClass<ChatExtensionError>()(
  "ChatExtensionError",
  {
    kind: Schema.Literals(["invalid-definition", "collision", "unknown-part"]),
    message: Schema.String,
  },
) {}

const invalidDefinition = (message: string): ChatExtensionError =>
  new ChatExtensionError({ kind: "invalid-definition", message });

const validateIdentifier = (value: unknown, label: string) =>
  Schema.decodeUnknownEffect(Identifier)(value).pipe(
    Effect.mapError((error) => invalidDefinition(`${label}: ${error.message}`)),
  );

const validateNamespace = (value: unknown) =>
  Schema.decodeUnknownEffect(Namespace)(value).pipe(
    Effect.mapError((error) => invalidDefinition(`namespace: ${error.message}`)),
  );

export class ChatExtensions {
  static define(
    definition: ChatExtensionDefinition,
  ): Effect.Effect<ChatExtension, ChatExtensionError> {
    return Effect.gen(function* () {
      const id = yield* validateIdentifier(definition.id, "id");
      const namespace = yield* validateNamespace(definition.namespace ?? `${id}.chat`);
      const parts = definition.parts ?? {};
      const tools = definition.tools ?? {};
      for (const name of Object.keys(parts)) {
        const validName = yield* Schema.decodeUnknownEffect(PartName)(name).pipe(
          Effect.mapError((error) => invalidDefinition(`part ${name}: ${error.message}`)),
        );
        if (!validName.toLowerCase().startsWith(`${namespace.toLowerCase()}.`))
          return yield* Effect.fail(
            invalidDefinition(`part ${name}: name must use namespace ${namespace}`),
          );
        if (!Schema.isSchema(parts[name]))
          return yield* Effect.fail(invalidDefinition(`part ${name}: schema is required`));
      }
      return Object.freeze({
        id,
        namespace,
        parts: Object.freeze({ ...parts }),
        tools: Object.freeze({ ...tools }),
        navigation: Object.freeze([...(definition.navigation ?? [])]),
      });
    });
  }

  static compose(
    extensions: ReadonlyArray<ChatExtension>,
  ): Effect.Effect<ReadonlyArray<ChatExtension>, ChatExtensionError> {
    return Effect.gen(function* () {
      const ids = new Set<string>();
      const namespaces = new Set<string>();
      const contributions = new Set<string>();
      for (const extension of extensions) {
        const normalizedId = extension.id.toLowerCase();
        const normalizedNamespace = extension.namespace.toLowerCase();
        if (ids.has(normalizedId) || namespaces.has(normalizedNamespace))
          return yield* Effect.fail(
            new ChatExtensionError({
              kind: "collision",
              message: `Extension ${extension.id} collides with an existing extension.`,
            }),
          );
        ids.add(normalizedId);
        namespaces.add(normalizedNamespace);
        for (const name of Object.keys(extension.parts)) {
          const normalizedName = name.toLowerCase();
          if (contributions.has(normalizedName))
            return yield* Effect.fail(
              new ChatExtensionError({
                kind: "collision",
                message: `Extension contribution ${name} is already registered.`,
              }),
            );
          contributions.add(normalizedName);
        }
      }
      return Object.freeze(
        [...extensions].toSorted((left, right) => left.namespace.localeCompare(right.namespace)),
      );
    });
  }

  static decodePart({
    extension,
    name,
    value,
  }: {
    readonly extension: ChatExtension;
    readonly name: string;
    readonly value: unknown;
  }): Effect.Effect<unknown, ChatExtensionError> {
    const schema = extension.parts[name];
    if (schema === undefined)
      return Effect.fail(
        new ChatExtensionError({
          kind: "unknown-part",
          message: `Extension ${extension.id} does not define ${name}.`,
        }),
      );
    return Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError(
        (error) =>
          new ChatExtensionError({
            kind: "invalid-definition",
            message: `Extension part ${name} failed validation: ${error.message}`,
          }),
      ),
    );
  }

  static runPromise<Value, Error>(effect: Effect.Effect<Value, Error>): Promise<Value> {
    return Effect.runPromise(effect);
  }
}
