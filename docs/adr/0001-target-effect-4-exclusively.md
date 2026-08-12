# Target Effect 4 exclusively

The next major version will replace its io-ts and fp-ts API with Effect 4 Schema and Effect, initially using exact `effect@4.0.0-beta.107` peer and development dependencies. It will not support Effect 3 or provide a dual io-ts/Effect API: accepting a breaking release keeps the public types and implementation coherent, while avoiding a compatibility layer for APIs that differ materially between Effect 3 and Effect 4.
