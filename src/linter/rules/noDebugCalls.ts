import type { LintIssue, LintRule, LintRuleContext } from "../types";
import { createRange } from "../range";

const debugCallPattern = /\b(print|trace|warn|error)\s*\(/g;

export const noDebugCallsRule: LintRule = {
  id: "noDebugCalls",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noDebugCalls.severity;

    for (const line of context.scan.lines) {
      debugCallPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = debugCallPattern.exec(line.codeText)) !== null) {
        const callName = match[1];
        const startCharacter = match.index;
        const endCharacter = startCharacter + callName.length;
        if (isQualifiedCall(line.codeText, startCharacter)) {
          continue;
        }
        if (isLikelyFunctionSignature(line.codeText, callName)) {
          continue;
        }
        issues.push({
          ruleId: this.id,
          message: `Debug call "${callName}(...)" found.`,
          severity,
          range: createRange(
            line.lineNumber,
            startCharacter,
            line.lineNumber,
            endCharacter
          )
        });
      }
    }

    return issues;
  }
};

function isQualifiedCall(lineText: string, nameStart: number): boolean {
  const previousIndex = findPreviousNonWhitespaceIndex(lineText, nameStart - 1);
  if (previousIndex < 0) return false;

  const previous = lineText[previousIndex];
  if (previous === ".") return true;
  if (previous === ":") {
    const beforeColon = findPreviousNonWhitespaceIndex(lineText, previousIndex - 1);
    return beforeColon >= 0 && lineText[beforeColon] === ":";
  }
  if (previous === ">") {
    const beforeArrow = findPreviousNonWhitespaceIndex(lineText, previousIndex - 1);
    return beforeArrow >= 0 && lineText[beforeArrow] === "-";
  }
  return false;
}

function findPreviousNonWhitespaceIndex(lineText: string, startIndex: number): number {
  for (let index = startIndex; index >= 0; index -= 1) {
    if (!/\s/.test(lineText[index])) {
      return index;
    }
  }
  return -1;
}

function isLikelyFunctionSignature(lineText: string, callName: string): boolean {
  if (/^\s*import\b/.test(lineText)) {
    return true;
  }

  const escapedName = escapeRegExp(callName);
  return new RegExp(
    "^\\s*" +
    "(?!(?:if|for|foreach|while|switch|catch|return|throw|else|case)\\b)" +
    "(?:(?:shared|private|protected|external|abstract|mixin|final|override|const)\\s+)*" +
    "[A-Za-z_][A-Za-z0-9_:<>@&\\[\\]\\s]*" +
    `\\b${escapedName}\\s*\\([^;{}]*\\)\\s*` +
    "(?:(?:const|override|final|private|protected|shared|external|abstract|mixin|property)\\s*)*" +
    "(?:\\{|;)?\\s*$"
  ).test(lineText);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
