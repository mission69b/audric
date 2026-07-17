// Hermes ships a partial `Intl` (NumberFormat / DateTimeFormat / Collator) but
// NOT `Intl.PluralRules`. `@mysten/sui`'s client core (`client/utils.mjs`) runs
// `new Intl.PluralRules("en-US", { type: "ordinal" })` at MODULE-EVAL time, so
// importing `@mysten/sui/client` or `@mysten/sui/grpc` on-device throws
// "undefined cannot be used as a constructor" before any of our code runs.
//
// `intl-pluralrules` installs a spec-compliant `Intl.PluralRules` only when the
// engine lacks it (no-op on engines that already have it). This side-effect
// import MUST run before the first `@mysten/sui` client/grpc import — it is
// loaded from the root layout, which expo-router always evaluates before any
// route, store, or wallet module.
import "intl-pluralrules";
