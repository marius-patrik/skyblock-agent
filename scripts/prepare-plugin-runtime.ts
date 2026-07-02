#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";

type PackageShim = {
  name: string;
  packageDir: string;
  exports: Record<string, string>;
};

type PreparePluginRuntimeOptions = {
  runtimeRootNodeModulesDir?: string;
  writeRootShims?: boolean;
};

const repoRoot = path.resolve(import.meta.dir, "..");
const nodeModulesDir = path.join(repoRoot, "node_modules");
const runtimeModulesDir = path.join(repoRoot, ".codex-plugin", "runtime", "modules");
const runtimeRootNodeModulesDir = path.join(repoRoot, ".codex-plugin", "runtime", "root-node_modules");
const bunStoreDir = path.join(nodeModulesDir, ".bun");

const shims: PackageShim[] = [
  {
    name: "core",
    packageDir: "packages/core",
    exports: {
      ".": "src/index.ts",
      "./accessories": "src/accessories.ts",
      "./agent-context": "src/agent-context.ts",
      "./context-events": "src/context-events.ts",
      "./hypixel": "src/hypixel.ts",
      "./inventory": "src/inventory.ts",
      "./items": "src/items.ts",
      "./llm-provider": "src/llm-provider.ts",
      "./nbt": "src/nbt.ts",
      "./networth": "src/networth.ts",
      "./objectives": "src/objectives.ts",
      "./planner": "src/planner.ts",
      "./prices": "src/prices.ts",
      "./progression": "src/progression.ts",
      "./profile": "src/profile.ts",
      "./profile-cache": "src/profile-cache.ts",
      "./readiness": "src/readiness.ts",
      "./sections": "src/sections/index.ts",
      "./setup": "src/setup.ts",
      "./start": "src/start.ts",
      "./store": "src/store.ts",
      "./weight": "src/weight.ts",
    },
  },
  {
    name: "mcp",
    packageDir: "packages/mcp",
    exports: {
      ".": "src/index.ts",
    },
  },
];

function wrapperName(exportKey: string) {
  return exportKey === "." ? "index.ts" : `${exportKey.slice(2).replaceAll("/", "__")}.ts`;
}

function wrapperSource(target: string) {
  return `export * from "./${target.replaceAll(path.sep, "/")}";\n`;
}

function packagePath(baseDir: string, packageName: string) {
  return path.join(baseDir, ...packageName.split("/"));
}

