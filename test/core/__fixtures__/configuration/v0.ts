import * as t from "io-ts";
import * as fc from "fast-check";
import {latestVersion, versioned, VersionedJsonObject} from "../../../../src";

export const changelog = [];

export interface Configuration {
    defaultFields: string[];
}

export const configuration = fc.record<Configuration>({
    defaultFields: fc.array(fc.string()),
});

export const codec: t.Type<Configuration, VersionedJsonObject> = versioned(
    t.strict({
        defaultFields: t.array(t.string),
    }),
    latestVersion(changelog),
);
