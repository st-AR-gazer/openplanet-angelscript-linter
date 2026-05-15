import fs, { type Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  type PreprocessorModel,
  SemanticTypeRegistry,
  buildOpenplanetPreprocessorModel,
  createSemanticTypeInfo,
  dependencyNameToPreprocessorMacro,
  normalizeOpenplanetDependencyKey,
  preprocessorDependencyMacroNameToKey,
  type SemanticTypeInfo,
  type SemanticTypeKind
} from "openplanet-angelscript-core";

import { scanDocument } from "./scan";
import type {
  DependencyExportIndex,
  DependencyExportSymbols,
  LinterEnvironment,
  LinterRunOptions,
  PluginInfoToml,
  ScannedDocument
} from "./types";

export function buildLinterEnvironment(
  scan: ScannedDocument,
  options?: LinterRunOptions
): LinterEnvironment {
  const infoToml = parseInfoToml(options?.infoTomlText ?? "");
  const dependencyExports = buildDependencyExportIndex(infoToml, options);
  return {
    infoToml,
    preprocessor: buildPreprocessorModelFromScan(scan, infoToml),
    dependencyExports,
    semanticTypes: buildSemanticTypeRegistry(scan, dependencyExports)
  };
}

export function parseInfoToml(text: string): PluginInfoToml {
  const scriptSection = readTomlSection(text, "script");
  return {
    dependencies: readStringArray(scriptSection, "dependencies"),
    optionalDependencies: readStringArray(scriptSection, "optional_dependencies"),
    defines: readStringArray(scriptSection, "defines"),
    imports: readStringArray(scriptSection, "imports"),
    exports: readStringArray(scriptSection, "exports"),
    sharedExports: readStringArray(scriptSection, "shared_exports"),
    moduleName: readStringValue(scriptSection, "module")
  };
}

export function normalizeDependencyKey(value: string | undefined): string | undefined {
  return normalizeOpenplanetDependencyKey(value);
}

export function dependencyNameToMacroName(value: string): string | undefined {
  return dependencyNameToPreprocessorMacro(value);
}

export function dependencyMacroNameToKey(value: string | undefined): string | undefined {
  return preprocessorDependencyMacroNameToKey(value);
}

export function isLineGuardedForDependency(
  model: PreprocessorModel,
  zeroBasedLine: number,
  dependencyName: string
): boolean {
  const key = normalizeDependencyKey(dependencyName);
  if (!key) {
    return false;
  }
  return model.guardedDependencyKeysByLine[zeroBasedLine]?.has(key) ?? false;
}

export function isLineInactive(
  model: PreprocessorModel,
  zeroBasedLine: number
): boolean {
  return model.lineStates[zeroBasedLine] === false;
}

function buildDependencyExportIndex(
  infoToml: PluginInfoToml,
  options?: LinterRunOptions
): DependencyExportIndex {
  const byDependencyKey = new Map<string, DependencyExportSymbols>();
  const dependencies = [
    ...infoToml.dependencies,
    ...infoToml.optionalDependencies
  ];
  if (dependencies.length === 0) {
    return { byDependencyKey };
  }

  const pluginRoots = resolvePluginRoots(options);
  if (pluginRoots.length === 0) {
    return { byDependencyKey };
  }

  for (const dependencyName of dependencies) {
    const dependencyKey = normalizeDependencyKey(dependencyName);
    if (!dependencyKey || byDependencyKey.has(dependencyKey)) {
      continue;
    }

    const match = findDependencyPluginMatch(dependencyName, pluginRoots);
    if (!match) {
      continue;
    }

    const symbols = match.kind === "folder"
      ? readFolderDependencyExports(match.path, dependencyName)
      : readOpDependencyExports(match.path, dependencyName);
    if (symbols) {
      byDependencyKey.set(dependencyKey, symbols);
    }
  }

  return { byDependencyKey };
}

type DependencyPluginMatch =
  | { kind: "folder"; path: string }
  | { kind: "op"; path: string };

