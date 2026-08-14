# Migrating from v1 to v3

Version 3 preserves stored values but intentionally replaces the source API. Existing JSON objects carrying sequential `_version` markers remain the compatibility boundary.

## Package requirements

- Use Node.js 24 or newer.
- Consume the package as ESM.
- Install a compatible Effect 4 peer with `effect@^4.0.0-rc.109`.
- Remove direct `io-ts` and `fp-ts` usage that existed only for JSON Evolutions.

## API replacements

| v1                                           | v3                                             |
| -------------------------------------------- | ---------------------------------------------- |
| io-ts codec                                  | `Schema.Struct`                                |
| `versioned(codec, latestVersion(changelog))` | `schema.pipe(versioned(changelog))`            |
| `fp-ts/Either` changelog result              | Effect `Result`                                |
| `Either` evolution                           | `Effect`                                       |
| `E.chain(codec.decode)`                      | `evolveAndDecode(versionedSchema)`             |
| `error.errorCode`                            | `error._tag`                                   |
| `validateChangelog`                          | removed; use `createChangelog`                 |
| `parseStoredValue`                           | removed; use the exported `StoredValue` schema |

## Before

This schematic legacy snippet shows the old call shape. `input` and `throwError` stand for application-specific values and are intentionally omitted.

```typescript legacy
import * as E from "fp-ts/Either";
import * as t from "io-ts";
import {pipe} from "fp-ts/function";
import {
    createChangelog,
    evolve,
    jsonPatchChangeset,
    latestVersion,
    versioned,
} from "@toolsplus/json-evolutions";

const Configuration = t.strict({enabled: t.boolean});
const changeset = jsonPatchChangeset({_version: 1, patch: []});
const changelog = pipe(createChangelog(changeset), E.getOrElseW(throwError));
const StoredConfiguration = versioned(Configuration, latestVersion(changelog));
const decoded = pipe(evolve(changelog)(input), E.chain(Configuration.decode));
```

## After

The v3 example below is compiled against the packed npm artifact during the package smoke test.

```typescript package-smoke
import {Effect, Result, Schema} from "effect";
import {
    createChangelog,
    evolveAndDecode,
    jsonPatchChangeset,
    versioned,
} from "@toolsplus/json-evolutions";

const changeset = jsonPatchChangeset({_version: 1, patch: []});
const Configuration = Schema.Struct({enabled: Schema.Boolean});
const changelog = Result.getOrThrow(createChangelog(changeset));
const StoredConfiguration = Configuration.pipe(versioned(changelog));
const input = {_version: 1, enabled: true};
const decoded = await Effect.runPromise(
    evolveAndDecode(StoredConfiguration)(input),
);
if (!decoded.enabled) throw new Error("v3 migration example failed");
```

## Behavior changes

### Strict recursive JSON

Version 3 validates the entire stored value. JavaScript-only values such as functions, `undefined`, bigint, `Date`, `Map`, `Set`, non-finite numbers, and cycles now fail as `InvalidStoredValue`.

### Exact latest-version decoding

A `VersionedSchema` decodes only its changelog's exact latest `_version`. Call `evolveAndDecode` when reading historical values; decoding the schema directly is appropriate only for an already-current stored value.

### Stepwise marker advancement

The engine stamps and validates `_version` after every changeset. A helper function in changeset 2 now observes `_version: 1`, not the original marker. Audit helpers that read `_version`.

### Reserved root marker

The engine exclusively owns the root `_version` property. JSON Patch `path` and `from` values whose first segment is `_version` are rejected, including `test`. A business struct cannot declare root `_version`. Nested business properties such as `/settings/_version` remain supported.

### RFC-only JSON Patch

The nonstandard dependency operation `_get` is no longer exposed or accepted. Use only `add`, `remove`, `replace`, `move`, `copy`, and `test`.

### Tagged schema errors

Replace `errorCode` branching with `_tag` matching. Errors are yieldable `Schema.TaggedError` classes and retain structured fields such as `message`, `version`, and `cause`.

### Changelog trust boundary

`createChangelog` is the only public validation seam. It sorts a copy, validates sequential target versions and changeset envelopes, and shallow-freezes the normalized array. Delegate payloads remain mutable and are not deeply frozen. Immutability-helper specs remain opaque trusted source declarations.

### ESM-only consumption

Version 3 exposes one ESM root entry. Replace `require()` with `import`; no CommonJS condition is advertised.
