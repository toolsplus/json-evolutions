import * as fc from "fast-check";
import * as E from "fp-ts/Either";
import {pipe} from "fp-ts/function";
import * as v0 from "./__fixtures__/configuration/v0";
import * as v1 from "./__fixtures__/configuration/v1";
import * as v2 from "./__fixtures__/configuration/v2";
import {
    InitializeFromUnversioned,
    StoredValue,
    StoredValueV0,
    Versioned,
    createChangelog,
    evolve,
    immutabilityHelperChangeset,
    jsonPatchChangeset,
    latestVersion,
    parseStoredValue,
    validateChangelog,
} from "../../src";

const defaultFields = ["name", "id"];

const withVersion = (v: number) => <T>(t: T): T & Versioned => ({
    ...t,
    _version: v,
});

const expectRight = <R>(either: E.Either<unknown, R>): R => {
    if (E.isLeft(either)) {
        throw new Error(
            `Expected Right but received ${JSON.stringify(either.left)}`,
        );
    }

    return either.right;
};

const expectLeftErrorCode = (
    either: E.Either<{errorCode: string; message?: string}, unknown>,
    errorCode: string,
) => {
    expect(E.isLeft(either)).toBe(true);

    if (E.isRight(either)) {
        throw new Error(`Expected Left(${errorCode}) but received Right.`);
    }

    expect(either.left.errorCode).toBe(errorCode);
    return either.left;
};

const initializeFromUnversioned: InitializeFromUnversioned = (input) => {
    if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input) ||
        !("defaultFields" in input)
    ) {
        return E.left({
            errorCode: "INVALID_STORED_VALUE_ERROR",
            message: "Value cannot be initialized.",
        });
    }

    return E.right({
        ...(input as Record<string, unknown>),
        _version: 0,
    } as StoredValueV0);
};

