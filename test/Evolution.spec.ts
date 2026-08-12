import {Effect, Result} from "effect";
import {describe, expect, it, vi} from "vitest";
import {
    type Changeset,
    createChangelog,
    evolve,
    immutabilityHelperChangeset,
    jsonPatchChangeset,
    type StoredValueV0,
    type StoredValue,
} from "../src/index.js";

const getChangelog = (...changesets: ReadonlyArray<Changeset>) =>
    Result.getOrThrow(createChangelog(...changesets));

const runFailure = <E>(effect: Effect.Effect<unknown, E>) =>
    Effect.runPromise(Effect.flip(effect));

describe("evolve", () => {
    it("evolves every pending changeset, stamps each step, and preserves the input", async () => {
        let observedVersion: unknown;
        const changelog = getChangelog(
            jsonPatchChangeset({
                _version: 1,
                patch: [{op: "add", path: "/enabled", value: true}],
            }),
            immutabilityHelperChangeset({
                _version: 2,
                spec: {
                    $apply: (value: StoredValue) => {
                        observedVersion = value._version;
                        return {...value, label: "current"};
                    },
                },
            }),
        );
        const input = {_version: 0, name: "example"};

        await expect(
            Effect.runPromise(evolve(changelog)(input)),
        ).resolves.toEqual({
            _version: 2,
            name: "example",
            enabled: true,
            label: "current",
        });
        expect(observedVersion).toBe(1);
        expect(input).toEqual({_version: 0, name: "example"});
    });

    it("skips applied changesets and does not execute delegates for current values", async () => {
        const currentDelegate = vi.fn((value: StoredValue) => value);
        const changelog = getChangelog(
            jsonPatchChangeset({_version: 1, patch: []}),
            immutabilityHelperChangeset({
                _version: 2,
                spec: currentDelegate,
            }),
        );

        await expect(
            Effect.runPromise(evolve(changelog)({_version: 1, value: true})),
        ).resolves.toEqual({_version: 2, value: true});
        expect(currentDelegate).toHaveBeenCalledTimes(1);
        currentDelegate.mockClear();
        const current = {_version: 2, value: true};
        await expect(
            Effect.runPromise(evolve(changelog)(current)),
        ).resolves.toBe(current);
        expect(currentDelegate).not.toHaveBeenCalled();
    });

    it("rejects strictly invalid and future stored values", async () => {
        const changelog = getChangelog(
            jsonPatchChangeset({_version: 1, patch: []}),
        );
        await expect(
            runFailure(evolve(changelog)({_version: 1, value: undefined})),
        ).resolves.toMatchObject({_tag: "InvalidStoredValue"});
        await expect(
            runFailure(evolve(changelog)({_version: 2})),
        ).resolves.toMatchObject({
            _tag: "UnsupportedFutureVersion",
            version: 2,
            latestVersion: 1,
        });
    });

    it("maps adapter failures to their tagged error", async () => {
        const badPatch = getChangelog(
            jsonPatchChangeset({
                _version: 1,
                patch: [{op: "remove", path: "/missing"}],
            }),
        );
        await expect(
            runFailure(evolve(badPatch)({_version: 0})),
        ).resolves.toMatchObject({_tag: "JsonPatchEvolutionError", version: 1});

        const badHelper = getChangelog(
            immutabilityHelperChangeset({
                _version: 1,
                spec: {$unknown: true} as never,
            }),
        );
        await expect(
            runFailure(evolve(badHelper)({_version: 0})),
        ).resolves.toMatchObject({
            _tag: "ImmutabilityHelperEvolutionError",
            version: 1,
        });
    });

    it.each([
        {$set: null},
        {$apply: () => ({_version: 0, invalid: new Date(0)})},
        {$apply: () => ({_version: 7})},
        {$apply: () => ({value: true})},
    ])("rejects invalid delegate output", async (spec) => {
        const changelog = getChangelog(
            immutabilityHelperChangeset({_version: 1, spec: spec as never}),
        );
        await expect(
            runFailure(evolve(changelog)({_version: 0})),
        ).resolves.toMatchObject({_tag: "InvalidStoredValue"});
    });

    it("fails without exposing a partial value", async () => {
        const input = {_version: 0, value: "original"};
        const changelog = getChangelog(
            jsonPatchChangeset({
                _version: 1,
                patch: [{op: "replace", path: "/value", value: "changed"}],
            }),
            jsonPatchChangeset({
                _version: 2,
                patch: [{op: "remove", path: "/missing"}],
            }),
        );

        const failure = await runFailure(evolve(changelog)(input));
        expect(failure).toMatchObject({_tag: "JsonPatchEvolutionError"});
        expect(failure).not.toHaveProperty("value");
        expect(input).toEqual({_version: 0, value: "original"});
    });

    it("isolates the original input from mutating helper callbacks", async () => {
        const input = {_version: 0, nested: {changed: false}};
        const changelog = getChangelog(
            immutabilityHelperChangeset({
                _version: 1,
                spec: {
                    $apply: (value: StoredValue) => {
                        (value.nested as {changed: boolean}).changed = true;
                        return value;
                    },
                },
            }),
        );

        await expect(
            Effect.runPromise(evolve(changelog)(input)),
        ).resolves.toEqual({
            _version: 1,
            nested: {changed: true},
        });
        expect(input).toEqual({_version: 0, nested: {changed: false}});
    });

    it("initializes only strict unversioned JSON objects", async () => {
        const initializer = vi.fn((input: Record<string, unknown>) =>
            Effect.succeed({...input, _version: 0} as StoredValueV0),
        );
        const changelog = getChangelog(
            jsonPatchChangeset({_version: 1, patch: []}),
        );

        await expect(
            Effect.runPromise(
                evolve(changelog, {initializeFromUnversioned: initializer})({
                    value: true,
                }),
            ),
        ).resolves.toEqual({_version: 1, value: true});
        expect(initializer).toHaveBeenCalledTimes(1);

        for (const input of [
            null,
            [],
            "value",
            {value: undefined},
            {_version: -1},
            {_version: 2},
        ]) {
            await runFailure(
                evolve(changelog, {initializeFromUnversioned: initializer})(
                    input,
                ),
            );
        }
        expect(initializer).toHaveBeenCalledTimes(1);
    });

    it("keeps initializer typed failure, invalid success, and defect distinct", async () => {
        const changelog = getChangelog();
        await expect(
            runFailure(
                evolve(changelog, {
                    initializeFromUnversioned: () =>
                        Effect.fail("not supported"),
                })({value: true}),
            ),
        ).resolves.toMatchObject({
            _tag: "InitializeFromUnversionedFailed",
            cause: "not supported",
        });
        await expect(
            runFailure(
                evolve(changelog, {
                    initializeFromUnversioned: () =>
                        Effect.succeed({_version: 1} as never),
                })({value: true}),
            ),
        ).resolves.toMatchObject({
            _tag: "InitializeFromUnversionedReturnedInvalidValue",
        });

        const defect = new Error("initializer defect");
        await expect(
            Effect.runPromise(
                evolve(changelog, {
                    initializeFromUnversioned: () => Effect.die(defect),
                })({value: true}),
            ),
        ).rejects.toBe(defect);
    });

    it("suspends initializer invocation and isolates its input", async () => {
        const changelog = getChangelog();
        const input = {nested: {changed: false}};
        const defect = new Error("initializer threw");
        const makeProgram = () =>
            evolve(changelog, {
                initializeFromUnversioned: (value) => {
                    (value.nested as {changed: boolean}).changed = true;
                    throw defect;
                },
            })(input);

        expect(makeProgram).not.toThrow();
        expect(input).toEqual({nested: {changed: false}});
        await expect(Effect.runPromise(makeProgram())).rejects.toBe(defect);
        expect(input).toEqual({nested: {changed: false}});
    });
});
