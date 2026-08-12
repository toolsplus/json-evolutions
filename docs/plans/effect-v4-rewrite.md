# Effect 4 Rewrite Plan

## Outcome

Release `@toolsplus/json-evolutions` 2.0.0 as an Effect 4-native, ESM-only library. The release replaces the io-ts and fp-ts interface, preserves the persisted stored-value protocol, validates genuine JSON at runtime, and continues delegating changeset execution to `fast-json-patch` and `immutability-helper`.

The rewrite is intentionally source-incompatible with v1. Existing stored values remain compatible.

## Target usage

### Declare a changelog and storage schema

```typescript
import {Result, Schema} from "effect";
import {
    createChangelog,
    evolveAndDecode,
    jsonPatchChangeset,
    versioned,
} from "@toolsplus/json-evolutions";

const changelog = Result.getOrThrow(
    createChangelog(
        jsonPatchChangeset({
            _version: 1,
            patch: [
                {
                    op: "add",
                    path: "/enabled",
                    value: true,
                },
            ],
        }),
    ),
);

const Configuration = Schema.Struct({
    enabled: Schema.Boolean,
});

const StoredConfiguration = Configuration.pipe(versioned(changelog));
```

`StoredConfiguration` has two representations:

- Decoded application value: `{readonly enabled: boolean}`
- Encoded stored value: `{readonly enabled: boolean; readonly _version: number}`

Although the encoded TypeScript marker is `number`, its runtime schema accepts exactly `latestVersion(changelog)`.

### Prepare a value for storage

```typescript
const stored = yield* Schema.encodeUnknownEffect(StoredConfiguration)({
    enabled: false,
});

// {enabled: false, _version: 1}
```

### Evolve and decode a stored value

```typescript
const configuration = yield* evolveAndDecode(StoredConfiguration)(input);
```

`evolveAndDecode` obtains the validated changelog from `StoredConfiguration`, evolves the input, verifies its exact latest version, validates the business representation, and removes the version marker.

### Evolve without business-schema decoding

```typescript
const evolved = yield* evolve(changelog)(input);
```

## Public interface

Expose one root module. The intended public surface is:

### Runtime schemas and inferred types

- `StoredValue`
- `StoredValueV0`
- `JsonPatchOperation`
- `JsonPatchChangeset`
- `ImmutabilityHelperChangeset`
- `Changeset`
- `Changelog`
- `EvolutionError` and its tagged members

Use Effect's normal same-name value/type namespace pattern so each domain value has one runtime and compile-time definition.

### Construction and queries

```typescript
jsonPatchChangeset(props): JsonPatchChangeset

immutabilityHelperChangeset(props): ImmutabilityHelperChangeset

createChangelog(
    ...changesets: ReadonlyArray<Changeset>
): Result.Result<ValidChangelog, InvalidChangelog>

latestVersion(changelog: ValidChangelog): number
```

Changeset factories remain infallible for concise trusted TypeScript declarations. `createChangelog` is the single validation seam and returns an already-computed `Result`.

Do not retain public `validateChangelog` or `parseStoredValue` wrappers. Standalone stored-value parsing is available through the exported `StoredValue` schema.

### Evolution

The exact generic signatures should be finalized by type-contract tests, but the interface should have this shape:

```typescript
type InitializeFromUnversioned<E = never, R = never> = (
    input: UnversionedJsonObject,
) => Effect.Effect<StoredValueV0, E, R>;

interface EvolveOptions<E = never, R = never> {
    readonly initializeFromUnversioned?: InitializeFromUnversioned<E, R>;
}

evolve<E = never, R = never>(
    changelog: ValidChangelog,
    options?: EvolveOptions<E, R>,
): (
    input: unknown,
) => Effect.Effect<StoredValue, EvolutionError, R>;
```

An initializer's service requirements propagate into the returned Effect. Its typed failures are wrapped in `InitializeFromUnversionedFailed`; defects remain defects.

### Versioned schemas

