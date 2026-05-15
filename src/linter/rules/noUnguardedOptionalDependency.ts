import {
  dependencyNameToMacroName,
  isLineGuardedForDependency,
  normalizeDependencyKey
} from "../environment";
import { collectFunctionModels } from "../functionModel";
import { createRange } from "../range";
import type {
  DependencyExportSymbols,
  LintIssue,
  LintRule,
  LintRuleContext
} from "../types";

export const noUnguardedOptionalDependencyRule: LintRule = {
  id: "noUnguardedOptionalDependency",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noUnguardedOptionalDependency.severity;
    const optionalDependencies = context.environment.infoToml.optionalDependencies;
    if (optionalDependencies.length === 0) {
      return issues;
    }

    const requiredDependencyKeys = new Set(
      context.environment.infoToml.dependencies
        .map((dependency) => normalizeDependencyKey(dependency))
        .filter((dependency): dependency is string => dependency !== undefined)
    );
    const localSymbols = collectLocalSymbols(context);

    for (const dependency of optionalDependencies) {
      const dependencyKey = normalizeDependencyKey(dependency);
      if (!dependencyKey || requiredDependencyKeys.has(dependencyKey)) {
        continue;
      }
      const exportedSymbols =
        context.environment.dependencyExports.byDependencyKey.get(dependencyKey);

      for (const line of context.scan.lines) {
        if (
          isLineGuardedForDependency(
            context.environment.preprocessor,
            line.lineNumber,
            dependency
          )
        ) {
          continue;
        }

        const qualifiedUse = findQualifiedDependencyUse(line.codeText, dependency);
        if (qualifiedUse !== undefined) {
          issues.push(
            buildIssue(
              this.id,
              severity,
              dependency,
              dependency,
              line.lineNumber,
              qualifiedUse
            )
          );
          continue;
        }

        const importUse = findOptionalDependencyImportUse(line.rawText, line.codeText, dependency);
        if (importUse !== undefined) {
          issues.push(
            buildIssue(
              this.id,
              severity,
              dependency,
              dependency,
              line.lineNumber,
              importUse
            )
          );
          continue;
        }

        const exportedUse = exportedSymbols
          ? findExportedDependencyUse(line.codeText, exportedSymbols, localSymbols)
          : undefined;
        if (exportedUse !== undefined) {
          issues.push(
            buildIssue(
              this.id,
              severity,
              dependency,
              exportedUse.symbolName,
              line.lineNumber,
              exportedUse.character
            )
          );
        }
      }
    }

    return issues;
  }
};

function buildIssue(
  ruleId: LintIssue["ruleId"],
  severity: LintIssue["severity"],
  dependency: string,
  symbolName: string,
  line: number,
  character: number
): LintIssue {
  const macroName = dependencyNameToMacroName(dependency) ?? `DEPENDENCY_${dependency.toUpperCase()}`;
  return {
    ruleId,
    message:
      `Optional dependency "${dependency}" is used without a ${macroName} guard.`,
    severity,
    range: createRange(line, character, line, character + symbolName.length)
  };
}

interface LocalSymbols {
  functions: Set<string>;
  types: Set<string>;
}

interface ExportedUse {
  symbolName: string;
  character: number;
}

function collectLocalSymbols(context: LintRuleContext): LocalSymbols {
  const functions = new Set<string>();
  for (const fn of collectFunctionModels(context.scan)) {
    functions.add(fn.name);
  }

  const types = new Set<string>();
  const typePattern = /\b(?:class|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = typePattern.exec(context.scan.codeText)) !== null) {
    const typeName = match[1]?.trim();
    if (typeName) {
      types.add(typeName);
    }
  }

  return { functions, types };
}

function findQualifiedDependencyUse(
  codeText: string,
  dependency: string
): number | undefined {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(dependency)) {
    return undefined;
  }

  const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*::`).exec(codeText);
  return match?.index;
}

function findOptionalDependencyImportUse(
  rawText: string,
  codeText: string,
  dependency: string
): number | undefined {
  if (!/\bimport\b/.test(codeText) || !/\bfrom\b/.test(codeText)) {
    return undefined;
  }

  const importMatch = /\bfrom\s+"((?:\\.|[^"\\])*)"/.exec(rawText);
  if (!importMatch) {
    return undefined;
  }

  const importedFrom = decodeTomlString(importMatch[1]).trim();
  if (normalizeDependencyKey(importedFrom) !== normalizeDependencyKey(dependency)) {
    return undefined;
  }

  return rawText.indexOf(importMatch[1], importMatch.index);
}

function findExportedDependencyUse(
  codeText: string,
  symbols: DependencyExportSymbols,
  localSymbols: LocalSymbols
): ExportedUse | undefined {
  for (const namespaceName of symbols.namespaces) {
    const namespaceUse = findQualifiedDependencyUse(codeText, namespaceName);
    if (namespaceUse !== undefined) {
      return {
        symbolName: namespaceName,
        character: namespaceUse
      };
    }
  }

  if (!/\bimport\b/.test(codeText)) {
    for (const functionName of symbols.functions) {
      if (localSymbols.functions.has(functionName)) {
        continue;
      }
      const character = findUnqualifiedFunctionCall(codeText, functionName);
      if (character !== undefined) {
        return {
          symbolName: functionName,
          character
        };
      }
    }
  }

  const exportedTypeNames =
    symbols.semanticTypes.length > 0
      ? symbols.semanticTypes.map((typeInfo) => typeInfo.shortName)
      : [...symbols.types];
  for (const typeName of exportedTypeNames) {
    if (localSymbols.types.has(typeName)) {
      continue;
    }
    const character = findTypeUse(codeText, typeName);
    if (character !== undefined) {
      return {
        symbolName: typeName,
        character
      };
    }
  }

  return undefined;
}

function findUnqualifiedFunctionCall(
  codeText: string,
  functionName: string
): number | undefined {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\s*\\(`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(codeText)) !== null) {
    const previous = codeText.slice(Math.max(0, match.index - 2), match.index);
    if (previous.endsWith(".") || previous.endsWith("::") || previous.endsWith("->")) {
      continue;
    }
    return match.index;
  }
  return undefined;
}

function findTypeUse(codeText: string, typeName: string): number | undefined {
  const escaped = typeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\b${escaped}\\s*@?\\s+[A-Za-z_][A-Za-z0-9_]*`, "g"),
    new RegExp(`\\bcast\\s*<\\s*${escaped}\\s*@?\\s*>`, "g"),
    new RegExp(`\\barray\\s*<\\s*${escaped}\\s*@?\\s*>`, "g")
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(codeText);
    if (match) {
      const symbolOffset = match[0].search(new RegExp(`\\b${escaped}\\b`));
      return match.index + Math.max(0, symbolOffset);
    }
  }

  return undefined;
}

function decodeTomlString(raw: string): string {
  return raw
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}
