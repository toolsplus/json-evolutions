import {JsonPatchError} from "fast-json-patch";

export interface InvalidStoredValueError {
    errorCode: "INVALID_STORED_VALUE_ERROR";
    message: string;
}

export interface MissingVersionError {
    errorCode: "MISSING_VERSION_ERROR";
    message: string;
}

export interface InvalidVersionError {
    errorCode: "INVALID_VERSION_ERROR";
    message: string;
}

export interface UnsupportedFutureVersionError {
    errorCode: "UNSUPPORTED_FUTURE_VERSION_ERROR";
    message: string;
}

export interface InitializeFromUnversionedFailedError {
    errorCode: "INITIALIZE_FROM_UNVERSIONED_FAILED_ERROR";
    message: string;
    error?: EvolutionError;
}

export interface InitializeFromUnversionedReturnedInvalidValueError {
    errorCode: "INITIALIZE_FROM_UNVERSIONED_RETURNED_INVALID_VALUE_ERROR";
    message: string;
    error?: EvolutionError;
}

export interface InvalidChangelogError {
    errorCode: "INVALID_CHANGELOG_ERROR";
    message: string;
}

export interface DuplicateChangesetVersionError {
    errorCode: "DUPLICATE_CHANGESET_VERSION_ERROR";
    message: string;
}

export interface NonSequentialChangesetVersionError {
    errorCode: "NON_SEQUENTIAL_CHANGESET_VERSION_ERROR";
    message: string;
}

export interface JsonPatchEvolutionError {
    errorCode: "JSON_PATCH_EVOLUTION_ERROR";
    message: string;
    error?: JsonPatchError;
}
export interface ImmutabilityHelperEvolutionError {
    errorCode: "IMMUTABILITY_HELPER_EVOLUTION_ERROR";
    message: string;
    error?: Error;
}

export interface UnexpectedEvolutionError {
    errorCode: "UNEXPECTED_EVOLUTION_ERROR";
    message: string;
    error?: Error;
}

export type EvolutionError =
    | InvalidStoredValueError
    | MissingVersionError
    | InvalidVersionError
    | UnsupportedFutureVersionError
    | InitializeFromUnversionedFailedError
    | InitializeFromUnversionedReturnedInvalidValueError
    | InvalidChangelogError
    | DuplicateChangesetVersionError
    | NonSequentialChangesetVersionError
    | JsonPatchEvolutionError
    | ImmutabilityHelperEvolutionError
    | UnexpectedEvolutionError;
