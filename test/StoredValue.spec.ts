import {Result, Schema} from "effect";
import * as fc from "fast-check";
import {describe, expect, it} from "vitest";
import {StoredValue, StoredValueV0} from "../src/index.js";

const decodes = (
    schema: typeof StoredValue | typeof StoredValueV0,
    input: unknown,
): boolean => Result.isSuccess(Schema.decodeUnknownResult(schema)(input));

describe("StoredValue", () => {
    it("accepts recursively JSON-compatible root objects", () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.string(), fc.jsonValue()),
                fc.integer({min: 0, max: Number.MAX_SAFE_INTEGER}),
                (fields, version) => {
                    expect(
                        decodes(StoredValue, {...fields, _version: version}),
                    ).toBe(true);
                },
            ),
        );
    });

    it.each([[null], [true], [1], ["value"], [[]], [["value"]]])(
        "rejects a non-object root: %j",
        (input) => {
            expect(decodes(StoredValue, input)).toBe(false);
        },
    );

    it.each([
        {},
        {_version: -1},
        {_version: 1.5},
        {_version: Number.MAX_SAFE_INTEGER + 1},
        {_version: "1"},
        {_version: Number.NaN},
        {_version: Number.POSITIVE_INFINITY},
    ])("rejects a missing or invalid marker: %j", (input) => {
        expect(decodes(StoredValue, input)).toBe(false);
    });

    it.each([
        () => undefined,
        undefined,
        Symbol("value"),
        1n,
        new Date(0),
        new Map(),
        new Set(),
        Number.NaN,
        Number.NEGATIVE_INFINITY,
    ])("rejects a non-JSON nested value", (invalid) => {
        expect(decodes(StoredValue, {_version: 0, nested: invalid})).toBe(
            false,
        );
        expect(decodes(StoredValue, {_version: 0, nested: [invalid]})).toBe(
            false,
        );
    });

    it("rejects cyclic values", () => {
        const cyclic: Record<string, unknown> = {_version: 0};
        cyclic.self = cyclic;
        expect(decodes(StoredValue, cyclic)).toBe(false);
    });

    it("rejects sparse arrays and arrays with non-index properties", () => {
        const sparse = new Array(1);
        const extended = [true] as Array<unknown> & {extra?: unknown};
        extended.extra = true;
        expect(decodes(StoredValue, {_version: 0, nested: sparse})).toBe(false);
        expect(decodes(StoredValue, {_version: 0, nested: extended})).toBe(
            false,
        );
    });

    it("accepts exactly base version 0 through StoredValueV0", () => {
        expect(decodes(StoredValueV0, {_version: 0, value: true})).toBe(true);
        expect(decodes(StoredValueV0, {_version: 1, value: true})).toBe(false);
    });
});
