# Separate evolution from business-schema decoding

Evolution will remain an explicit operation performed before decoding the latest business schema. The `versioned` schema combinator will only translate between the application representation and its stored representation, and decoding will require `_version` to equal the configured version; this keeps historical transition failures as typed evolution errors while catching callers that skip evolution.
