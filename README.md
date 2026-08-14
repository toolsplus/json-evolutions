# JSON Evolutions

`@toolsplus/json-evolutions` evolves stored JSON objects through explicitly versioned changesets while application code works with the latest Effect Schema representation.

Version 3 is Effect 4-native and ESM-only. It deliberately replaces the v1 io-ts/fp-ts interface while preserving the stored `_version` protocol.

## Install

```shell
npm install @toolsplus/json-evolutions effect@^4.0.0-rc.109
```

The Effect peer accepts RC 109 or newer compatible Effect 4 releases. Development and package smoke tests remain pinned to RC 109 as the supported baseline. Node.js 24 or newer is required.

## Complete example

This example is compiled and executed against the packed npm artifact during the package smoke test.

```typescript package-smoke
import {Effect, Result, Schema} from "effect";
import {
    createChangelog,
    evolve,
    evolveAndDecode,
    immutabilityHelperChangeset,
    jsonPatchChangeset,
    versioned,
} from "@toolsplus/json-evolutions";

const addEnabled = jsonPatchChangeset({
    _version: 1,
    patch: [{op: "add", path: "/enabled", value: true}],
});
const addLabel = immutabilityHelperChangeset({
    _version: 2,
    spec: {$merge: {label: "current"}},
});
const changelog = Result.getOrThrow(createChangelog(addLabel, addEnabled));

const Configuration = Schema.Struct({
    enabled: Schema.Boolean,
    label: Schema.String,
});
const StoredConfiguration = Configuration.pipe(versioned(changelog));

const program = Effect.gen(function* () {
    const stored = yield* Schema.encodeUnknownEffect(StoredConfiguration)({
        enabled: false,
        label: "saved",
    });
    const configuration = yield* evolveAndDecode(StoredConfiguration)({
        _version: 0,
    });
    const evolved = yield* evolve(changelog)({
        _version: 1,
        enabled: false,
    });
    const initialized = yield* evolve(changelog, {
        initializeFromUnversioned: (input) =>
            Effect.succeed({...input, _version: 0 as const}),
    })({});
    return {stored, configuration, evolved, initialized};
});

const fallback = {_version: 2, enabled: false, label: "fallback"} as const;
const recovered = evolve(changelog)({_version: "invalid"}).pipe(
    Effect.catchTags({
        InvalidStoredValue: (error) =>
            Effect.logWarning(error.message).pipe(Effect.as(fallback)),
        UnsupportedFutureVersion: (error) =>
            Effect.fail(
                new Error(`Cannot read stored version ${error.version}`),
            ),
    }),
);

const result = await Effect.runPromise(program);
if (result.stored._version !== 2 || !result.configuration.enabled) {
    throw new Error("JSON evolution example failed");
}
void recovered;
```

`StoredConfiguration.Type` is the application value `{readonly enabled: boolean; readonly label: string}`. Its encoded representation adds `_version: number`. Runtime decoding accepts only `_version: 2`, the exact latest version derived from the retained changelog. Field transformations and their service requirements are preserved.

`evolveAndDecode` evolves historical input, validates the exact current marker, decodes the business representation, and removes `_version`. Use `evolve` when business decoding is not wanted. An initializer runs only for a strict JSON root object with no own version marker; its service requirements propagate, typed failures are wrapped, and defects remain defects.

## Changeset adapters

`jsonPatchChangeset` exposes only the six RFC 6902 operations: `add`, `remove`, `replace`, `move`, `copy`, and `test`. JSON Pointer syntax and document-dependent applicability are delegated to `fast-json-patch`. The root `_version` path and source are rejected by `createChangelog`; nested properties such as `/settings/_version` remain valid.

Changelogs are trusted source declarations. An `immutabilityHelperChangeset` spec is deliberately opaque and receives only a shallow object-or-function guard during changelog construction. Helper functions, `$apply`, Map/Set commands, and registered custom commands are not claimed to be serializable. Every delegate result is still strictly validated before evolution continues.

## Tagged errors

Evolution uses these schema-backed, yieldable error classes:

- `InvalidStoredValue`
- `UnsupportedFutureVersion`
- `InitializeFromUnversionedFailed`
- `InitializeFromUnversionedReturnedInvalidValue`
- `InvalidChangelog`
- `JsonPatchEvolutionError`
- `ImmutabilityHelperEvolutionError`

Match them through `_tag`, as the complete example does with `Effect.catchTags`. Business-schema failures from `evolveAndDecode` remain `Schema.SchemaError`. Foreign and schema causes are retained through `Schema.Defect()`.

## Stored-value guarantees

A stored value must be a genuine JSON root object with an own non-negative safe-integer `_version`. Nested values may contain only objects, arrays, strings, finite numbers, booleans, and `null`.

Functions, `undefined`, symbols, bigint, `Date`, `Map`, `Set`, non-finite numbers, cycles, and root arrays are rejected. Changesets never mutate the original input. The engine owns `_version`, stamps it after each successful changeset, and validates the newly stamped value before continuing. Business structs may not declare the reserved root marker.

See [the v1-to-v3 migration guide](docs/migration-v3.md) for source migration details.
