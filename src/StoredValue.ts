import {Schema} from "effect";

/** A recursively JSON-compatible value. */
export type JsonValue =
    string | number | boolean | null | ReadonlyArray<JsonValue> | JsonObject;

/** A recursively JSON-compatible object. */
export interface JsonObject {
    readonly [key: string]: JsonValue;
}

/** A strict JSON root object that does not yet carry a version marker. */
export type UnversionedJsonObject = JsonObject & {
    readonly _version?: never;
};

/** A strict JSON root object carrying a valid representation version. */
export interface StoredValue extends JsonObject {
    readonly _version: number;
}

/** A stored value at the base representation version. */
export interface StoredValueV0 extends StoredValue {
    readonly _version: 0;
}

const hasOnlyArrayIndexes = (value: ReadonlyArray<unknown>): boolean => {
    const keys = Object.keys(value);
    if (keys.length !== value.length) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        if (keys[index] !== String(index)) {
            return false;
        }
    }
    return Reflect.ownKeys(value).every(
        (key) => key === "length" || keys.includes(String(key)),
    );
};

const isJsonValueAt = (value: unknown, ancestors: Set<object>): boolean => {
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean"
    ) {
        return true;
    }
    if (typeof value === "number") {
        return Number.isFinite(value);
    }
    if (typeof value !== "object" || ancestors.has(value)) {
        return false;
    }

    ancestors.add(value);
    let valid: boolean;
    if (Array.isArray(value)) {
        valid =
            Object.getPrototypeOf(value) === Array.prototype &&
            hasOnlyArrayIndexes(value) &&
            value.every((item) => isJsonValueAt(item, ancestors));
    } else {
        const prototype = Reflect.getPrototypeOf(value);
        const keys = Object.keys(value);
        valid =
            (prototype === Object.prototype || prototype === null) &&
            Reflect.ownKeys(value).length === keys.length &&
            keys.every((key) => {
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                const propertyValue = (
                    descriptor as {readonly value?: unknown} | undefined
                )?.value;
                return (
                    descriptor !== undefined &&
                    "value" in descriptor &&
                    descriptor.enumerable &&
                    isJsonValueAt(propertyValue, ancestors)
                );
            });
    }
    ancestors.delete(value);
    return valid;
};

/** Returns whether a value is recursively compatible with JSON. */
export const isJsonValue = (value: unknown): value is JsonValue =>
    isJsonValueAt(value, new Set());

/** Returns whether a value is a strict JSON root object. */
export const isJsonObject = (value: unknown): value is JsonObject =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isJsonValue(value);

/** Returns whether an input is eligible for unversioned initialization. */
export const isUnversionedJsonObject = (
    value: unknown,
): value is UnversionedJsonObject =>
    isJsonObject(value) && !Object.hasOwn(value, "_version");

const isValidVersion = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Runtime schema for strict JSON stored values. */
export const StoredValue = Schema.declare<StoredValue>(
    (input): input is StoredValue =>
        isJsonObject(input) &&
        Object.hasOwn(input, "_version") &&
        isValidVersion(input._version),
    {identifier: "StoredValue"},
);

/** Runtime schema for strict JSON stored values at base version 0. */
export const StoredValueV0 = Schema.declare<StoredValueV0>(
    (input): input is StoredValueV0 =>
        isJsonObject(input) &&
        Object.hasOwn(input, "_version") &&
        input._version === 0,
    {identifier: "StoredValueV0"},
);
