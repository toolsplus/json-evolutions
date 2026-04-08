import * as t from "io-ts";
import * as fc from "fast-check";
import * as E from "fp-ts/Either";
import {pipe} from "fp-ts/function";
import * as v0 from "./v0";
import {
    createChangelog,
    latestVersion,
    versioned,
    JsonPatchChangeset,
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

export const changelog = pipe(
    createChangelog(...v0.changelog, addIsEnabledField),
    E.getOrElseW((error) => {
        throw new Error(error.message);
    }),
);

export interface Configuration {
    defaultFields: string[];
    isEnabled: boolean;
}

export const configuration = fc.record<Configuration>({
    defaultFields: fc.array(fc.string()),
    isEnabled: fc.boolean(),
});

export const codec = versioned<Configuration>(
    t.strict({
        defaultFields: t.array(t.string),
        isEnabled: t.boolean,
    }),
    latestVersion(changelog),
);
