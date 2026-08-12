# Derive schema version from the changelog

The `versioned` combinator will accept and retain a validated changelog, deriving its exact runtime version rather than accepting a separately supplied numeric literal. The resulting nominal `VersionedSchema` is the sole input to `evolveAndDecode`, so callers cannot pair a schema with a different changelog. Consequently, the encoded TypeScript version marker is typed as `number` even though runtime decoding enforces the exact latest value; one authoritative version source is preferred over redundant declarations or brittle type-level arithmetic.
