import {Effect, Schema} from "effect";
import {describe, expect, it} from "vitest";
import {
    EvolutionError,
    InvalidChangelog,
    InvalidStoredValue,
} from "../src/index.js";

describe("EvolutionError", () => {
    it.each([
        new InvalidStoredValue({
            message: "invalid stored value",
            cause: new Error("schema failure"),
        }),
        new InvalidChangelog({
            message: "invalid changelog",
            cause: {expected: 1, actual: 2},
        }),
    ])("encodes and decodes schema-backed tagged errors", async (error) => {
        const encoded = await Effect.runPromise(
            Schema.encodeUnknownEffect(EvolutionError)(error),
        );
        expect(encoded).toMatchObject({
            _tag: error._tag,
            message: error.message,
        });

        const decoded = await Effect.runPromise(
            Schema.decodeUnknownEffect(EvolutionError)(encoded),
        );
        expect(decoded).toMatchObject({
            _tag: error._tag,
            message: error.message,
        });
    });
});