function resolvePluginRoots(options?: LinterRunOptions): string[] {
  const candidates = new Set<string>();
  const add = (value: string | undefined): void => {
    if (!value) {
      return;
    }
    candidates.add(path.normalize(resolveUserPath(value)));
  };

  for (const root of options?.pluginRoots ?? []) {
    add(root);
  }

  const baseUserFolderPath = os.homedir();
  add(path.join(baseUserFolderPath, "OpenplanetNext", "Plugins"));

  if (options?.workspaceRoot) {
    addWorkspacePluginRootCandidates(candidates, options.workspaceRoot);
  } else if (options?.documentPath) {
    addWorkspacePluginRootCandidates(candidates, path.dirname(options.documentPath));
  }

  return [...candidates]
    .filter((candidate) => {
      try {
        return fs.statSync(candidate).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((left, right) => left.localeCompare(right));
}

function addWorkspacePluginRootCandidates(
  candidates: Set<string>,
  workspaceRoot: string
): void {
  const root = path.normalize(workspaceRoot);
  const parent = path.dirname(root);

  candidates.add(path.join(root, "plugins"));
  candidates.add(path.join(root, "deps"));
  candidates.add(root);

  if (parent !== root) {
    candidates.add(parent);
    candidates.add(path.join(parent, "plugins"));
    candidates.add(path.join(parent, "deps"));
  }

  const rootBase = path.basename(root).toLowerCase();
  if (parent !== root && (rootBase === "plugins" || rootBase === "deps")) {
    candidates.add(parent);
    candidates.add(path.join(parent, "plugins"));
    candidates.add(path.join(parent, "deps"));
  }
}

function resolveUserPath(value: string): string {
  if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function findDependencyPluginMatch(
  dependencyName: string,
  pluginRoots: string[]
): DependencyPluginMatch | undefined {
  const exactMatches: DependencyPluginMatch[] = [];
  const fuzzyMatches: DependencyPluginMatch[] = [];
  const normalizedDependency = dependencyName.toLowerCase();

  for (const pluginRoot of pluginRoots) {
    let entries: Dirent[];
    try {
      entries = fs.readdirSync(pluginRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(pluginRoot, entry.name);
      if (entry.isDirectory() || isDirectorySymlink(fullPath, entry)) {
        if (entry.name.toLowerCase() === normalizedDependency) {
          exactMatches.push({ kind: "folder", path: fullPath });
        } else if (moduleNameMatchesEntryName(dependencyName, entry.name)) {
          fuzzyMatches.push({ kind: "folder", path: fullPath });
        }
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".op")) {
        continue;
      }
      const baseName = entry.name.slice(0, -3);
      if (baseName.toLowerCase() === normalizedDependency) {
        exactMatches.push({ kind: "op", path: fullPath });
      } else if (moduleNameMatchesEntryName(dependencyName, baseName)) {
        fuzzyMatches.push({ kind: "op", path: fullPath });
      }
    }
  }

  return exactMatches[0] ?? fuzzyMatches[0];
}

function isDirectorySymlink(fullPath: string, entry: fs.Dirent): boolean {
  if (!entry.isSymbolicLink()) {
    return false;
  }
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

function moduleNameMatchesEntryName(moduleName: string, entryName: string): boolean {
  const normalizedModule = normalizeModuleLookup(moduleName);
  const normalizedEntry = normalizeModuleLookup(entryName);
  if (!normalizedModule || !normalizedEntry) {
    return false;
  }
  if (normalizedEntry === normalizedModule) {
    return true;
  }
  return normalizedModule.length >= 4 && normalizedEntry.endsWith(normalizedModule);
}

function normalizeModuleLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.op$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function readFolderDependencyExports(
  folderPath: string,
  dependencyName: string
): DependencyExportSymbols | undefined {
  const infoTomlText = readFileIfExists(path.join(folderPath, "info.toml"));
  if (!infoTomlText) {
    return undefined;
  }

  const dependencyInfo = parseInfoToml(infoTomlText);
  const exportPaths = [...dependencyInfo.exports, ...dependencyInfo.sharedExports];
  if (exportPaths.length === 0) {
    return undefined;
  }

  const exportedTexts: string[] = [];
  for (const exportPath of exportPaths) {
    const resolved = resolveExportPath(folderPath, exportPath);
    if (!resolved) {
      continue;
    }
    const text = readFileIfExists(resolved);
    if (text) {
      exportedTexts.push(text);
    }
  }

  return buildDependencyExportSymbols(dependencyName, exportedTexts);
}

function resolveExportPath(rootPath: string, exportPath: string): string | undefined {
  const normalizedExportPath = exportPath.replace(/\\/g, "/").replace(/^\.?\//, "");
  const candidates = [
    path.resolve(rootPath, normalizedExportPath),
    path.resolve(rootPath, `${normalizedExportPath}.as`)
  ];
  const normalizedRoot = path.resolve(rootPath).toLowerCase();
  for (const candidate of candidates) {
    const normalizedCandidate = path.resolve(candidate).toLowerCase();
    if (
      normalizedCandidate !== normalizedRoot &&
      !normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
    ) {
      continue;
    }
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch { }
  }
  return undefined;
}

function readOpDependencyExports(
  opPath: string,
  dependencyName: string
): DependencyExportSymbols | undefined {
  const entries = readOpTextEntries(opPath);
  if (entries.size === 0) {
    return undefined;
  }

  const infoTomlText = entries.get("info.toml");
  if (!infoTomlText) {
    return undefined;
  }

  const dependencyInfo = parseInfoToml(infoTomlText);
  const exportPaths = [...dependencyInfo.exports, ...dependencyInfo.sharedExports];
  if (exportPaths.length === 0) {
    return undefined;
  }

  const exportedTexts: string[] = [];
  for (const exportPath of exportPaths) {
    const normalized = normalizeZipEntryName(exportPath);
    const text = entries.get(normalized) ?? entries.get(`${normalized}.as`);
    if (text) {
      exportedTexts.push(text);
    }
  }

  return buildDependencyExportSymbols(dependencyName, exportedTexts);
}

function buildDependencyExportSymbols(
  dependencyName: string,
  texts: string[]
): DependencyExportSymbols | undefined {
  if (texts.length === 0) {
    return undefined;
  }

  const namespaces = new Set<string>();
  const functions = new Set<string>();
  const types = new Set<string>();
  const semanticTypes: SemanticTypeInfo[] = [];

  for (const text of texts) {
    const scan = scanDocument(text);
    const code = scan.codeText;

    for (const namespaceName of matchAllNames(code, /\bnamespace\s+([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)\s*\{/g)) {
      namespaces.add(namespaceName);
    }
    for (const typeInfo of collectSemanticTypesFromCode(
      code,
      "dependency",
      dependencyName,
      true
    )) {
      types.add(typeInfo.shortName);
      semanticTypes.push(typeInfo);
    }
    for (const functionName of matchAllNames(
      code,
      /(?:^|[;{}\n])\s*(?:(?:shared|private|protected|external|mixin|final|override|const)\s+)*[A-Za-z_][A-Za-z0-9_:<>@&\[\]\s]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    )) {
      if (!isReservedWord(functionName)) {
        functions.add(functionName);
      }
    }
  }

  return {
    dependencyName,
    namespaces,
    functions,
    types,
    semanticTypes
  };
}

function buildSemanticTypeRegistry(
  scan: ScannedDocument,
  dependencyExports: DependencyExportIndex
): SemanticTypeRegistry {
  const registry = new SemanticTypeRegistry();
  for (const typeInfo of collectSemanticTypesFromCode(
    scan.codeText,
    "workspace",
    undefined,
    false
  )) {
    registry.register(typeInfo);
  }

  for (const symbols of dependencyExports.byDependencyKey.values()) {
    for (const typeInfo of symbols.semanticTypes) {
      registry.register(typeInfo);
    }
  }

  return registry;
}

function collectSemanticTypesFromCode(
  code: string,
  source: "workspace" | "dependency",
  dependencyName: string | undefined,
  exported: boolean
): SemanticTypeInfo[] {
  const output: SemanticTypeInfo[] = [];
  const pattern = /\b(class|interface|enum|struct)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    const kindText = match[1];
    const shortName = match[2];
    if (!shortName) {
      continue;
    }

    const kind: SemanticTypeKind = kindText === "struct"
      ? "class"
      : kindText as SemanticTypeKind;
    output.push(createSemanticTypeInfo({
      fullName: shortName,
      shortName,
      namespace: "",
      kind,
      source,
      enumMembers:
        kindText === "enum"
          ? collectEnumMembersNearOffset(code, match.index)
          : [],
      exported,
      dependencyName
    }));
  }

  return output;
}

function collectEnumMembersNearOffset(code: string, enumOffset: number): string[] {
  const openBrace = code.indexOf("{", enumOffset);
  if (openBrace < 0) {
    return [];
  }

  const closeBrace = findMatchingBrace(code, openBrace);
  if (closeBrace < 0) {
    return [];
  }

  const body = code.slice(openBrace + 1, closeBrace);
  const members: string[] = [];
  const memberPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\b\s*(?:=\s*[^,\n\r}]+)?(?:,|$)/g;
  let match: RegExpExecArray | null;
  while ((match = memberPattern.exec(body)) !== null) {
    const memberName = match[1]?.trim();
    if (memberName && !isReservedWord(memberName)) {
      members.push(memberName);
    }
  }

  return [...new Set(members)];
}

function findMatchingBrace(code: string, openBrace: number): number {
  let depth = 0;
  for (let i = openBrace; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function matchAllNames(text: string, pattern: RegExp): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1]?.trim();
    if (name) {
      names.push(name);
    }
  }
  return names;
}

function isReservedWord(value: string): boolean {
  return /^(?:if|for|foreach|while|switch|catch|return|cast|super|this)$/i.test(value);
}

function readFileIfExists(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function readOpTextEntries(opPath: string): Map<string, string> {
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(opPath);
  } catch {
    return new Map<string, string>();
  }

  const entries = new Map<string, string>();
  const eocdOffset = findEndOfCentralDirectoryOffset(buffer);
  if (eocdOffset < 0) {
    return entries;
  }

  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let pointer = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (pointer + 46 > buffer.length) {
      break;
    }
    const headerSignature = buffer.readUInt32LE(pointer);
    if (headerSignature !== 0x02014b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const fileNameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localHeaderOffset = buffer.readUInt32LE(pointer + 42);
    const fileNameStart = pointer + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > buffer.length) {
      break;
    }

    const entryName = normalizeZipEntryName(buffer.toString("utf8", fileNameStart, fileNameEnd));
    const text = extractZipEntryText(
      buffer,
      localHeaderOffset,
      compressedSize,
      compressionMethod
    );
    if (text !== undefined) {
      entries.set(entryName, text);
    }

    pointer = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

function normalizeZipEntryName(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "").toLowerCase();
}

function findEndOfCentralDirectoryOffset(buffer: Buffer): number {
  const signature = 0x06054b50;
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }
  return -1;
}

function extractZipEntryText(
  buffer: Buffer,
  localHeaderOffset: number,
  compressedSize: number,
  compressionMethod: number
): string | undefined {
  if (localHeaderOffset + 30 > buffer.length) {
    return undefined;
  }
  const localSignature = buffer.readUInt32LE(localHeaderOffset);
  if (localSignature !== 0x04034b50) {
    return undefined;
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataStart < 0 || dataEnd > buffer.length || dataStart > dataEnd) {
    return undefined;
  }

  const compressedData = buffer.subarray(dataStart, dataEnd);
  try {
    if (compressionMethod === 0) {
      return compressedData.toString("utf8");
    }
    if (compressionMethod === 8) {
      return zlib.inflateRawSync(compressedData).toString("utf8");
    }
  } catch { }

  return undefined;
}

function buildPreprocessorModelFromScan(
  scan: ScannedDocument,
  infoToml: PluginInfoToml
): PreprocessorModel {
  return buildOpenplanetPreprocessorModel(
    scan.lines.map((line) => line.rawText).join("\n"),
    {
      defines: infoToml.defines,
      dependencies: infoToml.dependencies,
      optionalDependencies: infoToml.optionalDependencies
    }
  );
}

function readTomlSection(text: string, sectionName: string): string {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionMatch = new RegExp(
    `(?:^|\\n)\\s*\\[\\s*${escaped}\\s*\\]([\\s\\S]*?)(?:\\n\\s*\\[[^\\]]+\\]|$)`,
    "i"
  ).exec(text);
  return sectionMatch?.[1] ?? "";
}

function readStringArray(sectionText: string, key: string): string[] {
  const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const arrayMatch = new RegExp(
    `(?:^|\\n)\\s*${keyPattern}\\s*=\\s*\\[([\\s\\S]*?)\\]`,
    "i"
  ).exec(sectionText);
  if (!arrayMatch) {
    return [];
  }

  const values: string[] = [];
  const stringPattern = /"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = stringPattern.exec(arrayMatch[1])) !== null) {
    const value = decodeTomlString(match[1]).trim();
    if (value.length > 0) {
      values.push(value);
    }
  }
  return values;
}

function readStringValue(sectionText: string, key: string): string | undefined {
  const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|\\n)\\s*${keyPattern}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`,
    "i"
  ).exec(sectionText);
  const value = match ? decodeTomlString(match[1]).trim() : "";
  return value.length > 0 ? value : undefined;
}

function decodeTomlString(raw: string): string {
  return raw
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}