```typescript
versioned(
    changelog: ValidChangelog,
): <Fields extends Schema.Struct.Fields>(
    schema: Schema.Struct<Fields>,
) => VersionedSchema<Fields>;

evolveAndDecode<E = never, R = never>(
    schema: VersionedSchema,
    options?: EvolveOptions<E, R>,
): (
    input: unknown,
) => Effect.Effect<
    VersionedSchema["Type"],
    EvolutionError | Schema.SchemaError,
    R | VersionedSchema["DecodingServices"]
>;
```

The final implementation must preserve the supplied struct's decoding and encoding service requirements. `VersionedSchema` is nominally marked and retains its validated changelog through private symbol metadata.

`versioned` initially supports `Schema.Struct` only. It rejects a business schema that declares the reserved root `_version` field. Do not add an opaque arbitrary-object-codec overload in v2.0.

All transformation functions are data-last and pipe-friendly. Do not add duplicate data-first overloads.

## Domain invariants

### Stored values

A stored value is a recursively JSON-compatible root object with an own `_version` property. Allowed nested values are:

- Objects with JSON-compatible values
- Arrays with JSON-compatible values
- Strings
- Finite numbers
- Booleans
- `null`

Reject functions, `undefined`, symbols, bigint, `Date`, `Map`, `Set`, non-finite numbers, arrays at the root, and other non-JSON values.

The version marker is a non-negative safe integer. Version `0` is the base version.

### Changelogs

- The empty changelog has latest version `0`.
- Non-empty changesets have positive safe-integer target versions.
- Versions are unique and sequential from `1` with no gaps.
- `createChangelog` accepts unordered changesets, sorts a copy, and shallow-freezes the normalized top-level array.
- Delegate payloads are not deep-frozen.
- A valid changelog is nominal and can be obtained only through `createChangelog`.

### Version marker ownership

The evolution engine exclusively owns the root `_version` marker.

- Reject any JSON Patch `path` or `from` whose first JSON Pointer segment is `_version`, including `test` operations.
- Allow nested business properties such as `/settings/_version`.
- Verify that every delegate result retains the input marker before the engine advances it.
- After each successful changeset, stamp that changeset's target version immutably.
- Validate the newly stamped stored value before applying the next changeset.

Thus an evolution from version `0` through target versions `1` and `2` proceeds as:

```text
validate input v0
→ apply changeset 1
→ verify delegate did not alter the marker
→ stamp and validate v1
→ apply changeset 2
→ verify delegate did not alter the marker
→ stamp and validate v2
```

Execution is fail-fast. A failed evolution exposes no partial value and never mutates the original input.

### Unversioned initialization

Invoke the initializer only when the input is a strict JSON root object with no own `_version` marker.

- Do not invoke it for primitives, arrays, malformed JSON values, invalid markers, or future versions.
- Validate the initializer result as an exact base-version stored value.
- Wrap typed initializer failures.
- Treat an invalid successful return separately from a typed initializer failure.
- Allow callback defects to remain defects.

### Future and current values

- Fail with `UnsupportedFutureVersion` when an input marker is newer than the changelog's latest version.
- Return an already-current valid stored value without running changesets.
- Still perform strict stored-value validation for current values.

## Changeset adapters

### JSON Patch

Keep `fast-json-patch` as the execution adapter.

- Expose only RFC 6902 operations: `add`, `remove`, `replace`, `move`, `copy`, and `test`.
- Do not expose the dependency's nonstandard `_get` operation.
- Model operation payloads with Effect Schema and `Schema.Json` values.
- Validate the changeset envelope and reserved marker paths in `createChangelog`.
- Leave JSON Pointer syntax, path applicability, and document-dependent validation to `fast-json-patch` during execution.
- Call `applyPatch` with validation enabled and document mutation disabled.
- Wrap thrown failures with `Effect.try` as `JsonPatchEvolutionError`.

### Immutability helper

Keep `immutability-helper` as the execution adapter.

- Changelogs are trusted source declarations, so the spec remains deliberately opaque.
- Accept the dependency's `Spec` type at compile time.
- At changelog construction, perform only an honest shallow guard suitable for a spec: non-null object or function.
- Do not claim that helper functions, `$apply`, Map/Set commands, or custom registered commands are serializable or fully runtime-decodable.
- Wrap thrown failures with `Effect.try` as `ImmutabilityHelperEvolutionError`.
- Validate the delegate result and marker before continuing.

## Error model

