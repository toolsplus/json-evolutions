# Release v3 without a prerelease line

The Effect 4 rewrite was released directly as stable `3.0.0`, without a `3.0.0-beta.x` line. It initially pinned exact `effect@4.0.0-beta.107` while upstream interfaces were beta-sensitive; the current peer contract accepts `effect@^4.0.0-rc.109`. The package's own interface and behavior were treated as release-ready, while development and package smoke tests remain pinned to RC 109 as the supported baseline.
