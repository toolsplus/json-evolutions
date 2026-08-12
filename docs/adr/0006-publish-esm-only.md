# Publish ESM only

The Effect 4 major release will publish ESM only through a modern package exports map. Effect 4 follows an ESM model and this package already requires Node 24, so retaining a parallel CommonJS build would enlarge the module interface and verification matrix without serving the declared runtime baseline.
