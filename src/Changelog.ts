import {Result, Schema} from "effect";
import {
    Changeset,
    type Changeset as ChangesetType,
    type JsonPatchOperation,
} from "./Changeset.js";
import {InvalidChangelog} from "./EvolutionError.js";

declare const validChangelogBrand: unique symbol;

/** A changelog that has passed construction-time validation. */
export type ValidChangelog = ReadonlyArray<ChangesetType> & {
    readonly [validChangelogBrand]: true;
};

const invalid = (message: string, cause: unknown): InvalidChangelog =>
    new InvalidChangelog({message, cause});

const ownsRootVersionMarker = (pointer: string): boolean =>
    pointer === "" ||
    (pointer.startsWith("/") &&
        pointer.slice(1).split("/", 1)[0] === "_version");

const violatesMarkerOwnership = (operation: JsonPatchOperation): boolean =>
    ownsRootVersionMarker(operation.path) ||
    ((operation.op === "move" || operation.op === "copy") &&
        ownsRootVersionMarker(operation.from));

/** Constructs a sorted, shallow-frozen, validated changelog. */
export const createChangelog = (
    ...changesets: ReadonlyArray<ChangesetType>
): Result.Result<ValidChangelog, InvalidChangelog> => {
    const decoded: Array<ChangesetType> = [];
    for (const candidate of changesets) {
        const result = Schema.decodeUnknownResult(Changeset)(candidate);
        if (Result.isFailure(result)) {
            return Result.fail(
                invalid(
                    "A changeset has an invalid discriminator or envelope.",
                    result.failure,
                ),
            );
        }
        decoded.push(result.success);
    }

    const normalized = decoded.sort(
        (left, right) => left._version - right._version,
    );
    for (let index = 0; index < normalized.length; index += 1) {
        const changeset = normalized[index];
        const expectedVersion = index + 1;
        if (
            !Number.isSafeInteger(changeset._version) ||
            changeset._version <= 0
        ) {
            return Result.fail(
                invalid(
                    "Changeset target versions must be positive safe integers.",
                    changeset._version,
                ),
            );
        }
        if (changeset._version !== expectedVersion) {
            return Result.fail(
                invalid(
                    `Expected changeset target version ${expectedVersion} but found ${changeset._version}.`,
                    changeset._version,
                ),
            );
        }
        if (
            changeset.type === "JSON_PATCH_CHANGESET" &&
            changeset.patch.some(violatesMarkerOwnership)
        ) {
            return Result.fail(
                invalid(
                    `JSON Patch changeset ${changeset._version} targets the reserved root _version marker.`,
                    changeset.patch,
                ),
            );
        }
    }

    return Result.succeed(
        Object.freeze(normalized) as unknown as ValidChangelog,
    );
};

/** Returns the latest representation version described by a changelog. */
export const latestVersion = (changelog: ValidChangelog): number =>
    changelog.length === 0 ? 0 : changelog[changelog.length - 1]._version;
