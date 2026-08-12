# Preserve the stored-value protocol

The Effect 4 major release may break its TypeScript API, but it will preserve the persisted-data protocol: stored values retain `_version`, version `0` remains the base version, changesets remain sequential from version `1`, and existing JSON Patch evolution semantics remain valid. Persisted data is the durable compatibility boundary; consumers can migrate source code to the new Effect API without first rewriting stored values.
