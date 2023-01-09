import * as t from "io-ts";
import * as fc from "fast-check";
import * as v0 from "./v0";
import {
    latestVersion,
    versioned,
    VersionedJsonObject,
    JsonPatchChangeset,
    Changelog,
    jsonPatchChangeset,
} from "../../../../src";

const addIsEnabledField: JsonPatchChangeset = jsonPatchChangeset({
    _version: 1,
    patch: [
        {
            op: "add",
            path: "/isEnabled",
            value: true,
        },
    ],
});

export const changelog: Changelog = [...v0.changelog, addIsEnabledField];

export interface Configuration {
    defaultFields: string[];
    isEnabled: boolean;
}

export const configuration = fc.record<Configuration>({
    defaultFields: fc.array(fc.string()),
    isEnabled: fc.boolean(),
});

export const codec: t.Type<Configuration, VersionedJsonObject> = versioned(
    t.strict({
        defaultFields: t.array(t.string),
        isEnabled: t.boolean,
    }),
    latestVersion(changelog),
);
