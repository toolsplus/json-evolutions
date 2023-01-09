import {JsonPatchError} from "fast-json-patch";

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
    | JsonPatchEvolutionError
    | ImmutabilityHelperEvolutionError
    | UnexpectedEvolutionError;
