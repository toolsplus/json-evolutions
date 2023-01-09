import "@relmify/jest-fp-ts";
import * as fc from "fast-check";
import * as E from "fp-ts/Either";
import {pipe} from "fp-ts/function";
import * as v0 from "./__fixtures__/configuration/v0";
import * as v1 from "./__fixtures__/configuration/v1";
import * as v2 from "./__fixtures__/configuration/v2";
import {
    Changelog,
    evolve,
    immutabilityHelperChangeset,
    jsonPatchChangeset,
    latestVersion,
    Versioned,
} from "../../src";

const defaultFields = ["name", "id"];

const withVersion = (v: number) => <T>(t: T): T & Versioned => ({
    ...t,
    _version: v,
});

describe("Evolutions", () => {
    describe("getLatestVersion", () => {
        it("should define base version as 0", () => {
            expect(latestVersion([])).toBe(0);
        });

        it("should return the latest version", () => {
            expect(latestVersion(v2.changelog)).toBe(2);
        });

        it("should return the latest version from an unordered changelog", () => {
            return fc.assert(
                fc.property(
                    fc.shuffledSubarray(v2.changelog, {
                        minLength: v2.changelog.length,
                    }),
                    (shuffledChangelog) => {
                        expect(latestVersion(shuffledChangelog)).toBe(2);
                    },
                ),
            );
        });
    });

    describe("versioned codec", () => {
        it("check laws", () => {
            // Verify the following two laws (see: https://github.com/gcanti/io-ts/blob/master/Codec.md):
            //
            // pipe(codec.decode(u), E.fold(() => u, codec.encode) = u for all u in unknown
            // codec.decode(codec.encode(a)) = E.right(a) for all a in A
            //
            // Note that this test assumes that the tested codec is strict, i.e. it assumes the `_version` property
            // added during encoding is dropped when decoding the value.
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
                    ).toStrictEqualRight(decodedSample);
                }),
            );
        });

        it("should drop the version number when decoding a versioned record", () => {
            return fc.assert(
                fc.property(v2.configuration, (decodedSample) => {
                    const encodedSample = withVersion(2)(decodedSample);

                    const result = v2.codec.decode(encodedSample);
                    expect(result).toStrictEqualRight(decodedSample);
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
                    expect(result).toStrictEqualRight(expected);
                }),
            );
        });

        it("should transform to the latest version and skip already applied changes", () => {
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
                    expect(result).toStrictEqualRight(expected);
                }),
            );
        });

        it("should work if the changelog is out of order", () => {
            return fc.assert(
                fc.property(
                    v1.configuration,
                    fc.shuffledSubarray(v2.changelog, {
                        minLength: v2.changelog.length,
                    }),
                    (v1Sample, shuffledV2Changelog) => {
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

                        const result = evolve(shuffledV2Changelog)(
                            storedConfiguration,
                        );
                        expect(result).toStrictEqualRight(expected);
                    },
                ),
            );
        });

        it("should fail if JSON patch description is invalid", () => {
            const storedConfiguration: v1.Configuration & Versioned = {
                _version: 1,
                defaultFields,
                isEnabled: false,
            };

            const invalidChangelog: Changelog = [
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
            ];

            const result = evolve(invalidChangelog)(storedConfiguration);
            expect(result).toSubsetEqualLeft({
                errorCode: "JSON_PATCH_EVOLUTION_ERROR",
                error: {
                    name: "OPERATION_FROM_UNRESOLVABLE",
                },
            });
        });

        it("should fail if immutability-helper spec is invalid", () => {
            const storedConfiguration: v1.Configuration & Versioned = {
                _version: 1,
                defaultFields,
                isEnabled: false,
            };

            const invalidChangelog: Changelog = [
                ...v1.changelog,
                immutabilityHelperChangeset({
                    _version: 2,
                    spec: {
                        nonExistingArray: {
                            $push: [1, 2, 3],
                        },
                    },
                }),
            ];

            const result = evolve(invalidChangelog)(storedConfiguration);
            expect(result).toSubsetEqualLeft({
                errorCode: "IMMUTABILITY_HELPER_EVOLUTION_ERROR",
            });
        });
    });
});
