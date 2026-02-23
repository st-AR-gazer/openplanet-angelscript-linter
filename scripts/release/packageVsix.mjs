import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const workspaceRoot = process.cwd();
const packageJsonPath = path.join(workspaceRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const packageName = String(pkg.name ?? "").trim();
const packageVersion = String(pkg.version ?? "").trim();
if (!packageName || !packageVersion) {
  throw new Error("package.json must define name and version.");
}

const versionedVsixName = `${packageName}-${packageVersion}.vsix`;
const packageCommand = [
  "npx",
  "@vscode/vsce",
  "package",
  "--no-yarn",
  "--out",
  versionedVsixName
].join(" ");

const childEnv = { ...process.env };
delete childEnv.npm_config_workspace;
delete childEnv.npm_config_workspaces;
delete childEnv.npm_config_prefix;

const shellExecutable = process.platform === "win32" ? "cmd.exe" : "sh";
const shellArgs =
  process.platform === "win32"
    ? ["/d", "/s", "/c", packageCommand]
    : ["-lc", packageCommand];

const packResult = spawnSync(shellExecutable, shellArgs, {
  cwd: workspaceRoot,
  stdio: "inherit",
  env: childEnv
});

if (packResult.error) {
  throw packResult.error;
}

if (packResult.status !== 0) {
  process.exit(packResult.status ?? 1);
}
