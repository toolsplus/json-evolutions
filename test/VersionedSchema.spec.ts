import {Effect, Result, Schema} from "effect";
import * as fc from "fast-check";
import {describe, expect, expectTypeOf, it} from "vitest";
import {
    createChangelog,
    evolveAndDecode,
    jsonPatchChangeset,
    versioned,
} from "../src/index.js";

describe("versioned", () => {
    it("injects the latest version while encoding and removes it while decoding", async () => {
        const changelog = Result.getOrThrow(createChangelog());
        const Business = Schema.Struct({
            enabled: Schema.Boolean,
            label: Schema.Literal("configuration"),
        });
        const StoredBusiness = Business.pipe(versioned(changelog));

        const encoded = await Effect.runPromise(
            Schema.encodeUnknownEffect(StoredBusiness)({
                enabled: true,
                label: "configuration",
            }),
        );

        expect(encoded).toEqual({
            enabled: true,
            label: "configuration",
            _version: 0,
        });
        await expect(
            Effect.runPromise(
                Schema.decodeUnknownEffect(StoredBusiness)(encoded),
            ),
        ).resolves.toEqual({enabled: true, label: "configuration"});
        type ExpectedStoredBusiness = {
            readonly enabled: boolean;
            readonly label: "configuration";
            readonly _version: number;
        };
        type ActualStoredBusiness = Schema.Codec.Encoded<typeof StoredBusiness>;
        expectTypeOf<ActualStoredBusiness>().toMatchTypeOf<ExpectedStoredBusiness>();
        expectTypeOf<ExpectedStoredBusiness>().toMatchTypeOf<ActualStoredBusiness>();
    });

    it("requires the exact latest version while decoding", async () => {
        const changelog = Result.getOrThrow(
            createChangelog(
                jsonPatchChangeset({_version: 1, patch: []}),
                jsonPatchChangeset({_version: 2, patch: []}),
            ),
        );
        const Business = Schema.Struct({enabled: Schema.Boolean});
        const StoredBusiness = Business.pipe(versioned(changelog));

        for (const input of [
            {enabled: true},
            {enabled: true, _version: 0},
            {enabled: true, _version: 1},
            {enabled: true, _version: 3},
            {enabled: true, _version: "2"},
        ]) {
            await expect(
                Effect.runPromise(
                    Schema.decodeUnknownEffect(StoredBusiness)(input),
                ),
            ).rejects.toBeDefined();
        }
    });

    it("rejects a business struct that owns the marker at runtime", () => {
        const changelog = Result.getOrThrow(createChangelog());
        expect(() =>
            versioned(changelog)(
                Schema.Struct({_version: Schema.Number}) as never,
            ),
        ).toThrow(/reserved root _version/);
    });

    it("round-trips generated business values", async () => {
        const Business = Schema.Struct({
            enabled: Schema.Boolean,
            count: Schema.Number,
            label: Schema.String,
        });
        const StoredBusiness = Business.pipe(
            versioned(Result.getOrThrow(createChangelog())),
        );

        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    enabled: fc.boolean(),
                    count: fc.float({noNaN: true, noDefaultInfinity: true}),
                    label: fc.string(),
                }),
                async (business) => {
                    const encoded = await Effect.runPromise(
                        Schema.encodeUnknownEffect(StoredBusiness)(business),
                    );
                    await expect(
                        Effect.runPromise(
                            Schema.decodeUnknownEffect(StoredBusiness)(encoded),
                        ),
                    ).resolves.toEqual(business);
                },
            ),
        );
    });
});

describe("evolveAndDecode", () => {
    it("uses the schema's retained changelog and returns the application value", async () => {
        const changelog = Result.getOrThrow(
            createChangelog(
                jsonPatchChangeset({
                    _version: 1,
                    patch: [{op: "add", path: "/enabled", value: true}],
                }),
            ),
        );
        const Business = Schema.Struct({enabled: Schema.Boolean});
        const StoredBusiness = Business.pipe(versioned(changelog));

        await expect(
            Effect.runPromise(evolveAndDecode(StoredBusiness)({_version: 0})),
        ).resolves.toEqual({enabled: true});
    });

    it("preserves schema failures and evolution failures", async () => {
        const changelog = Result.getOrThrow(
            createChangelog(jsonPatchChangeset({_version: 1, patch: []})),
        );
        const StoredBusiness = Schema.Struct({enabled: Schema.Boolean}).pipe(
            versioned(changelog),
        );

        const schemaFailure = await Effect.runPromise(
            Effect.flip(
                evolveAndDecode(StoredBusiness)({
                    _version: 1,
                    enabled: "yes",
                }),
            ),
        );
        expect(Schema.isSchemaError(schemaFailure)).toBe(true);

        const evolutionFailure = await Effect.runPromise(
            Effect.flip(evolveAndDecode(StoredBusiness)({_version: 2})),
        );
        expect(evolutionFailure).toMatchObject({
            _tag: "UnsupportedFutureVersion",
        });
    });
});
