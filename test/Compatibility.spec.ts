import {Effect} from "effect";
import {describe, expect, it} from "vitest";
import {evolveAndDecode} from "../src/index.js";
import {
    StoredConfiguration,
    expectedFromV0,
    expectedFromV1,
    storedV0,
    storedV1,
} from "./fixtures/configuration.js";

describe("stored-value protocol compatibility", () => {
    it("evolves the existing version 0 fixture", async () => {
        await expect(
            Effect.runPromise(evolveAndDecode(StoredConfiguration)(storedV0)),
        ).resolves.toEqual(expectedFromV0);
    });

    it("evolves the existing version 1 fixture", async () => {
        await expect(
            Effect.runPromise(evolveAndDecode(StoredConfiguration)(storedV1)),
        ).resolves.toEqual(expectedFromV1);
    });
});
