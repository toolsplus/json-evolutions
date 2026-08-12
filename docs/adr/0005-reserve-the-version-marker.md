# Reserve the version marker

The `_version` property is owned exclusively by the evolution engine: changesets may not add, remove, copy, move, replace, or otherwise alter it, and delegate results will be checked for violations. Central ownership prevents transformations from falsifying representation history and gives every stored value one authoritative progression mechanism.
