import {Result, Schema} from "effect";
import {
    createChangelog,
    jsonPatchChangeset,
    versioned,
} from "../../src/index.js";

export const changelog = Result.getOrThrow(
    createChangelog(
        jsonPatchChangeset({
            _version: 1,
            patch: [{op: "add", path: "/isEnabled", value: true}],
        }),
        jsonPatchChangeset({
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
                {op: "remove", path: "/defaultFields"},
            ],
        }),
    ),
);

export const Configuration = Schema.Struct({
    fieldConfiguration: Schema.Struct({
        defaultUserFields: Schema.Array(Schema.String),
        defaultCompanyFields: Schema.Array(Schema.String),
    }),
    isEnabled: Schema.Boolean,
});

export const StoredConfiguration = Configuration.pipe(versioned(changelog));

export const storedV0 = {
    _version: 0,
    defaultFields: ["name", "id"],
} as const;

export const storedV1 = {
    _version: 1,
    defaultFields: ["name", "id"],
    isEnabled: false,
} as const;

export const expectedFromV0 = {
    fieldConfiguration: {
        defaultUserFields: ["name", "id"],
        defaultCompanyFields: ["name", "id"],
    },
    isEnabled: true,
} as const;

export const expectedFromV1 = {
    fieldConfiguration: {
        defaultUserFields: ["name", "id"],
        defaultCompanyFields: ["name", "id"],
    },
    isEnabled: false,
} as const;
