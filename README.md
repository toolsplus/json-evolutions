# JSON Evolutions

[![CI](https://img.shields.io/github/actions/workflow/status/toolsplus/json-evolutions/ci.yml?branch=main&label=CI&style=flat&logo=github)](https://github.com/toolsplus/json-evolutions/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@toolsplus/json-evolutions?style=flat&logo=npm)](https://www.npmjs.com/package/@toolsplus/json-evolutions)

JSON evolutions is a small library that aims to help with two things:

* keep track of changes to JSON data over time 
* evolve JSON data in an older format to the latest version

## Motivation

Atlassian apps can use [entity properties](https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/) to store JSON data against various Atlassian product entities. This JSON data is stored in the Atlassian product and can be queried and updated via REST API. From the point of view of an app it is similar to a schemaless, distributed JSON storage.

Unfortunately, there is no easy way for apps to update data stored in entity property storage if the data schema evolves. For example if the app adds a new property to the data, existing data cannot easily be migrated. There is no easy way to backfill a default value into existing data like you can for example with database evolution tools like Flyway, Liquibase, or Play evolutions.

To help with this, JSON evolutions introduces a versioning mechanism, and a changelog that describes how to migrate JSON data from one version to the next. It is assumed that the JSON evolution consumer app always works with the latest version of data. Data read from an external store must always include a version number. JSON evolutions will then read that version number and apply all outstanding changesets in a changelog in sequence to migrate the data to the latest format. If the app writes to the external storage, JSON evolutions will inject the latest version number into the data.

Using this technique allows the data consumer to introduce schema changes without immediately updating already stored data records. Existing records will be migrated on the fly.

## Usage
```shell
$ npm add @toolsplus/json-evolutions
```

### Example

Let's assume our app stores a configuration object and wants to evolve old values on read while always writing the latest version.

#### Version 0

Let's start with the initial version of the stored data. At version `0`, the changelog is empty because there are no migrations to apply yet.

We also define an [io-ts](https://github.com/gcanti/io-ts) codec using the `versioned` combinator. The `versioned` combinator injects the latest `_version` when encoding and expects your strict `io-ts` codec to strip `_version` again when decoding. Using `io-ts` is optional, but it is a convenient way to keep the version marker as a storage concern instead of leaking it into the rest of the app.

```typescript
import * as E from "fp-ts/Either";
import * as t from "io-ts";
import {
    createChangelog,
    latestVersion,
    VersionedJsonObject,
    versioned,
} from "@toolsplus/json-evolutions";

export const changelog = E.getOrElseW((error) => {
    throw new Error(error.message);
})(createChangelog());

export interface Configuration {
    defaultFields: string[];
}

export const codec: t.Type<Configuration, VersionedJsonObject> = versioned(
    t.strict({
        defaultFields: t.array(t.string),
    }),
    latestVersion(changelog),
);
```

Configuration records can now be written using:

```typescript
codec.encode({defaultFields: ["field1", "field2"]});

// {_version: 0, defaultFields: ["field1", "field2"]}
```

Because the codec uses `versioned`, the latest `_version` is injected automatically when encoding.

To read a stored configuration value, first pass it through `evolve`. With an empty changelog there is nothing to migrate, so the value is returned unchanged. After that, decode it with the `io-ts` codec to validate the structure and drop `_version`.

```typescript
import * as E from "fp-ts/Either";
import {pipe} from "fp-ts/function";
import {evolve} from "@toolsplus/json-evolutions";

pipe(
    {_version: 0, defaultFields: ["field1", "field2"]},
    evolve(changelog),
    E.chain(codec.decode),
);

// Right({defaultFields: ["field1", "field2"]})
```

The important detail here is that `evolve` returns an `Either`, and `codec.decode` also returns an `Either`, so `E.chain(codec.decode)` keeps the two validation steps in the same error pipeline.

#### Version 1

Now let's evolve the schema by adding a new `isEnabled` field. To do that, define a validated changelog containing a version `1` changeset. Changelog versions must be sequential and start at `1`, and `createChangelog` checks that rule up front.

```typescript
import * as E from "fp-ts/Either";
import * as t from "io-ts";
import {
    createChangelog,
    jsonPatchChangeset,
    latestVersion,
    VersionedJsonObject,
    versioned,
} from "@toolsplus/json-evolutions";

export const changelog = E.getOrElseW((error) => {
    throw new Error(error.message);
})(
    createChangelog(
        jsonPatchChangeset({
            _version: 1,
            patch: [
                {
                    op: "add",
                    path: "/isEnabled",
                    value: true,
                },
            ],
        }),
    ),
);

export interface Configuration {
    defaultFields: string[];
    isEnabled: boolean;
}

export const codec: t.Type<Configuration, VersionedJsonObject> = versioned(
    t.strict({
        defaultFields: t.array(t.string),
        isEnabled: t.boolean,
    }),
    latestVersion(changelog),
);
```

Writing values still happens through `versioned`, which now injects version `1`:

```typescript
codec.encode({defaultFields: ["field1", "field2"], isEnabled: false});

// {_version: 1, defaultFields: ["field1", "field2"], isEnabled: false}
```

Reading a previously stored version `0` value now goes through a strict migration boundary. `evolve` will validate the stored value, determine that version `1` is still pending, apply the configured changeset, and return the migrated shape. The codec decode step then validates the business shape and strips `_version`.

```typescript
import * as E from "fp-ts/Either";
import {pipe} from "fp-ts/function";
import {evolve} from "@toolsplus/json-evolutions";

pipe(
    {_version: 0, defaultFields: ["field1", "field2"]},
    evolve(changelog),
    E.chain(codec.decode),
);

// Right({defaultFields: ["field1", "field2"], isEnabled: true})
```

### Initializing older unversioned values

If your storage contains historic values from before `_version` existed, you can opt in to `initializeFromUnversioned`. The hook is only called when `_version` is missing and must return a valid version `0` stored value.

```typescript
import * as E from "fp-ts/Either";
import {evolve, InitializeFromUnversioned} from "@toolsplus/json-evolutions";

const initializeFromUnversioned: InitializeFromUnversioned = (input) => {
    if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input) ||
        !("defaultFields" in input)
    ) {
        return E.left({
            errorCode: "INVALID_STORED_VALUE_ERROR",
            message: "Cannot initialize value.",
        });
    }

    return E.right({
        ...(input as Record<string, unknown>),
        _version: 0,
    });
};

evolve(changelog, {initializeFromUnversioned})({
    defaultFields: ["field1", "field2"],
});
```

In other words, `initializeFromUnversioned` is a one-time bridge from pre-versioned data into the normal versioned migration flow. Once the hook has returned a valid version `0` value, the regular changelog semantics apply.

### Rules

To make sure the concepts implemented in this library work as intended, follow these rules when you code your evolutions:

* Existing changesets **must** never be changed after they have been shipped to production.
* New changesets **must** always have a sequentially increasing version number.
* Call `createChangelog` or `validateChangelog` once at startup and reuse the validated result.

### Assumptions

* Stored values must be JSON objects.
* `initializeFromUnversioned` is disabled by default and should only be used for known pre-versioning records.
* The library validates stored values and changelogs eagerly and returns an error instead of silently accepting unsupported shapes.
