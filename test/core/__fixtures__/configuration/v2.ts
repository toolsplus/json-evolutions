import * as t from "io-ts";
import * as fc from "fast-check";
import * as v1 from "./v1";
import {
    latestVersion,
    versioned,
    Changeset,
    Changelog,
    jsonPatchChangeset,
} from "../../../../src";

const migrateDefaultFieldsToFieldConfiguration: Changeset = jsonPatchChangeset({
    _version: 2,
    patch: [
        {
            op: "add",
            path: "/fieldConfiguration",
            value: {
                defaultUserFields: [],
                defaultCompanyFields: [],
            },
        },
        {
            op: "copy",
            path: "/fieldConfiguration/defaultUserFields",
            from: "/defaultFields",
        },
        {
            op: "copy",
            path: "/fieldConfiguration/defaultCompanyFields",
            from: "/defaultFields",
        },
        {
            op: "remove",
            path: "/defaultFields",
        },
    ],
});

export const changelog: Changelog = [
    ...v1.changelog,
    migrateDefaultFieldsToFieldConfiguration,
];

export interface FieldConfiguration {
    defaultUserFields: string[];
    defaultCompanyFields: string[];
}

export interface Configuration {
    fieldConfiguration: FieldConfiguration;
    isEnabled: boolean;
}

const FieldConfiguration = t.type({
    defaultUserFields: t.array(t.string),
    defaultCompanyFields: t.array(t.string),
});

export const configuration = fc.record<Configuration>({
    fieldConfiguration: fc.record({
        defaultUserFields: fc.array(fc.string()),
        defaultCompanyFields: fc.array(fc.string()),
    }),
    isEnabled: fc.boolean(),
});

export const codec = versioned<Configuration>(
    t.strict({
        fieldConfiguration: FieldConfiguration,
        isEnabled: t.boolean,
    }),
    latestVersion(changelog),
);
