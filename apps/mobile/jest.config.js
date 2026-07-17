module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  // NOTE: `.pnpm` is added to the whitelist (vs. the generic npm/yarn-oriented
  // pattern) because this is a pnpm workspace: real paths are nested as
  // node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/..., so the first
  // "node_modules/" segment is followed by ".pnpm", not the package name.
  // Without this, the pattern falsely ignores (skips transforming) packages
  // like @react-native/jest-preset's own ESM setup file. jest-expo's own
  // preset (jest-expo/jest-preset.js) already whitelists ".pnpm" for the
  // same reason; this mirrors that fix.
  transformIgnorePatterns: [
    "node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@mysten/.*))",
  ],
};
