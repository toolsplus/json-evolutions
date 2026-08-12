# Advance the version marker after each changeset

The evolution engine will stamp the target version after every successful changeset and validate the resulting stored value before continuing. The previous implementation stamped only the final version, allowing later changesets to observe a stale marker; stepwise advancement makes each changeset consume its immediate predecessor representation while preserving fail-fast execution and exposing no partial result.
