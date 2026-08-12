import {Effect, Schema, SchemaTransformation} from "effect";
import {latestVersion, type ValidChangelog} from "./Changelog.js";
import {evolve, type EvolveOptions} from "./Evolution.js";
import type {EvolutionError} from "./EvolutionError.js";

const versionedSchemaMetadata: unique symbol = Symbol(
    "@toolsplus/json-evolutions/VersionedSchema",
);

type VersionedEncoded<Fields extends Schema.Struct.Fields> =
    Schema.Struct.Encoded<Fields> & {
        readonly _version: number;
    };

/** A business struct transformed to and from its latest stored representation. */
export interface VersionedSchema<
    Fields extends Schema.Struct.Fields = Schema.Struct.Fields,
> extends Schema.Codec<
    Schema.Struct.Type<Fields>,
    VersionedEncoded<Fields>,
    Schema.Struct.DecodingServices<Fields>,
    Schema.Struct.EncodingServices<Fields>
> {
    readonly [versionedSchemaMetadata]: ValidChangelog;
}

type WithoutReservedVersion<Fields extends Schema.Struct.Fields> =
    "_version" extends keyof Fields ? never : Schema.Struct<Fields>;

/** Adds the changelog's exact latest version to a struct's stored form. */
export const versioned =
    (changelog: ValidChangelog) =>
    <const Fields extends Schema.Struct.Fields>(
        schema: WithoutReservedVersion<Fields>,
    ): VersionedSchema<Fields> => {
        if (Object.hasOwn(schema.fields, "_version")) {
            throw new TypeError(
                "Business schemas cannot declare the reserved root _version field.",
            );
        }

        const encodedFields: Record<PropertyKey, Schema.Top> = {};
        for (const key of Reflect.ownKeys(schema.fields)) {
            encodedFields[key] = Schema.toEncoded(schema.fields[key]);
        }

        const latest = latestVersion(changelog);
        const stored = Schema.Struct({
            ...encodedFields,
            _version: Schema.Literal(latest),
        });
        const transformed = stored.pipe(
            Schema.decodeTo(
                schema,
                SchemaTransformation.transform({
                    decode: (input) => {
                        const {_version: version, ...business} = input;
                        void version;
                        return business as Schema.Struct.Encoded<Fields>;
                    },
                    encode: (input) => ({...input, _version: latest}),
                }),
            ),
        );

        Object.defineProperty(transformed, versionedSchemaMetadata, {
            value: changelog,
        });
        return transformed as unknown as VersionedSchema<Fields>;
    };

/** Evolves an input with the retained changelog and decodes its business value. */
export const evolveAndDecode =
    <const Fields extends Schema.Struct.Fields, E = never, R = never>(
        schema: VersionedSchema<Fields>,
        options: EvolveOptions<E, R> = {},
    ) =>
    (
        input: unknown,
    ): Effect.Effect<
        Schema.Struct.Type<Fields>,
        EvolutionError | Schema.SchemaError,
        R | Schema.Struct.DecodingServices<Fields>
    > =>
        evolve(
            schema[versionedSchemaMetadata],
            options,
        )(input).pipe(Effect.flatMap(Schema.decodeUnknownEffect(schema)));
