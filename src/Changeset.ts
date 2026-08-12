import {Schema} from "effect";
import type {Spec} from "immutability-helper";
import type {StoredValue} from "./StoredValue.js";

const AddOperation = Schema.Struct({
    op: Schema.Literal("add"),
    path: Schema.String,
    value: Schema.Json,
});
const RemoveOperation = Schema.Struct({
    op: Schema.Literal("remove"),
    path: Schema.String,
});
const ReplaceOperation = Schema.Struct({
    op: Schema.Literal("replace"),
    path: Schema.String,
    value: Schema.Json,
});
const MoveOperation = Schema.Struct({
    op: Schema.Literal("move"),
    from: Schema.String,
    path: Schema.String,
});
const CopyOperation = Schema.Struct({
    op: Schema.Literal("copy"),
    from: Schema.String,
    path: Schema.String,
});
const TestOperation = Schema.Struct({
    op: Schema.Literal("test"),
    path: Schema.String,
    value: Schema.Json,
});

/** Runtime schema for the six standard RFC 6902 operations. */
export const JsonPatchOperation = Schema.Union([
    AddOperation,
    RemoveOperation,
    ReplaceOperation,
    MoveOperation,
    CopyOperation,
    TestOperation,
]);

/** One of the six standard RFC 6902 operations. */
export type JsonPatchOperation = typeof JsonPatchOperation.Type;

/** Runtime schema for a JSON Patch changeset declaration. */
export const JsonPatchChangeset = Schema.Struct({
    type: Schema.Literal("JSON_PATCH_CHANGESET"),
    _version: Schema.Number,
    patch: Schema.Array(JsonPatchOperation),
});

/** A JSON Patch changeset declaration. */
export type JsonPatchChangeset = typeof JsonPatchChangeset.Type;

const ImmutabilityHelperSpec = Schema.declare<Spec<StoredValue>>(
    (input): input is Spec<StoredValue> =>
        (typeof input === "object" && input !== null) ||
        typeof input === "function",
    {identifier: "ImmutabilityHelperSpec"},
);

/** Runtime schema for an opaque immutability-helper changeset declaration. */
export const ImmutabilityHelperChangeset = Schema.Struct({
    type: Schema.Literal("IMMUTABILITY_HELPER_CHANGESET"),
    _version: Schema.Number,
    spec: ImmutabilityHelperSpec,
});

/** An opaque immutability-helper changeset declaration. */
export type ImmutabilityHelperChangeset =
    typeof ImmutabilityHelperChangeset.Type;

/** Runtime schema for a supported changeset declaration. */
export const Changeset = Schema.Union([
    JsonPatchChangeset,
    ImmutabilityHelperChangeset,
]);

/** A supported changeset declaration. */
export type Changeset = typeof Changeset.Type;

/** Creates a trusted TypeScript JSON Patch declaration. */
export const jsonPatchChangeset = (
    props: Omit<JsonPatchChangeset, "type">,
): JsonPatchChangeset => ({...props, type: "JSON_PATCH_CHANGESET"});

/** Creates a trusted TypeScript immutability-helper declaration. */
export const immutabilityHelperChangeset = (
    props: Omit<ImmutabilityHelperChangeset, "type">,
): ImmutabilityHelperChangeset => ({
    ...props,
    type: "IMMUTABILITY_HELPER_CHANGESET",
});

/** Runtime schema for an unvalidated changelog declaration. */
export const Changelog = Schema.Array(Changeset);

/** An unvalidated changelog declaration. */
export type Changelog = typeof Changelog.Type;