Replace `errorCode`-based interfaces with schema-backed yieldable errors using `Schema.TaggedError`. Every error has `_tag` as its discriminator and useful structured fields such as `message`, `version`, and `cause`.

Use this top-level taxonomy:

- `InvalidStoredValue`
- `UnsupportedFutureVersion`
- `InitializeFromUnversionedFailed`
- `InitializeFromUnversionedReturnedInvalidValue`
- `InvalidChangelog`
- `JsonPatchEvolutionError`
- `ImmutabilityHelperEvolutionError`

Use `Schema.Defect()` for foreign causes that are runtime `unknown` but must remain schema-encodable. Preserve schema failure detail as a cause rather than recreating separate top-level tags for missing and malformed version markers.

Export both the individual tagged-error classes and their `EvolutionError` union schema/type.

Do not retain `errorCode` or the old `error` property.

## Internal module shape

Use a small number of cohesive modules behind one root interface. A reasonable starting layout is:

```text
src/
├── StoredValue.ts
├── EvolutionError.ts
├── Changeset.ts
├── Changelog.ts
├── Evolution.ts
├── VersionedSchema.ts
└── index.ts
```

The exact filenames may change for locality, but preserve these seams:

- Stored-value schemas own JSON and marker validation.
- Changelog construction owns changeset structure, ordering, sequencing, and reserved-path validation.
- Evolution owns delegate execution, stepwise marker advancement, initialization, and failure mapping.
- Versioned-schema construction owns storage/application transformation and schema metadata.

Do not introduce Effect Services or Layers for the library itself. All core work is synchronous and in-process; only services already required by a caller's schema or initializer propagate through the interface.

## Package and tooling changes

### Dependencies

- Remove `io-ts` and `fp-ts`.
- Add exact `effect@4.0.0-beta.107` to both `peerDependencies` and `devDependencies`.
- Retain `fast-json-patch` and `immutability-helper` as runtime dependencies.
- Upgrade direct `fast-check` usage to v4, compatible with Effect 4's testing ecosystem.
- Replace Jest, ts-jest, Jest types, and Jest-specific reporters with Vitest equivalents.

Use exact Effect beta ranges. Do not use `^` or `~` while the public Schema types remain beta-sensitive.

### ESM package

- Set `"type": "module"`.
- Produce one ESM build and declaration output.
- Replace `main`, `module`, and `typings` with a modern `exports` map and `types` entry.
- Keep one root package export.
- Use TypeScript's Node-compatible ESM module and resolution settings.
- Retain the Node `>=24` engine requirement.
- Update TypeDoc and ESLint configuration only as required for the ESM build.

### CI and release

- Update CI and release workflow test commands for Vitest.
- Preserve build, coverage, lint, formatting, documentation, semantic-release, npm provenance, and Node 24 checks.
- Ensure the release commit communicates a breaking change under the repository's Angular conventional-commit rules so semantic-release selects `2.0.0`.
- Publish directly as stable `2.0.0`; do not create a package prerelease line.

## Test strategy

The module interface is the test surface. Port all currently observable behaviors, then add tests for newly explicit invariants.

### Changelog tests

- Empty changelog yields base version `0`.
- Unordered changesets normalize correctly.
- Duplicate, missing, non-positive, fractional, and unsafe versions fail.
- Returned changelog array is shallow-frozen.
- Invalid changeset discriminators and envelopes fail at construction.
- RFC 6902 operations are accepted.
- `_get` is rejected.
- Root marker paths and sources are rejected, including `test`.
- Nested `/_version` business properties remain allowed.
- Opaque immutability-helper object and function specs are accepted.

### Stored-value tests

- Root objects with JSON-compatible nested values pass.
- Root arrays, null, and primitives fail.
- Missing, negative, fractional, unsafe, and non-numeric markers fail.
- Functions, `undefined`, bigint, `Date`, `Map`, `Set`, and non-finite numbers fail anywhere in the value.
- Exact base-version schema accepts only marker `0`.

Use property-based tests for recursive JSON values and version constraints.

### Evolution tests

