import * as t from "io-ts";
import * as fc from "fast-check";
import {latestVersion, versioned} from "../../../../src";

export const changelog = [];

export interface Configuration {
    defaultFields: string[];
}

export const configuration = fc.record<Configuration>({
    defaultFields: fc.array(fc.string()),
});

export const codec = versioned<Configuration>(
    t.strict({
        defaultFields: t.array(t.string),
    }),
    latestVersion(changelog),
);
