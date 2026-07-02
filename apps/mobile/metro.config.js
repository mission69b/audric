// Metro config for the audric pnpm/Turbo monorepo.
// Watches the workspace root so changes in shared packages hot-reload, and
// resolves modules from BOTH the app and the root node_modules (pnpm symlinks
// are followed by Metro's default symlink support).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Extend (don't replace) Expo's default watchFolders so the project root stays
// watched, and add the monorepo root for shared-package hot reload.
config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), projectRoot, monorepoRoot])
);
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = config;
