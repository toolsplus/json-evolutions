import {Schema} from "effect";

/** The input is not a strict JSON stored value. */
export class InvalidStoredValue extends Schema.TaggedError<InvalidStoredValue>()(
    "InvalidStoredValue",
    {message: Schema.String, cause: Schema.Defect()},
) {}

/** The input was written by a newer changelog than this consumer supports. */
export class UnsupportedFutureVersion extends Schema.TaggedError<UnsupportedFutureVersion>()(
    "UnsupportedFutureVersion",
    {
        message: Schema.String,
        version: Schema.Number,
        latestVersion: Schema.Number,
    },
) {}

/** An initializer failed through its typed error channel. */
export class InitializeFromUnversionedFailed extends Schema.TaggedError<InitializeFromUnversionedFailed>()(
    "InitializeFromUnversionedFailed",
    {message: Schema.String, cause: Schema.Defect()},
) {}

/** An initializer succeeded with something other than a base-version stored value. */
export class InitializeFromUnversionedReturnedInvalidValue extends Schema.TaggedError<InitializeFromUnversionedReturnedInvalidValue>()(
    "InitializeFromUnversionedReturnedInvalidValue",
    {message: Schema.String, cause: Schema.Defect()},
) {}

/** One or more source-declared changesets violate the changelog invariants. */
export class InvalidChangelog extends Schema.TaggedError<InvalidChangelog>()(
    "InvalidChangelog",
    {message: Schema.String, cause: Schema.Defect()},
) {}

/** fast-json-patch rejected or failed a changeset. */
export class JsonPatchEvolutionError extends Schema.TaggedError<JsonPatchEvolutionError>()(
    "JsonPatchEvolutionError",
    {message: Schema.String, version: Schema.Number, cause: Schema.Defect()},
) {}

/** immutability-helper rejected or failed a changeset. */
export class ImmutabilityHelperEvolutionError extends Schema.TaggedError<ImmutabilityHelperEvolutionError>()(
    "ImmutabilityHelperEvolutionError",
    {message: Schema.String, version: Schema.Number, cause: Schema.Defect()},
) {}

/** Runtime schema for every failure produced by evolution. */
export const EvolutionError = Schema.Union([
    InvalidStoredValue,
    UnsupportedFutureVersion,
    InitializeFromUnversionedFailed,
    InitializeFromUnversionedReturnedInvalidValue,
    InvalidChangelog,
    JsonPatchEvolutionError,
    ImmutabilityHelperEvolutionError,
]);

/** Every failure produced by evolution. */
export type EvolutionError = typeof EvolutionError.Type;