describe("Evolutions", () => {
    describe("createChangelog and latestVersion", () => {
        it("should define base version as 0", () => {
            expect(latestVersion(expectRight(createChangelog()))).toBe(0);
        });

        it("should return the latest version", () => {
            expect(latestVersion(v2.changelog)).toBe(2);
        });

        it("should accept an unordered changelog and normalize it", () => {
            return fc.assert(
                fc.property(
                    fc.shuffledSubarray([...v2.changelog], {
                        minLength: v2.changelog.length,
                    }),
                    (shuffledChangelog) => {
                        const validated = expectRight(
                            validateChangelog(shuffledChangelog),
                        );
                        expect(latestVersion(validated)).toBe(2);
                    },
                ),
            );
        });

        it("should reject duplicate versions", () => {
            const duplicateChangeset = jsonPatchChangeset({
                _version: 1,
                patch: [],
            });

            const result = createChangelog(
                duplicateChangeset,
                duplicateChangeset,
            );

            expectLeftErrorCode(result, "DUPLICATE_CHANGESET_VERSION_ERROR");
        });

        it("should reject non-sequential versions", () => {
            const result = createChangelog(
                jsonPatchChangeset({
                    _version: 2,
                    patch: [],
                }),
            );

            expectLeftErrorCode(
                result,
                "NON_SEQUENTIAL_CHANGESET_VERSION_ERROR",
            );
        });
    });

    describe("parseStoredValue", () => {
        it("should reject non-object values", () => {
            expectLeftErrorCode(
                parseStoredValue("invalid"),
                "INVALID_STORED_VALUE_ERROR",
            );
            expectLeftErrorCode(
                parseStoredValue(["invalid"]),
                "INVALID_STORED_VALUE_ERROR",
            );
            expectLeftErrorCode(
                parseStoredValue(null),
                "INVALID_STORED_VALUE_ERROR",
            );
        });

        it("should reject objects without a version", () => {
            expectLeftErrorCode(
                parseStoredValue({defaultFields}),
                "MISSING_VERSION_ERROR",
            );
        });

        it("should reject invalid versions", () => {
            expectLeftErrorCode(
                parseStoredValue({_version: -1, defaultFields}),
                "INVALID_VERSION_ERROR",
            );
            expectLeftErrorCode(
                parseStoredValue({_version: 1.5, defaultFields}),
                "INVALID_VERSION_ERROR",
            );
        });
    });

    describe("versioned codec", () => {
        it("check laws", () => {
            const decodeFollowedByEncodeEqNoOp = (
                encoded: v2.Configuration & Versioned,
            ) =>
                pipe(
                    v2.codec.decode(encoded),
                    E.fold(() => encoded, v2.codec.encode),
                );

            const encodeFollowedByDecodeEqNoOp = (decoded: v2.Configuration) =>
                v2.codec.decode(v2.codec.encode(decoded));

            return fc.assert(
                fc.property(v2.configuration, (decodedSample) => {
                    const encodedSample = withVersion(2)(decodedSample);

                    expect(
                        decodeFollowedByEncodeEqNoOp(encodedSample),
                    ).toStrictEqual(encodedSample);
                    expect(
                        encodeFollowedByDecodeEqNoOp(decodedSample),
                    ).toStrictEqual(E.right(decodedSample));
                }),
            );
        });

        it("should drop the version number when decoding a versioned record", () => {
            return fc.assert(
                fc.property(v2.configuration, (decodedSample) => {
                    const encodedSample = withVersion(2)(decodedSample);

                    const result = v2.codec.decode(encodedSample);
                    expect(result).toStrictEqual(E.right(decodedSample));
                }),
            );
        });

        it("should include the latest version number when encoding a versioned record", () => {
            return fc.assert(
                fc.property(v2.configuration, (decodedSample) => {
                    const encodedSample = withVersion(2)(decodedSample);

                    const result = v2.codec.encode(decodedSample);
                    expect(result).toStrictEqual(encodedSample);
                }),
            );
        });
    });

    describe("evolve", () => {
        it("should transform to the latest version", () => {
            return fc.assert(
                fc.property(v0.configuration, (v0Sample) => {
                    const storedConfiguration = withVersion(0)(v0Sample);
                    const expected: v2.Configuration & Versioned = {
                        _version: 2,
                        isEnabled: true,
                        fieldConfiguration: {
                            defaultUserFields:
                                storedConfiguration.defaultFields,
                            defaultCompanyFields:
                                storedConfiguration.defaultFields,
                        },
                    };

                    const result = evolve(v2.changelog)(storedConfiguration);
                    expect(result).toStrictEqual(E.right(expected));
                }),
            );
        });

        it("should leave already up-to-date values unchanged", () => {
            return fc.assert(
                fc.property(v2.configuration, (latestSample) => {
                    const storedConfiguration = withVersion(2)(latestSample);

                    const result = evolve(v2.changelog)(storedConfiguration);
                    expect(result).toStrictEqual(E.right(storedConfiguration));
                }),
            );
        });

        it("should skip already applied changes and still apply later ones", () => {
            return fc.assert(
                fc.property(v1.configuration, (v1Sample) => {
                    const storedConfiguration = withVersion(1)(v1Sample);
                    const expected: v2.Configuration & Versioned = {
                        _version: 2,
                        isEnabled: storedConfiguration.isEnabled,
                        fieldConfiguration: {
                            defaultUserFields:
                                storedConfiguration.defaultFields,
                            defaultCompanyFields:
                                storedConfiguration.defaultFields,
                        },
                    };

                    const result = evolve(v2.changelog)(storedConfiguration);
                    expect(result).toStrictEqual(E.right(expected));
                }),
            );
        });

        it("should initialize an unversioned value before applying migrations", () => {
            const result = evolve(v2.changelog, {
                initializeFromUnversioned,
            })({
                defaultFields,
            });

            expect(result).toStrictEqual(
                E.right({
                    _version: 2,
                    isEnabled: true,
                    fieldConfiguration: {
                        defaultUserFields: defaultFields,
                        defaultCompanyFields: defaultFields,
                    },
                }),
            );
        });

        it("should reject missing version if initialization is disabled", () => {
            expectLeftErrorCode(
                evolve(v2.changelog)({defaultFields}),
                "MISSING_VERSION_ERROR",
            );
        });

        it("should not invoke initializeFromUnversioned for versioned values", () => {
            const initializeSpy = jest.fn(initializeFromUnversioned);

            const result = evolve(v2.changelog, {
                initializeFromUnversioned: initializeSpy,
            })({
                _version: 1,
                defaultFields,
                isEnabled: false,
            });

            expectRight(result);
            expect(initializeSpy).not.toHaveBeenCalled();
        });

        it("should surface initialization failures", () => {
            const result = evolve(v2.changelog, {
                initializeFromUnversioned: () =>
                    E.left({
                        errorCode: "INVALID_STORED_VALUE_ERROR",
                        message: "Cannot initialize value.",
                    }),
            })({
                defaultFields,
            });

            expectLeftErrorCode(
                result,
                "INITIALIZE_FROM_UNVERSIONED_FAILED_ERROR",
            );
        });

        it("should reject invalid initialized values", () => {
            const result = evolve(v2.changelog, {
                initializeFromUnversioned: () =>
                    E.right(({
                        _version: 1,
                        defaultFields,
                    } as unknown) as StoredValueV0),
            })({
                defaultFields,
            });

            expectLeftErrorCode(
                result,
                "INITIALIZE_FROM_UNVERSIONED_RETURNED_INVALID_VALUE_ERROR",
            );
        });

        it("should reject unsupported future versions", () => {
            expectLeftErrorCode(
                evolve(v2.changelog)({
                    _version: 3,
                    defaultFields,
                }),
                "UNSUPPORTED_FUTURE_VERSION_ERROR",
            );
        });

        it("should fail if JSON patch description is invalid", () => {
            const storedConfiguration = {
                _version: 1,
                defaultFields,
                isEnabled: false,
            };

            const invalidChangelog = expectRight(
                createChangelog(
                    ...v1.changelog,
                    jsonPatchChangeset({
                        _version: 2,
                        patch: [
                            {
                                op: "copy",
                                path: "/nonExistingDestinationPath",
                                from: "/nonExistingSourcePath",
                            },
                        ],
                    }),
                ),
            );

            const result = evolve(invalidChangelog)(storedConfiguration);
            const error = expectLeftErrorCode(
                result,
                "JSON_PATCH_EVOLUTION_ERROR",
            );
            expect(error).toMatchObject({
                error: {
                    name: "OPERATION_FROM_UNRESOLVABLE",
                },
            });
        });

        it("should fail if immutability-helper spec is invalid", () => {
            const storedConfiguration = {
                _version: 1,
                defaultFields,
                isEnabled: false,
            };

            const invalidChangelog = expectRight(
                createChangelog(
                    ...v1.changelog,
                    immutabilityHelperChangeset({
                        _version: 2,
                        spec: {
                            nonExistingArray: {
                                $push: [1, 2, 3],
                            },
                        },
                    }),
                ),
            );

            const result = evolve(invalidChangelog)(storedConfiguration);
            expectLeftErrorCode(result, "IMMUTABILITY_HELPER_EVOLUTION_ERROR");
        });

        it("should reject a JSON patch changeset that produces a non-object value", () => {
            const storedConfiguration = {
                _version: 0,
                defaultFields,
            };
            const invalidChangelog = expectRight(
                createChangelog(
                    jsonPatchChangeset({
                        _version: 1,
                        patch: [
                            {
                                op: "replace",
                                path: "",
                                value: "not-an-object",
                            },
                        ],
                    }),
                ),
            );

            const result = evolve(invalidChangelog)(storedConfiguration);
            const error = expectLeftErrorCode(
                result,
                "INVALID_STORED_VALUE_ERROR",
            );
            expect(error.message).toContain(
                "Changeset version 1 did not produce an object",
            );
        });

        it("should reject an immutability-helper changeset that produces a non-object value", () => {
            const storedConfiguration = {
                _version: 0,
                defaultFields,
            };
            const invalidChangelog = expectRight(
                createChangelog(
                    immutabilityHelperChangeset({
                        _version: 1,
                        spec: {
                            $set: "not-an-object",
                        },
                    }),
                ),
            );

            const result = evolve(invalidChangelog)(storedConfiguration);
            const error = expectLeftErrorCode(
                result,
                "INVALID_STORED_VALUE_ERROR",
            );
            expect(error.message).toContain(
                "Changeset version 1 did not produce an object",
            );
        });

        it("should not mutate the original value when applying JSON patch changesets", () => {
            const storedConfiguration = {
                _version: 0,
                defaultFields,
            };
            const originalSnapshot = JSON.parse(
                JSON.stringify(storedConfiguration),
            ) as StoredValue;

            expectRight(evolve(v2.changelog)(storedConfiguration));
            expect(storedConfiguration).toStrictEqual(originalSnapshot);
        });

        it("should not mutate the original value when applying immutability-helper changesets", () => {
            const storedConfiguration = {
                _version: 0,
                defaultFields: ["name"],
            };
            const originalSnapshot = JSON.parse(
                JSON.stringify(storedConfiguration),
            ) as StoredValue;
            const helperChangelog = expectRight(
                createChangelog(
                    immutabilityHelperChangeset({
                        _version: 1,
                        spec: {
                            defaultFields: {
                                $push: ["company"],
                            },
                        },
                    }),
                ),
            );

            expectRight(evolve(helperChangelog)(storedConfiguration));
            expect(storedConfiguration).toStrictEqual(originalSnapshot);
        });

        it("should preserve the original value when a migration fails", () => {
            const storedConfiguration = {
                _version: 1,
                defaultFields,
                isEnabled: false,
            };
            const originalSnapshot = JSON.parse(
                JSON.stringify(storedConfiguration),
            ) as StoredValue;
            const invalidChangelog = expectRight(
                createChangelog(
                    ...v1.changelog,
                    jsonPatchChangeset({
                        _version: 2,
                        patch: [
                            {
                                op: "copy",
                                path: "/broken",
                                from: "/missing",
                            },
                        ],
                    }),
                ),
            );

            expectLeftErrorCode(
                evolve(invalidChangelog)(storedConfiguration),
                "JSON_PATCH_EVOLUTION_ERROR",
            );
            expect(storedConfiguration).toStrictEqual(originalSnapshot);
        });
    });
});
