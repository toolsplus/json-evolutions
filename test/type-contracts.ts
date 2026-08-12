import {Effect, Result, Schema} from "effect";
import {
    createChangelog,
    evolveAndDecode,
    type StoredValueV0,
    versioned,
} from "../src/index.js";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <
        Value,
    >() => Value extends Right ? 1 : 2
        ? true
        : false;
type Expect<Value extends true> = Value;

interface DecodeService {
    readonly decodeService: unique symbol;
}
interface EncodeService {
    readonly encodeService: unique symbol;
}
interface InitializerService {
    readonly initializerService: unique symbol;
}

declare const TransformedField: Schema.Codec<
    number,
    string,
    DecodeService,
    EncodeService
>;
declare const initialized: Effect.Effect<
    StoredValueV0,
    never,
    InitializerService
>;

const changelog = Result.getOrThrow(createChangelog());
const Business = Schema.Struct({
    count: TransformedField,
    kind: Schema.Literal("business"),
});
const StoredBusiness = Business.pipe(versioned(changelog));

export type ApplicationTypeContract = Expect<
    Equal<
        typeof StoredBusiness.Type,
        {readonly count: number; readonly kind: "business"}
    >
>;
export type StoredTypeContract = Expect<
    Equal<
        typeof StoredBusiness.Encoded,
        {readonly count: string; readonly kind: "business"} & {
            readonly _version: number;
        }
    >
>;
export type DecodingServicesContract = Expect<
    Equal<typeof StoredBusiness.DecodingServices, DecodeService>
>;
export type EncodingServicesContract = Expect<
    Equal<typeof StoredBusiness.EncodingServices, EncodeService>
>;

const combined = evolveAndDecode(StoredBusiness, {
    initializeFromUnversioned: () => initialized,
})({count: "1", kind: "business"});
void combined;
export type CombinedServicesContract = Expect<
    Equal<Effect.Services<typeof combined>, DecodeService | InitializerService>
>;

// @ts-expect-error Business schemas cannot own the reserved root marker.
versioned(changelog)(Schema.Struct({_version: Schema.Number}));
// @ts-expect-error Arbitrary object codecs are outside the v2 interface.
versioned(changelog)(Schema.Record(Schema.String, Schema.String));

class BusinessClass extends Schema.Class<BusinessClass>("BusinessClass")({
    value: Schema.String,
}) {}
// @ts-expect-error Schema classes are outside the v2 interface.
versioned(changelog)(BusinessClass);

const StructWithRest = Schema.StructWithRest(Schema.Struct({}), [
    Schema.Record(Schema.String, Schema.String),
]);
// @ts-expect-error Structs with rest records are outside the v2 interface.
versioned(changelog)(StructWithRest);

// @ts-expect-error evolveAndDecode accepts only nominal VersionedSchema values.
evolveAndDecode(Business);
