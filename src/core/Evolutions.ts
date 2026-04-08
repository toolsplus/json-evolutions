import {Type} from "io-ts";
import update from "immutability-helper";
import {applyPatch, JsonPatchError} from "fast-json-patch";
import * as E from "fp-ts/Either";
import * as A from "fp-ts/Array";
import * as J from "fp-ts/Json";
import {flow, pipe} from "fp-ts/function";
import {
    Changelog,
    Changeset,
    EvolutionError,
    InitializeFromUnversioned,
    StoredValue,
    StoredValueV0,
    ValidChangelog,
    Versioned,
} from "../api";

/**
 * Base version is the first version of any versioned entity. If a changelog is empty the entity's version value
 * is the base version.
 */
export const BASE_VERSION = 0;

export type VersionedJsonObject = J.JsonRecord & Versioned;

export interface EvolveOptions {
    readonly initializeFromUnversioned?: InitializeFromUnversioned;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isValidVersion = (value: unknown): value is number =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value >= BASE_VERSION;

const ensureStoredValueResult = (version: number) => (
    result: unknown,
): E.Either<EvolutionError, StoredValue> =>
    isRecord(result)
        ? E.right(result as StoredValue)
        : E.left({
              errorCode: "INVALID_STORED_VALUE_ERROR",
              message: `Changeset version ${version} did not produce an object.`,
          });

const changesetReducer = (
    target: E.Either<EvolutionError, StoredValue>,
    changeset: Changeset,
): E.Either<EvolutionError, StoredValue> => {
    const applyChangeset = (cs: Changeset) => (
        t: StoredValue,
    ): E.Either<EvolutionError, StoredValue> => {
        switch (cs.type) {
            case "JSON_PATCH_CHANGESET":
                return pipe(
                    E.tryCatch(
                        () => applyPatch(t, cs.patch, true, false).newDocument,
                        (e) =>
                            e instanceof JsonPatchError
                                ? {
                                      errorCode: "JSON_PATCH_EVOLUTION_ERROR" as const,
                                      message: `Failed to apply JSON patch changeset with version ${cs._version}: ${e.message}`,
                                      error: e,
                                  }
                                : {
                                      errorCode: "UNEXPECTED_EVOLUTION_ERROR" as const,
                                      message: `Unexpected JSON patch error: ${String(
                                          e,
                                      )}`,
                                  },
                    ),
                    E.chain(ensureStoredValueResult(cs._version)),
                );
            case "IMMUTABILITY_HELPER_CHANGESET":
                return pipe(
                    E.tryCatch(
                        () => update(t, cs.spec) as unknown,
                        (e) =>
                            e instanceof Error
                                ? {
                                      errorCode: "IMMUTABILITY_HELPER_EVOLUTION_ERROR" as const,
                                      message: `Failed to apply Immutability helper changeset with version ${cs._version}: ${e.message}`,
                                      error: e,
                                  }
                                : {
                                      errorCode: "UNEXPECTED_EVOLUTION_ERROR" as const,
                                      message: `Unexpected immutability-helper error: ${String(
                                          e,
                                      )}`,
                                  },
                    ),
                    E.chain(ensureStoredValueResult(cs._version)),
                );
        }
    };

    return pipe(target, E.chain(applyChangeset(changeset)));
};

const sortChangesetsByVersion = (changelog: Changelog): Changeset[] =>
    [...changelog].sort((left, right) => left._version - right._version);

const ensureInitializedValue = (
    value: StoredValueV0,
): E.Either<EvolutionError, StoredValueV0> =>
    pipe(
        parseStoredValue(value),
        E.mapLeft((error) => ({
            errorCode: "INITIALIZE_FROM_UNVERSIONED_RETURNED_INVALID_VALUE_ERROR" as const,
            message:
                "initializeFromUnversioned must return a versioned object with _version 0.",
            error,
        })),
        E.chain((storedValue) =>
            storedValue._version === BASE_VERSION
                ? E.right(storedValue as StoredValueV0)
                : E.left({
                      errorCode: "INITIALIZE_FROM_UNVERSIONED_RETURNED_INVALID_VALUE_ERROR" as const,
                      message:
                          "initializeFromUnversioned must return a versioned object with _version 0.",
                  }),
        ),
    );

const parseStoredValueWithInitialization = (
    input: unknown,
    initializeFromUnversioned?: InitializeFromUnversioned,
): E.Either<EvolutionError, StoredValue> =>
    pipe(
        parseStoredValue(input),
        E.orElseW((error) =>
            error.errorCode === "MISSING_VERSION_ERROR" &&
            initializeFromUnversioned !== undefined
                ? pipe(
                      initializeFromUnversioned(input),
                      E.mapLeft((initializeError) => ({
                          errorCode: "INITIALIZE_FROM_UNVERSIONED_FAILED_ERROR" as const,
                          message: "Failed to initialize an unversioned value.",
                          error: initializeError,
                      })),
                      E.chain(ensureInitializedValue),
                  )
                : E.left(error),
        ),
    );

/**
 * Validates the given changelog and returns a sorted, branded changelog if valid.
 *
 * @param changelog Changelog to validate
 * @returns Validated changelog sorted in ascending order.
 */
export const validateChangelog = (
    changelog: Changelog,
): E.Either<EvolutionError, ValidChangelog> => {
    const sorted = sortChangesetsByVersion(changelog);

    for (let index = 0; index < sorted.length; index += 1) {
        const current = sorted[index];
        const expectedVersion = index + 1;

        if (
            !Number.isInteger(current._version) ||
            !Number.isSafeInteger(current._version) ||
            current._version < 1
        ) {
            return E.left({
                errorCode: "INVALID_CHANGELOG_ERROR",
                message: `Changeset versions must be positive integers. Found ${current._version}.`,
            });
        }

        if (index > 0 && current._version === sorted[index - 1]._version) {
            return E.left({
                errorCode: "DUPLICATE_CHANGESET_VERSION_ERROR",
                message: `Found duplicate changeset version ${current._version}.`,
            });
        }

        if (current._version !== expectedVersion) {
            return E.left({
                errorCode: "NON_SEQUENTIAL_CHANGESET_VERSION_ERROR",
                message: `Expected changeset version ${expectedVersion} but found ${current._version}.`,
            });
        }
    }

    return E.right((sorted as unknown) as ValidChangelog);
};

/**
 * Creates a validated changelog from the given changesets.
 *
 * @param changesets Sequence of changesets
 * @returns Validated changelog sorted in ascending order.
 */
export const createChangelog = (
    ...changesets: ReadonlyArray<Changeset>
): E.Either<EvolutionError, ValidChangelog> => validateChangelog(changesets);

/**
 * Returns the latest entity version based on the given changelog.
 *
 * @param changelog Changelog for which to determine the version
 * @returns Latest entity version based on the changelog entries or the base version if changelog is empty.
 */
export const latestVersion = (changelog: ValidChangelog): number =>
    changelog.length === 0
        ? BASE_VERSION
        : changelog[changelog.length - 1]._version;

/**
 * Parses a stored JSON value and ensures it is an object with a valid `_version`.
 *
 * @param input Stored value to validate
 * @returns Stored value if valid or an error describing why the value is unsupported.
 */
export const parseStoredValue = (
    input: unknown,
): E.Either<EvolutionError, StoredValue> => {
    if (!isRecord(input)) {
        return E.left({
            errorCode: "INVALID_STORED_VALUE_ERROR",
            message: "Stored value must be a non-null object.",
        });
    }

    if (!Object.prototype.hasOwnProperty.call(input, "_version")) {
        return E.left({
            errorCode: "MISSING_VERSION_ERROR",
            message: "Stored value is missing the _version property.",
        });
    }

    if (!isValidVersion(input._version)) {
        return E.left({
            errorCode: "INVALID_VERSION_ERROR",
            message:
                "Stored value _version must be a non-negative safe integer.",
        });
    }

    return E.right(input as StoredValue);
};

/**
 * Evolves the given `target` JSON value by sequentially applying the changesets in
 * the given changelog.
 *
 * @param changelog Validated sequence of changesets that describe the transformations
 * @param options Additional evolve options
 * @returns JSON value with all transformations applied or an error if the transformation fails.
 */
export const evolve = (
    changelog: ValidChangelog,
    options: EvolveOptions = {},
) => (target: unknown): E.Either<EvolutionError, StoredValue> => {
    const latest = latestVersion(changelog);
    const applyChangesets = (storedValue: StoredValue) =>
        pipe(
            changelog.filter(
                (changeset) => changeset._version > storedValue._version,
            ),
            A.reduce(
                E.right<EvolutionError, StoredValue>(storedValue),
                changesetReducer,
            ),
            E.map((result) =>
                result._version === latest
                    ? result
                    : {
                          ...result,
                          _version: latest,
                      },
            ),
        );

    return pipe(
        parseStoredValueWithInitialization(
            target,
            options.initializeFromUnversioned,
        ),
        E.chain((storedValue) =>
            storedValue._version > latest
                ? E.left({
                      errorCode: "UNSUPPORTED_FUTURE_VERSION_ERROR",
                      message: `Stored value version ${storedValue._version} is newer than supported version ${latest}.`,
                  })
                : storedValue._version === latest
                ? E.right(storedValue)
                : applyChangesets(storedValue),
        ),
    );
};

/**
 * io-ts combinator that encodes any non-primitive type A using the given codec and includes a `_version` property
 * indicating the current version of A. To ensure the `_version` property is stripped when decoding the data to
 * type A, the given codec should be strict and A should not declare a `_version` property.
 *
 * @see https://gcanti.github.io/io-ts/modules/index.ts.html#strict
 *
 * @param codec Codec for the non-primitive type A
 * @param version Version number to include when encoding A to its output type O
 */
export const versioned = <A extends object, O extends object = A, I = unknown>(
    codec: Type<A, O, I>,
    version: number,
): Type<A, O & Versioned, I> =>
    new Type<A, O & Versioned, I>(
        `Versioned<${codec.name}>`,
        codec.is,
        codec.validate,
        flow(codec.encode, (encoded) => ({...encoded, _version: version})),
    );
