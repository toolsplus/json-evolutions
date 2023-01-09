import {Operation} from "fast-json-patch";
import {Spec} from "immutability-helper";

/**
 * Versioned interface requires a `_version` attribute on any implementing subtype.
 *
 * Note that the version attribute starts with an underscore to minimize conflicts with versioned data that
 * may include a `version` property.
 */
export interface Versioned {
    readonly _version: number;
}

interface JsonPatchChangesetProps extends Versioned {
    readonly patch: Operation[];
}

/**
 * A changeset described as a Json Patch.
 *
 * @see https://github.com/Starcounter-Jack/JSON-Patch
 */
export interface JsonPatchChangeset extends JsonPatchChangesetProps {
    readonly type: "JSON_PATCH_CHANGESET";
}

/**
 * Json Patch changeset constructor.
 *
 * @param props Json Patch instance properties
 */
export const jsonPatchChangeset = (
    props: JsonPatchChangesetProps,
): JsonPatchChangeset => ({
    ...props,
    type: "JSON_PATCH_CHANGESET",
});

interface ImmutabilityHelperChangesetProps extends Versioned {
    readonly spec: Spec<any>;
}

/**
 * A changeset described as a Immutability Helper Spec.
 *
 * @see https://github.com/kolodny/immutability-helper
 */
export interface ImmutabilityHelperChangeset
    extends ImmutabilityHelperChangesetProps {
    readonly type: "IMMUTABILITY_HELPER_CHANGESET";
}

/**
 * Immutability helper changeset constructor.
 *
 * @param props Immutability helper instance properties
 */
export const immutabilityHelperChangeset = (
    props: ImmutabilityHelperChangesetProps,
): ImmutabilityHelperChangeset => ({
    ...props,
    type: "IMMUTABILITY_HELPER_CHANGESET",
});

export type Changeset = JsonPatchChangeset | ImmutabilityHelperChangeset;

export type Changelog = Changeset[];
