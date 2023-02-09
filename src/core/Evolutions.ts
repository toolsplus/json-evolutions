import {Type} from "io-ts";
import update from "immutability-helper";
import {applyPatch, JsonPatchError} from "fast-json-patch";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as A from "fp-ts/Array";
import * as J from "fp-ts/Json";
import * as N from "fp-ts/number";
import * as Ord from "fp-ts/Ord";
import {flow, pipe} from "fp-ts/function";
import {EvolutionError, Changelog, Changeset, Versioned} from "../api";

/**
 * Base version is the first version of any versioned entity. If a changelog is empty the entity's version value
 * is the base version.
 */
export const BASE_VERSION = 0;

export type VersionedJsonObject = J.JsonRecord & Versioned;

const changesetReducer = <T>(
    target: E.Either<EvolutionError, T>,
    changeset: Changeset,
): E.Either<EvolutionError, T> => {
    const applyChangeset = (cs: Changeset) => (
        t: T,
    ): E.Either<EvolutionError, T> => {
        switch (cs.type) {
            case "JSON_PATCH_CHANGESET":
                return E.tryCatch(
                    () => applyPatch(t, cs.patch, true).newDocument,
                    (e) =>
                        e instanceof JsonPatchError
                            ? {
                                  errorCode: "JSON_PATCH_EVOLUTION_ERROR",
                                  message: `Failed to apply JSON patch changeset with version ${cs._version}: ${e.message}`,
                                  error: e,
                              }
                            : {
                                  errorCode: "UNEXPECTED_EVOLUTION_ERROR",
                                  message: `Unexpected JSON patch error: ${e}`,
                              },
                );
            case "IMMUTABILITY_HELPER_CHANGESET":
                return E.tryCatch(
                    () => update(t, cs.spec),
                    (e) =>
                        e instanceof Error
                            ? {
                                  errorCode:
                                      "IMMUTABILITY_HELPER_EVOLUTION_ERROR",
                                  message: `Failed to apply Immutability helper changeset with version ${cs._version}: ${e.message}`,
                                  error: e,
                              }
                            : {
                                  errorCode: "UNEXPECTED_EVOLUTION_ERROR",
                                  message: `Unexpected immutability-helper error: ${e}`,
                              },
                );
        }
    };
    return pipe(target, E.chain(applyChangeset(changeset)));
};

/**
 * Sorts the given changelog in ascending order.
 *
 * @param changelog Changelog to sort
 * @returns Changelog sorted in ascending order.
 */
const changelogSortedByVersion = (changelog: Changelog): Changelog => {
    const byVersion = Ord.Contravariant.contramap(
        N.Ord,
        (cs: Changeset) => cs._version,
    );
    return A.sortBy([byVersion])(changelog);
};

/**
 * Returns the latest entity version based on the given changelog.
 *
 * @param changelog Changelog for which to determine the version
 * @returns Latest entity version based on the changelog entries or the base version if changelog is empty.
 */
export const latestVersion = (changelog: Changelog): number =>
    pipe(
        A.last(changelogSortedByVersion(changelog)),
        O.map((cs) => cs._version),
        O.getOrElse(() => BASE_VERSION),
    );

/**
 * Evolves the given `target` JSON value by sequentially applying the changesets in
 * the given changelog.
 *
 * The changelog will be sorted by `_version` number and already applied changesets will be
 * removed from the changelog before it is applied.
 *
 * @param target JSON value to withPropertyKey transformations to
 * @param changelog Sequence of changesets that describe the transformations
 * @returns JSON value with all transformations applied or an error if the transformation fails.
 */
export const evolve = <T extends Versioned>(changelog: Changelog) => (
    target: T,
): E.Either<EvolutionError, T> => {
    const baseVersion = target._version;
    const extractPendingChangesets = (cl: Changelog): Changeset[] =>
        pipe(
            cl,
            A.reverse,
            A.takeLeftWhile((cs: Changeset) => cs._version > baseVersion),
            A.reverse,
        );

    const applyChangesets = (t: T) => (cs: Changeset[]) =>
        pipe(cs, A.reduce(E.right<EvolutionError, T>(t), changesetReducer));

    const applyLatestVersion = flow(
        E.map<T, T>((result) => ({
            ...result,
            _version: latestVersion(changelog),
        })),
    );

    return pipe(
        changelog,
        changelogSortedByVersion,
        extractPendingChangesets,
        applyChangesets(target),
        applyLatestVersion,
    );
};

/**
 * io-ts combinator that encodes any non-primitive type A using the given codec and includes a `_version` property
 * indicating the current version of A. To ensure the `_version` property is stripped when decoding the data to
 * type A, the given codec should be strict and A should not declare a `_version` property.
 *
 * @see https://gcanti.github.io/io-ts/modules/index.ts.html#strict
 *
 * @param codec Codec for the non-primitive type A
 * @param version Version number to include when encoding A to its output type O
 */
export const versioned = <A extends object, O extends object = A, I = unknown>(
    codec: Type<A, O, I>,
    version: number,
): Type<A, O & Versioned, I> => {
    return new Type<A, O & Versioned, I>(
        `Versioned<${codec.name}>`,
        codec.is,
        codec.validate,
        (a) => ({...codec.encode(a), _version: version}),
    );
};
