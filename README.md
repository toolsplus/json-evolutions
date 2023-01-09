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

#### Version 0

Let's assume our app starts off with the following configuration record. Note, that the changelog is empty in the initial version (version 0) of the data.

We also define an [io-ts](https://github.com/gcanti/io-ts) `codec` that uses the `versioned` combinator included in this library. The `versioned` combinator injects the latest version value when data is encoded and drops the injected version value when data is decoded using the `io-ts` library. You neither are required to use `io-ts` nor the `versioned` combinator to use this library.

```typescript
import * as t from "io-ts";
import {
    latestVersion,
    versioned,
    VersionedJsonObject,
} from "@toolsplus/json-evolutions";

export const changelog = [];

export interface Configuration {
    defaultFields: string[];
}

export const codec: t.Type<Configuration, VersionedJsonObject> = versioned(
    t.strict({
        defaultFields: t.array(t.string),
    }),
    latestVersion(changelog), // 0 as long as the changelog is empty
);
```

Configuration records can now be written using

```typescript
codec.encode({defaultFields: ["field1", "field2"]})

// {_version: 0, defaultFields: ["field1", "field2"]}
```

Because our codec used the io-ts `versioned` combinator the latest version tag is included automatically into the written JSON record.

To read a previously stored configuration value we first use `evolve`. This will find the `_version` tag in the JSON record and decided which changesets need to be applied to the given data. In this case, there are no changesets so `evolve` will not do anything. Next, the data is passed to our io-ts `decode` function which will validate the given data and drop the `_version` tag (this is storage concern - code anywhere further upstream in our app should not know about it). Again, the decode step and using io-ts is optional.

```typescript
import {pipe} from "fp-ts/function";
import {evolve} from "@toolsplus/json-evolutions";

pipe(
    {_version: 0, defaultFields: ["field1", "field2"]},
    evolve(changelog),
    E.map(codec.decode),
);

// {defaultFields: ["field1", "field2"]}
```

The example above is simplified for readability. The error types of `evolve` and `codec.decode` would probably have to adjusted to be compatible.

#### Version 1

When the configuration evolves we define one or more changesets that describe how to migrate configuration values with version 0 to version 1 (the now latest version). This library supports changesets written as[ JSON Patch instructions](http://jsonpatch.com/) or as an [immutability-helper](https://github.com/kolodny/immutability-helper) spec.

```typescript
import * as t from "io-ts";
import {
    latestVersion,
    versioned,
    jsonPatchChangeset,
    VersionedJsonObject
} from "@toolsplus/json-evolutions";

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

export const changelog: Changelog = [addIsEnabledField];

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

Reading and writing values works just as before. However, this time when writing a value version 1 will be injected:

```typescript
codec.encode({defaultFields: ["field1", "field2"], isEnabled: false})

// {_version: 1, defaultFields: ["field1", "field2"], isEnabled: false}
```

To read a previously stored version 0 configuration value we again call `evolve`. It will find the `_version` tag in the JSON record and find that there is one changeset to be applied to migrate the given data to the latest version. The `isEnabled` property with the default value `true` will be added as described in the version 1 changelog. The `decode` step will work just as before.

```typescript
import {pipe} from "fp-ts/function";
import {evolve} from "@toolsplus/json-evolutions";

pipe(
    {_version: 0, defaultFields: ["field1", "field2"]},
    evolve(changelog),
    E.map(codec.decode),
);

// Right({defaultFields: ["field1", "field2"], isEnabled: true})
```

The example above is simplified for readability. The error types of `evolve` and `codec.decode` would probably have to adjusted to be compatible.

### Rules

To make sure the concepts implemented in this library work as intended follow these rules when you code your evolutions:

* Existing changesets **must** never be changed after they have been shipped to production.
* New changesets **must** always have a sequentially increasing version number.

### Limitations

It is assumed that the JSON data is always a JSON object. Any JSON values other than JSON objects are not supported.
