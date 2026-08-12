# JSON Evolutions

JSON Evolutions describes how stored JSON values advance through explicitly versioned representations while consumers work with the latest representation.

## Language

**Stored value**:
A recursively JSON-compatible object carrying a non-negative `_version` that identifies its current representation. Its nested values are objects, arrays, strings, finite numbers, booleans, or null.
_Avoid_: Record, entity, document

**Changeset**:
A single versioned transformation that advances a stored value by one representation version.
_Avoid_: Migration, patch

**Changelog**:
The ordered sequence of changesets describing every supported transition from the base representation to the latest representation.
_Avoid_: Migration list, evolution list

**Evolution**:
The application of all pending changesets required to bring a stored value to the latest representation.
_Avoid_: Upgrade, conversion

**Base version**:
Version `0`, the initial versioned representation of a stored value before any changeset has been applied.
_Avoid_: Initial version

**Version marker**:
The library-owned `_version` property identifying a stored value's representation. Changesets never own or modify it.
_Avoid_: Version field, schema version

**Initializer**:
An opt-in transformation that turns a historic JSON object without a version marker into a base-version stored value.
_Avoid_: Legacy migration, fallback
