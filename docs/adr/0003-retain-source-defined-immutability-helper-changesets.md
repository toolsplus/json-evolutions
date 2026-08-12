# Retain source-defined immutability-helper changesets

The Effect 4 release will retain `immutability-helper` changesets and delegate their execution through `Effect.try`. Changelogs are trusted TypeScript declarations rather than portable serialized data, so an immutability-helper spec may honestly remain an opaque schema value; this preserves computed migrations without pretending that functions and custom commands can be fully runtime-decoded.
