import {Result} from "effect";
import {describe, expect, it} from "vitest";
import {
    type Changeset,
    createChangelog,
    immutabilityHelperChangeset,
    jsonPatchChangeset,
    latestVersion,
} from "../src/index.js";

const getSuccess = <A>(result: Result.Result<A, unknown>): A =>
    Result.getOrThrow(result);

const expectInvalid = (changesets: ReadonlyArray<unknown>) => {
    const result = createChangelog(...(changesets as ReadonlyArray<Changeset>));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe("InvalidChangelog");
        return result.failure;
    }
    throw new Error("Expected InvalidChangelog");
};

describe("createChangelog", () => {
    it("uses base version 0 for an empty changelog", () => {
        expect(latestVersion(getSuccess(createChangelog()))).toBe(0);
    });

    it("sorts a copy and shallow-freezes the normalized changelog", () => {
        const patch = [{op: "add" as const, path: "/enabled", value: true}];
        const second = jsonPatchChangeset({_version: 2, patch});
        const first = jsonPatchChangeset({_version: 1, patch: []});
        const input = [second, first];

        const changelog = getSuccess(createChangelog(...input));

        expect(changelog.map((changeset) => changeset._version)).toEqual([
            1, 2,
        ]);
        expect(input).toEqual([second, first]);
        expect(Object.isFrozen(changelog)).toBe(true);
        expect(Object.isFrozen(patch)).toBe(false);
    });

    it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
        "rejects invalid target version %s",
        (version) => {
            expectInvalid([jsonPatchChangeset({_version: version, patch: []})]);
        },
    );

    it("rejects duplicate and missing versions", () => {
        expectInvalid([
            jsonPatchChangeset({_version: 1, patch: []}),
            jsonPatchChangeset({_version: 1, patch: []}),
        ]);
        expectInvalid([jsonPatchChangeset({_version: 2, patch: []})]);
    });

    it("rejects invalid discriminators and envelopes", () => {
        expectInvalid([{type: "UNKNOWN", _version: 1}]);
        expectInvalid([
            {type: "JSON_PATCH_CHANGESET", _version: 1, patch: "invalid"},
        ]);
        expectInvalid([
            {type: "IMMUTABILITY_HELPER_CHANGESET", _version: 1, spec: null},
        ]);
    });

    it("accepts every RFC 6902 operation and rejects _get", () => {
        const operations = [
            {op: "add" as const, path: "/a", value: 1},
            {op: "remove" as const, path: "/a"},
            {op: "replace" as const, path: "/a", value: 2},
            {op: "move" as const, from: "/a", path: "/b"},
            {op: "copy" as const, from: "/b", path: "/c"},
            {op: "test" as const, path: "/c", value: 2},
        ];
        expect(
            Result.isSuccess(
                createChangelog(
                    jsonPatchChangeset({_version: 1, patch: operations}),
                ),
            ),
        ).toBe(true);
        expectInvalid([
            {
                type: "JSON_PATCH_CHANGESET",
                _version: 1,
                patch: [{op: "_get", path: "/a"}],
            },
        ]);
    });

    it.each([
        {op: "replace", path: "", value: {_version: 2}},
        {op: "move", from: "", path: "/other"},
        {op: "add", path: "/_version", value: 2},
        {op: "remove", path: "/_version/nested"},
        {op: "replace", path: "/_version", value: 2},
        {op: "move", from: "/_version", path: "/other"},
        {op: "copy", from: "/_version/nested", path: "/other"},
        {op: "test", path: "/_version", value: 0},
    ])("rejects root marker ownership violations: %j", (operation) => {
        expectInvalid([
            {
                type: "JSON_PATCH_CHANGESET",
                _version: 1,
                patch: [operation],
            },
        ]);
    });

    it("allows nested business properties named _version", () => {
        const result = createChangelog(
            jsonPatchChangeset({
                _version: 1,
                patch: [
                    {
                        op: "add",
                        path: "/settings/_version",
                        value: 1,
                    },
                ],
            }),
        );
        expect(Result.isSuccess(result)).toBe(true);
    });

    it("accepts opaque immutability-helper object and function specs", () => {
        expect(
            Result.isSuccess(
                createChangelog(
                    immutabilityHelperChangeset({
                        _version: 1,
                        spec: {$merge: {enabled: true}},
                    }),
                ),
            ),
        ).toBe(true);
        expect(
            Result.isSuccess(
                createChangelog(
                    immutabilityHelperChangeset({
                        _version: 1,
                        spec: (() => undefined) as never,
                    }),
                ),
            ),
        ).toBe(true);
    });
});
