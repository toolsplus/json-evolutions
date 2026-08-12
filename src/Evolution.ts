import {Effect, Schema} from "effect";
import jsonPatch from "fast-json-patch";
import type {Operation} from "fast-json-patch";
import immutabilityHelper from "immutability-helper";
import type {Spec} from "immutability-helper";
import type {Changeset} from "./Changeset.js";
import {latestVersion, type ValidChangelog} from "./Changelog.js";
import {
    ImmutabilityHelperEvolutionError,
    InitializeFromUnversionedFailed,
    InitializeFromUnversionedReturnedInvalidValue,
    InvalidStoredValue,
    JsonPatchEvolutionError,
    UnsupportedFutureVersion,
    type EvolutionError,
} from "./EvolutionError.js";
import {
    StoredValue as StoredValueSchema,
    StoredValueV0 as StoredValueV0Schema,
    isUnversionedJsonObject,
    type StoredValue,
    type StoredValueV0,
    type UnversionedJsonObject,
} from "./StoredValue.js";

const update = immutabilityHelper as unknown as <T>(
    value: T,
    spec: Spec<T>,
) => T;
const {applyPatch} = jsonPatch;

/** Turns a strict historic JSON object into a base-version stored value. */
export type InitializeFromUnversioned<E = never, R = never> = (
    input: UnversionedJsonObject,
) => Effect.Effect<StoredValueV0, E, R>;

/** Optional behavior for evolving historic unversioned values. */
export interface EvolveOptions<E = never, R = never> {
    readonly initializeFromUnversioned?: InitializeFromUnversioned<E, R>;
}

const parseStoredValue = (
    input: unknown,
): Effect.Effect<StoredValue, InvalidStoredValue> =>
    Schema.decodeUnknownEffect(StoredValueSchema)(input).pipe(
        Effect.mapError(
            (cause) =>
                new InvalidStoredValue({
                    message:
                        "Stored values must be strict JSON root objects with a valid _version marker.",
                    cause,
                }),
        ),
    );

const parseInitializedValue = (
    input: unknown,
): Effect.Effect<
    StoredValueV0,
    InitializeFromUnversionedReturnedInvalidValue
> =>
    Schema.decodeUnknownEffect(StoredValueV0Schema)(input).pipe(
        Effect.mapError(
            (cause) =>
                new InitializeFromUnversionedReturnedInvalidValue({
                    message:
                        "The initializer must return a strict stored value at base version 0.",
                    cause,
                }),
        ),
    );

const initializeOrParse = <E, R>(
    input: unknown,
    initializer: InitializeFromUnversioned<E, R> | undefined,
): Effect.Effect<
    StoredValue,
    | InvalidStoredValue
    | InitializeFromUnversionedFailed
    | InitializeFromUnversionedReturnedInvalidValue,
    R
> => {
    if (initializer !== undefined && isUnversionedJsonObject(input)) {
        return Effect.suspend(() => initializer(structuredClone(input))).pipe(
            Effect.mapError(
                (cause) =>
                    new InitializeFromUnversionedFailed({
                        message: "Failed to initialize an unversioned value.",
                        cause,
                    }),
            ),
            Effect.flatMap(parseInitializedValue),
        );
    }
    return parseStoredValue(input);
};

const invalidDelegateResult = (
    message: string,
    cause: unknown,
): InvalidStoredValue => new InvalidStoredValue({message, cause});

const validateAndAdvance = (
    previous: StoredValue,
    changeset: Changeset,
    candidate: unknown,
): Effect.Effect<StoredValue, InvalidStoredValue> =>
    parseStoredValue(candidate).pipe(
        Effect.flatMap((parsed) =>
            parsed._version === previous._version
                ? Effect.succeed(parsed)
                : Effect.fail(
                      invalidDelegateResult(
                          `Changeset ${changeset._version} altered the reserved root _version marker.`,
                          {before: previous._version, after: parsed._version},
                      ),
                  ),
        ),
        Effect.flatMap((parsed) =>
            parseStoredValue({...parsed, _version: changeset._version}),
        ),
    );

const applyChangeset = (
    input: StoredValue,
    changeset: Changeset,
): Effect.Effect<StoredValue, EvolutionError> => {
    const delegated: Effect.Effect<
        unknown,
        JsonPatchEvolutionError | ImmutabilityHelperEvolutionError
    > =
        changeset.type === "JSON_PATCH_CHANGESET"
            ? Effect.try({
                  try: () =>
                      applyPatch(
                          input,
                          changeset.patch as ReadonlyArray<Operation> as Operation[],
                          true,
                          false,
                      ).newDocument,
                  catch: (cause) =>
                      new JsonPatchEvolutionError({
                          message: `Failed to apply JSON Patch changeset ${changeset._version}.`,
                          version: changeset._version,
                          cause,
                      }),
              })
            : Effect.try({
                  try: () => update(structuredClone(input), changeset.spec),
                  catch: (cause) =>
                      new ImmutabilityHelperEvolutionError({
                          message: `Failed to apply immutability-helper changeset ${changeset._version}.`,
                          version: changeset._version,
                          cause,
                      }),
              });

    return delegated.pipe(
        Effect.flatMap((candidate) =>
            validateAndAdvance(input, changeset, candidate),
        ),
    );
};

const applyPendingChangesets = (
    changelog: ValidChangelog,
    initial: StoredValue,
): Effect.Effect<StoredValue, EvolutionError> => {
    let result: Effect.Effect<StoredValue, EvolutionError> =
        Effect.succeed(initial);
    for (const changeset of changelog) {
        if (changeset._version > initial._version) {
            result = result.pipe(
                Effect.flatMap((current) => applyChangeset(current, changeset)),
            );
        }
    }
    return result;
};

/** Evolves a stored or eligible unversioned input to the latest representation. */
export const evolve =
    <E = never, R = never>(
        changelog: ValidChangelog,
        options: EvolveOptions<E, R> = {},
    ) =>
    (input: unknown): Effect.Effect<StoredValue, EvolutionError, R> => {
        const latest = latestVersion(changelog);
        return initializeOrParse(input, options.initializeFromUnversioned).pipe(
            Effect.flatMap((storedValue) => {
                if (storedValue._version > latest) {
                    return Effect.fail(
                        new UnsupportedFutureVersion({
                            message: `Stored value version ${storedValue._version} is newer than supported version ${latest}.`,
                            version: storedValue._version,
                            latestVersion: latest,
                        }),
                    );
                }
                if (storedValue._version === latest) {
                    return Effect.succeed(storedValue);
                }
                return applyPendingChangesets(changelog, storedValue);
            }),
        );
    };
