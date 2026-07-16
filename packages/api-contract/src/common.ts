import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export const Identifier = Schema.String.check(Schema.isMinLength(1));
export const Content = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/));
export const Limit = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 500 }),
);
export const Deleted = Schema.Struct({ success: Schema.Literal(true) });
export const Created = Schema.Struct({ id: Schema.String });

export class BadRequest extends Schema.TaggedErrorClass<BadRequest>()("BadRequest", {
  message: Schema.String,
}) {}

export class NotFound extends Schema.TaggedErrorClass<NotFound>()("NotFound", {
  message: Schema.String,
}) {}

export class InternalServerError extends Schema.TaggedErrorClass<InternalServerError>()(
  "InternalServerError",
  { message: Schema.String },
) {}

export const BadRequestSchema = BadRequest.pipe(HttpApiSchema.status(400));
export const NotFoundSchema = NotFound.pipe(HttpApiSchema.status(404));
export const InternalServerErrorSchema = InternalServerError.pipe(HttpApiSchema.status(500));
export const StandardErrors = [
  BadRequestSchema,
  NotFoundSchema,
  InternalServerErrorSchema,
] as const;