- Version `0` evolves through every pending changeset.
- Evolution skips already-applied changesets.
- Current values return without delegate execution.
- Future values fail.
- JSON Patch and immutability-helper adapters preserve the original input.
- Invalid delegate descriptions fail with the correct `_tag` and cause.
- A delegate producing a non-object or non-JSON value fails at that step.
- A delegate changing or deleting the marker fails.
- The engine stamps after each step; a later helper changeset observes the immediately preceding version.
- A later failure exposes no partial result.
- Initializer eligibility and non-eligibility match the strict rules.
- Initializer services propagate.
- Typed initializer failure, defect, and invalid successful return remain distinct.

### Versioned-schema tests

- Encoding injects the latest runtime version.
- Decoding removes the marker from the application value.
- Decoding rejects missing, older, newer, and malformed markers.
- Encode/decode round-trip laws hold for generated business values.
- A business struct declaring root `_version` is rejected at the type/interface seam.
- `evolveAndDecode` uses the schema's retained changelog.
- `evolveAndDecode` returns migrated and decoded application values.
- Business-schema failures remain `Schema.SchemaError`; evolution failures retain their evolution `_tag`.

### Type-contract tests

Run compile-time tests in CI for:

- Decoded application type excludes `_version`.
- Encoded stored type includes `_version: number`.
- Literal business field types survive the transformation.
- Field-level transformations preserve the correct encoded representation.
- Schema decoding and encoding service requirements propagate unchanged through `versioned`.
- Initializer and schema decoding services form the correct union in `evolveAndDecode`.
- Arbitrary object codecs, classes, rest-record schemas, and structs owning `_version` are rejected.
- `evolveAndDecode` accepts only a nominal `VersionedSchema`.

Prefer dedicated TypeScript fixtures with `@ts-expect-error` for negative contracts, plus Vitest `expectTypeOf` where it adds clarity.

### Package smoke tests

- Run `npm pack` and inspect the tarball contents.
- Install the tarball into a temporary Node 24 ESM consumer fixture.
- Verify root imports, type resolution, schema encoding, evolution, and decoding.
- Verify CommonJS is not advertised by package metadata.

## Documentation

### README

Rewrite examples around Effect 4:

- Constructing a changelog with `Result`
- Declaring a `Schema.Struct`
- Creating a `VersionedSchema`
- Encoding for storage
- Evolving and decoding on read
- Standalone evolution
- Initializing historic unversioned JSON
- Handling tagged evolution errors
- JSON Patch and immutability-helper examples

State explicitly that changelogs are trusted source declarations and that stored values must be genuine JSON objects.

### Migration guide

Add a concise v1-to-v2 guide covering:

- `io-ts` codec to Effect `Schema.Struct`
- `versioned(codec, latestVersion(changelog))` to `schema.pipe(versioned(changelog))`
- `fp-ts/Either` changelog construction to Effect `Result`
- `Either` evolution to `Effect`
- `E.chain(codec.decode)` to `evolveAndDecode`
- Old `errorCode` handling to `_tag` matching
- Removed `validateChangelog` and `parseStoredValue` wrappers
- Strict recursive JSON validation
- Exact latest-version decoding
- Stepwise marker advancement
- Reserved root `_version`
- RFC-only JSON Patch operations
- ESM-only package consumption
- Effect 4 exact peer requirement

## Implementation phases

### Phase 1: Prove the Effect 4 schema seam

Build a narrow compile-time and runtime spike before rewriting the engine:

1. Install exact Effect 4 beta and establish ESM/Vitest compilation.
2. Implement the smallest `Schema.Struct` versioned transformation using `Schema.decodeTo` and Effect 4 transformation primitives.
3. Prove precise encoded fields, exact runtime marker validation, marker stripping/injection, and service propagation.
4. Prove nominal metadata can retain a `ValidChangelog` without changing schema behavior.
5. Lock the result with type-contract tests.

This phase retires the highest-risk uncertainty: Effect 4 beta generics and introspectable encoded struct reconstruction.

### Phase 2: Establish schema-backed domain values

1. Add strict JSON stored-value and base-version schemas.
2. Add the simplified tagged-error classes and union.
3. Add RFC JSON Patch operation schemas.
4. Add changeset schemas, types, and infallible factories.
5. Add property and error-encoding tests.

### Phase 3: Build validated changelogs