function findBunStorePackage(packageName: string) {
  for (const entry of fs.readdirSync(bunStoreDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = packagePath(path.join(bunStoreDir, entry.name, "node_modules"), packageName);
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  throw new Error(`Cannot find ${packageName} in ${path.relative(repoRoot, bunStoreDir)}. Run bun install before preparing the plugin runtime.`);
}

const runtimePackageFiles: Record<string, string[]> = {
  "prismarine-nbt": [
    "compound.js",
    "compiler-compound.js",
    "compiler-tagname.js",
    "nbt-varint.json",
    "nbt.js",
    "nbt.json",
    "optional.js",
    "package.json",
    "typings/tag-type.js",
  ],
  protodef: [
    "index.js",
    "package.json",
    "ProtoDef/schemas/conditional.json",
    "ProtoDef/schemas/numeric.json",
    "ProtoDef/schemas/structures.json",
    "ProtoDef/schemas/utils.json",
    "src/compiler.js",
    "src/datatypes/compiler-conditional.js",
    "src/datatypes/compiler-structures.js",
    "src/datatypes/compiler-utils.js",
    "src/datatypes/conditional.js",
    "src/datatypes/numeric.js",
    "src/datatypes/structures.js",
    "src/datatypes/utils.js",
    "src/datatypes/varint.js",
    "src/index.js",
    "src/protodef.js",
    "src/serializer.js",
    "src/utils.js",
  ],
  "protodef-validator": [
    "index.js",
    "package.json",
    "ProtoDef/schemas/conditional.json",
    "ProtoDef/schemas/definitions.json",
    "ProtoDef/schemas/numeric.json",
    "ProtoDef/schemas/primitives.json",
    "ProtoDef/schemas/protocol_schema.json",
    "ProtoDef/schemas/structures.json",
    "ProtoDef/schemas/utils.json",
  ],
  ajv: [
    "package.json",
    "lib/ajv.js",
    "lib/cache.js",
    "lib/data.js",
    "lib/definition_schema.js",
    "lib/keyword.js",
    "lib/compile/async.js",
    "lib/compile/error_classes.js",
    "lib/compile/formats.js",
    "lib/compile/index.js",
    "lib/compile/resolve.js",
    "lib/compile/rules.js",
    "lib/compile/schema_obj.js",
    "lib/compile/ucs2length.js",
    "lib/compile/util.js",
    "lib/dotjs/_limit.js",
    "lib/dotjs/_limitItems.js",
    "lib/dotjs/_limitLength.js",
    "lib/dotjs/_limitProperties.js",
    "lib/dotjs/allOf.js",
    "lib/dotjs/anyOf.js",
    "lib/dotjs/comment.js",
    "lib/dotjs/const.js",
    "lib/dotjs/contains.js",
    "lib/dotjs/custom.js",
    "lib/dotjs/dependencies.js",
    "lib/dotjs/enum.js",
    "lib/dotjs/format.js",
    "lib/dotjs/if.js",
    "lib/dotjs/index.js",
    "lib/dotjs/items.js",
    "lib/dotjs/multipleOf.js",
    "lib/dotjs/not.js",
    "lib/dotjs/oneOf.js",
    "lib/dotjs/pattern.js",
    "lib/dotjs/properties.js",
    "lib/dotjs/propertyNames.js",
    "lib/dotjs/ref.js",
    "lib/dotjs/required.js",
    "lib/dotjs/uniqueItems.js",
    "lib/dotjs/validate.js",
    "lib/refs/data.json",
    "lib/refs/json-schema-draft-07.json",
  ],
  "fast-deep-equal": ["index.js", "package.json"],
  "fast-json-stable-stringify": ["index.js", "package.json"],
  "json-schema-traverse": ["index.js", "package.json"],
  "lodash.reduce": ["index.js", "package.json"],
  process: ["index.js", "package.json"],
  "readable-stream": [
    "package.json",
    "lib/stream.js",
    "lib/stream/promises.js",
    "lib/internal/validators.js",
    "lib/internal/streams/add-abort-signal.js",
    "lib/internal/streams/buffer_list.js",
    "lib/internal/streams/compose.js",
    "lib/internal/streams/destroy.js",
    "lib/internal/streams/duplex.js",
    "lib/internal/streams/duplexify.js",
    "lib/internal/streams/end-of-stream.js",
    "lib/internal/streams/from.js",
    "lib/internal/streams/legacy.js",
    "lib/internal/streams/operators.js",
    "lib/internal/streams/passthrough.js",
    "lib/internal/streams/pipeline.js",
    "lib/internal/streams/readable.js",
    "lib/internal/streams/state.js",
    "lib/internal/streams/transform.js",
    "lib/internal/streams/utils.js",
    "lib/internal/streams/writable.js",
    "lib/ours/errors.js",
    "lib/ours/index.js",
    "lib/ours/primordials.js",
    "lib/ours/util.js",
    "lib/ours/util/inspect.js",
  ],
  "safe-buffer": ["index.js", "package.json"],
  "string_decoder": ["lib/string_decoder.js", "package.json"],
  "uri-js": ["dist/es5/uri.all.js", "package.json"],
};

function copyRuntimePackage(targetModulesDir: string, packageName: string, copiedPaths: string[]) {
  const source = findBunStorePackage(packageName);
  const target = packagePath(targetModulesDir, packageName);
  fs.rmSync(target, { recursive: true, force: true });

  for (const relativePath of runtimePackageFiles[packageName] ?? []) {
    const sourceFile = path.join(source, ...relativePath.split("/"));
    const targetFile = path.join(target, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
  }
  copiedPaths.push(target);
}

function copyPackageSource(shim: PackageShim, shimDir: string) {
  const sourceDir = path.join(repoRoot, shim.packageDir, "src");
  const targetDir = path.join(shimDir, "src");
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function writePackageShim(packageDir: string, packageName: string, exports: Record<string, string>, runtimePackageDir: string) {
  fs.rmSync(packageDir, { recursive: true, force: true });
  fs.mkdirSync(packageDir, { recursive: true });
  const packageExports: Record<string, string> = {};
  for (const [exportKey, target] of Object.entries(exports)) {
    const fileName = wrapperName(exportKey);
    const runtimeTarget = path.join(runtimePackageDir, ...target.split("/"));
    const relativeTarget = path.relative(packageDir, runtimeTarget).replaceAll(path.sep, "/");
    fs.writeFileSync(path.join(packageDir, fileName), `export * from "./${relativeTarget}";\n`);
    packageExports[exportKey] = `./${fileName}`;
  }
  fs.writeFileSync(path.join(packageDir, "package.json"), `${JSON.stringify({
    name: packageName,
    version: "0.1.0",
    type: "module",
    private: true,
    exports: packageExports,
  }, null, 2)}\n`);
}

function writeRuntimeRootShims(targetModulesDir: string, targetRootNodeModulesDir: string) {
  const runtimeNodeModulesDir = path.join(targetModulesDir, "node_modules");
  for (const shim of shims) {
    writePackageShim(
      path.join(targetRootNodeModulesDir, "@skyagent", shim.name),
      `@skyagent/${shim.name}`,
      shim.exports,
      path.join(runtimeNodeModulesDir, "@skyagent", shim.name),
    );
  }

  const prismarineShimDir = path.join(targetRootNodeModulesDir, "prismarine-nbt");
  fs.rmSync(prismarineShimDir, { recursive: true, force: true });
  fs.mkdirSync(prismarineShimDir, { recursive: true });
  const runtimeNbtPath = path.join(runtimeNodeModulesDir, "prismarine-nbt", "nbt.js");
  const relativeTarget = path.relative(prismarineShimDir, runtimeNbtPath).replaceAll(path.sep, "/");
  fs.writeFileSync(
    path.join(prismarineShimDir, "nbt.js"),
    `module.exports = require("./${relativeTarget}");\n`,
  );
  fs.writeFileSync(path.join(prismarineShimDir, "package.json"), `${JSON.stringify({
    name: "prismarine-nbt",
    version: "0.0.0-skyagent-runtime",
    private: true,
    main: "./nbt.js",
    exports: {
      ".": "./nbt.js",
      "./nbt.js": "./nbt.js",
    },
  }, null, 2)}\n`);
}

export function preparePluginRuntime(targetModulesDir = runtimeModulesDir, options: PreparePluginRuntimeOptions = {}) {
  const targetNodeModulesDir = path.join(targetModulesDir, "node_modules");
  const scopeDir = path.join(targetNodeModulesDir, "@skyagent");
  const targetRuntimeRootNodeModulesDir = options.runtimeRootNodeModulesDir ?? runtimeRootNodeModulesDir;
  const shouldWriteRootShims = options.writeRootShims ?? targetModulesDir === runtimeModulesDir;
  fs.rmSync(targetModulesDir, { recursive: true, force: true });
  fs.mkdirSync(scopeDir, { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "package.json"), path.join(targetModulesDir, "package.json"));
  fs.copyFileSync(path.join(repoRoot, "package.json"), path.join(targetNodeModulesDir, "package.json"));
  const preparedPaths: string[] = [];

  for (const shim of shims) {
    const shimDir = path.join(scopeDir, shim.name);
    if (fs.existsSync(shimDir)) {
      fs.rmSync(shimDir, { recursive: true, force: true });
    }
    fs.mkdirSync(shimDir, { recursive: true });
    copyPackageSource(shim, shimDir);

    const exports: Record<string, string> = {};
    for (const [exportKey, target] of Object.entries(shim.exports)) {
      const fileName = wrapperName(exportKey);
      exports[exportKey] = `./${fileName}`;
      fs.writeFileSync(path.join(shimDir, fileName), wrapperSource(target));
    }

    fs.writeFileSync(path.join(shimDir, "package.json"), `${JSON.stringify({
      name: `@skyagent/${shim.name}`,
      version: "0.1.0",
      type: "module",
      private: true,
      exports,
    }, null, 2)}\n`);
    preparedPaths.push(shimDir);
  }

  for (const packageName of Object.keys(runtimePackageFiles)) {
    copyRuntimePackage(targetNodeModulesDir, packageName, preparedPaths);
  }
  if (shouldWriteRootShims) {
    writeRuntimeRootShims(targetModulesDir, targetRuntimeRootNodeModulesDir);
  }

  return preparedPaths;
}

if (import.meta.main) {
  for (const shimPath of preparePluginRuntime()) {
    process.stdout.write(`Prepared ${path.relative(repoRoot, shimPath)}\n`);
  }
}
