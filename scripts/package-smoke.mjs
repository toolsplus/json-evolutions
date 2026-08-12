import "./build.mjs";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = mkdtempSync(resolve(tmpdir(), "json-evolutions-smoke-"));
const npmEnvironment = {
    ...process.env,
    npm_config_cache: resolve(fixture, ".npm-cache"),
};
let tarball;

const extractPackageSmokeExample = (path) => {
    const document = readFileSync(resolve(root, path), "utf8");
    const matches = [
        ...document.matchAll(
            /```typescript package-smoke\r?\n([\s\S]*?)\r?\n```/g,
        ),
    ];
    if (matches.length !== 1) {
        throw new Error(
            `${path} must contain exactly one TypeScript package-smoke example`,
        );
    }
    return matches[0][1];
};

try {
    const packOutput = execFileSync(
        "npm",
        ["pack", "--json", "--ignore-scripts"],
        {cwd: root, encoding: "utf8", env: npmEnvironment},
    );
    const [{filename, files}] = JSON.parse(packOutput);
    tarball = resolve(root, filename);

    const packedPaths = new Set(files.map(({path}) => path));
    for (const requiredPath of [
        "README.md",
        "docs/migration-v2.md",
        "build/index.js",
        "build/index.d.ts",
        "package.json",
    ]) {
        if (!packedPaths.has(requiredPath)) {
            throw new Error(`packed package is missing ${requiredPath}`);
        }
    }
    for (const {path} of files) {
        if (
            path.startsWith("src/") ||
            path.startsWith("test/") ||
            path.endsWith(".spec.js") ||
            path.endsWith(".map")
        ) {
            throw new Error(`packed package contains forbidden file ${path}`);
        }
    }

    writeFileSync(
        resolve(fixture, "package.json"),
        JSON.stringify({
            name: "json-evolutions-smoke",
            private: true,
            type: "module",
        }),
    );
    execFileSync(
        "npm",
        [
            "install",
            "--ignore-scripts",
            "--no-package-lock",
            tarball,
            "effect@4.0.0-beta.107",
        ],
        {cwd: fixture, stdio: "inherit", env: npmEnvironment},
    );

    const readmeExample = extractPackageSmokeExample("README.md");
    const migrationExample = extractPackageSmokeExample("docs/migration-v2.md");
    writeFileSync(resolve(fixture, "README.example.ts"), readmeExample);
    writeFileSync(
        resolve(fixture, "migration-v2.example.ts"),
        migrationExample,
    );
    writeFileSync(
        resolve(fixture, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: {
                target: "es2022",
                module: "nodenext",
                moduleResolution: "nodenext",
                strict: true,
                noEmit: true,
                skipLibCheck: true,
            },
            include: ["README.example.ts", "migration-v2.example.ts"],
        }),
    );

    execFileSync(
        process.execPath,
        [
            resolve(root, "node_modules/typescript/bin/tsc"),
            "-p",
            "tsconfig.json",
        ],
        {cwd: fixture, stdio: "inherit"},
    );
    execFileSync(process.execPath, [resolve(fixture, "README.example.ts")], {
        cwd: fixture,
        stdio: "inherit",
    });
    execFileSync(
        process.execPath,
        [resolve(fixture, "migration-v2.example.ts")],
        {cwd: fixture, stdio: "inherit"},
    );

    const installedManifest = JSON.parse(
        readFileSync(
            resolve(
                fixture,
                "node_modules/@toolsplus/json-evolutions/package.json",
            ),
            "utf8",
        ),
    );
    if (installedManifest.type !== "module") {
        throw new Error("packed package is not ESM");
    }
    if (installedManifest.exports?.["."]?.require !== undefined) {
        throw new Error("packed package advertises CommonJS");
    }
    process.stdout.write(
        `Package smoke test passed for ${basename(tarball)}.\n`,
    );
} finally {
    rmSync(fixture, {recursive: true, force: true});
    if (tarball !== undefined) {
        rmSync(tarball, {force: true});
    }
}