1. Implement `createChangelog` as a pure `Result` constructor.
2. Validate changeset envelopes, versions, ordering, gaps, duplicates, RFC operations, and reserved marker paths.
3. Sort a copy and shallow-freeze the normalized array.
4. Add `latestVersion` and nominal validity.
5. Remove the old public validation wrapper.

### Phase 4: Rewrite evolution around Effect

1. Parse strict stored values and classify initializer eligibility.
2. Select pending changesets and reduce them sequentially with Effect.
3. Wrap both delegates with `Effect.try`.
4. Verify marker preservation, stamp the target version, and validate after every step.
5. Preserve fail-fast and non-mutation guarantees.
6. Implement future/current version behavior.
7. Implement initializer error and service propagation.
8. Port the existing behavioral suite and add stepwise invariants.

### Phase 5: Complete the deep schema interface

1. Finalize `VersionedSchema` public generics and nominal metadata.
2. Implement `evolveAndDecode` using the schema's retained changelog.
3. Complete runtime law tests and compile-time contracts.
4. Confirm Schema and initializer service unions.
5. Export the finalized root interface.

### Phase 6: Remove legacy dependencies and modernize packaging

1. Remove all io-ts, fp-ts, Jest, dual-build, and CommonJS code/configuration.
2. Finalize the ESM exports map and declaration build.
3. Update CI, release commands, coverage, TypeDoc, lint, and formatting.
4. Run package smoke tests against the packed tarball.

Do this after the interface works end to end so packaging failures remain separate from domain and type failures.

### Phase 7: Consumer migration and release readiness

1. Rewrite the README.
2. Add the v1-to-v2 migration guide.
3. Verify generated API documentation.
4. Audit exports and tarball contents.
5. Run the full quality gate.
6. Prepare a breaking conventional commit/release path for stable 2.0.0.

## Quality gate

The rewrite is complete when all of the following hold:

- Build and declaration generation pass under Node 24 and TypeScript 5.9+.
- Runtime, property, and type-contract tests pass.
- Coverage remains enabled in CI.
- Lint and formatting pass.
- TypeDoc generation succeeds.
- Packed-package ESM consumer smoke tests pass.
- No source, manifest, or lockfile dependency on io-ts or fp-ts remains.
- No Jest, ts-jest, CommonJS build, or legacy dual-package metadata remains.
- Public exports match the documented root interface.
- Existing stored fixtures evolve successfully under the new engine.
- Every accepted ADR is reflected in code and documentation.
- README and migration guide examples compile against the packed package.

## Principal risks and mitigations

### Effect 4 beta type drift

Risk: Schema generics or transformation APIs change between beta releases.

Mitigation: Pin exact `4.0.0-beta.107` peer and development versions, prove the `VersionedSchema` seam first, and concentrate Effect-specific generic machinery in `VersionedSchema.ts`.

### Struct reconstruction loses encoded or service information

Risk: A superficially working combinator widens transformed field encodings or drops decoding/encoding services.

Mitigation: Make compile-time contracts part of Phase 1 and do not proceed until exact representative transformed and service-requiring fields pass.

### Opaque immutability-helper specs imply false validation guarantees

Risk: Consumers assume the entire changelog is portable or deeply schema-validated.

Mitigation: Name and document the trust boundary explicitly, perform only an honest shallow spec guard, and validate every execution result strictly.

### Strict JSON rejects values previously accepted accidentally

Risk: Consumers stored JavaScript-only values despite the library's JSON contract.

Mitigation: Call out the tightening prominently in the migration guide and provide clear `InvalidStoredValue` schema causes.

### Stepwise marker advancement changes helper observation

Risk: Existing immutability-helper functions may have observed the old input marker throughout a multi-step evolution.

Mitigation: Document the corrected invariant, add an explicit migration note, and test that each helper receives its immediate predecessor version.

### ESM-only publishing errors

Risk: Incorrect exports or declaration paths make the package unusable despite local tests.

Mitigation: Treat `npm pack` plus a clean Node 24 consumer installation as a required release test.

## Decision records

The plan is governed by the ADRs in `docs/adr/` and the domain language in `CONTEXT.md`. If implementation pressure appears to require changing a settled invariant, update or supersede the relevant ADR before changing the interface.
