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

function resolveCommand(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function run(command, args, cwd) {
  const result = spawnSync(resolveCommand(command), args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function prepareCoreDependency() {
  if (!pkg.dependencies || !("openplanet-angelscript-core" in pkg.dependencies)) {
    return undefined;
  }

  const coreDir = path.resolve(workspaceRoot, "..", "openplanet-angelscript-core");
  run("npm", ["run", "compile"], coreDir);

  const targetDir = path.join(
    workspaceRoot,
    "out",
    "node_modules",
    "openplanet-angelscript-core"
  );
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(
    path.join(coreDir, "package.json"),
    path.join(targetDir, "package.json")
  );
  fs.cpSync(path.join(coreDir, "out"), path.join(targetDir, "out"), {
    recursive: true
  });
  return targetDir;
}

const versionedVsixName = `${packageName}-${packageVersion}.vsix`;
const packageArgs = [
  "npx",
  "@vscode/vsce",
  "package",
  "--no-yarn",
  "--out",
  versionedVsixName
];
const preparedCoreDependencyDir = prepareCoreDependency();
if (preparedCoreDependencyDir) {
  packageArgs.push("--no-dependencies");
}
const packageCommand = packageArgs.join(" ");

const childEnv = { ...process.env };
delete childEnv.npm_config_workspace;
delete childEnv.npm_config_workspaces;
delete childEnv.npm_config_prefix;

const shellExecutable = process.platform === "win32" ? "cmd.exe" : "sh";
const shellArgs =
  process.platform === "win32"
    ? ["/d", "/s", "/c", packageCommand]
    : ["-lc", packageCommand];

try {
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
} finally {
  if (preparedCoreDependencyDir) {
    fs.rmSync(preparedCoreDependencyDir, { recursive: true, force: true });
  }
}
