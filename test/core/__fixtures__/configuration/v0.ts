import * as t from "io-ts";
import * as fc from "fast-check";
import * as E from "fp-ts/Either";
import {pipe} from "fp-ts/function";
import {createChangelog, latestVersion, versioned} from "../../../../src";

export const changelog = pipe(
    createChangelog(),
    E.getOrElseW((error) => {
        throw new Error(error.message);
    }),
);

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
