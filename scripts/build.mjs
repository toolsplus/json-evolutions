import {execFileSync} from "node:child_process";
import {rmSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(resolve(root, "build"), {recursive: true, force: true});
execFileSync(
    process.execPath,
    [resolve(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
    {cwd: root, stdio: "inherit"},
);
