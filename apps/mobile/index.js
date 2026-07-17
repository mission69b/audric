// Custom app entry. Runs BEFORE `expo-router/entry`, which eagerly requires every
// route via `require.context` to build the route tree — and some routes import
// `@mysten/sui/{client,grpc}`, whose module-eval runs `new Intl.PluralRules(...)`.
// Hermes lacks `Intl.PluralRules`, so that import throws "undefined cannot be used
// as a constructor" before any route renders. The polyfill MUST be installed first,
// which a root-layout import cannot guarantee (route eval order is not layout-first).
import "./src/lib/polyfills";
import "expo-router/entry";
