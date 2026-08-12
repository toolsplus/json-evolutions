# Release v2 without a prerelease line

The Effect 4 rewrite will be released directly as stable `2.0.0`, without a `2.0.0-beta.x` line, even though it initially peers on exact `effect@4.0.0-beta.107`. The package's own interface and behavior will be treated as release-ready; exact Effect pinning contains upstream beta drift, and later Effect upgrades can be released normally.
