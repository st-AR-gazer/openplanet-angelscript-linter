import { collectFunctionModels } from "../functionModel";
import { createRange } from "../range";
import { positionFromOffset } from "../scan";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

const terminatorPattern = /\b(return|throw|break|continue)\b[^;]*;/;

export const noUnreachableCodeRule: LintRule = {
  id: "noUnreachableCode",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noUnreachableCode.severity;
    const functions = collectFunctionModels(context.scan);

    for (const fn of functions) {
      const bodyStartLine = positionFromOffset(context.scan, fn.bodyStartOffset).line;
      const bodyEndLine = positionFromOffset(context.scan, fn.bodyEndOffset).line;
      let depth = 1;
      let unreachableDepth: number | null = null;

      for (let lineNumber = bodyStartLine; lineNumber <= bodyEndLine; lineNumber += 1) {
        const line = context.scan.lines[lineNumber];
        if (!line) {
          continue;
        }

        const trimmed = line.codeText.trim();

        if (unreachableDepth !== null && depth < unreachableDepth) {
          unreachableDepth = null;
        }

        if (/^(case\b|default\b)/.test(trimmed)) {
          unreachableDepth = null;
        }

        if (unreachableDepth !== null && isExecutableLine(trimmed)) {
          const startCharacter = firstNonWhitespaceIndex(line.codeText);
          issues.push({
            ruleId: this.id,
            message: "Unreachable code detected.",
            severity,
            range: createRange(
              lineNumber,
              startCharacter,
              lineNumber,
              Math.max(startCharacter + 1, startCharacter + 1)
            )
          });
        }

        if (terminatorPattern.test(trimmed)) {
          unreachableDepth = depth;
        }

        depth = updateDepth(depth, line.codeText);
      }
    }

    return issues;
  }
};

function isExecutableLine(trimmed: string): boolean {
  if (!trimmed) {
    return false;
  }
  if (trimmed === "{" || trimmed === "}" || trimmed === ";") {
    return false;
  }
  if (trimmed.startsWith("#")) {
    return false;
  }
  if (/^(case\b|default\b)/.test(trimmed)) {
    return false;
  }
  return true;
}

function firstNonWhitespaceIndex(text: string): number {
  const index = text.search(/\S/);
  return index >= 0 ? index : 0;
}

function updateDepth(currentDepth: number, lineCodeText: string): number {
  let depth = currentDepth;
  for (const ch of lineCodeText) {
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth = Math.max(1, depth - 1);
    }
  }
  return depth;
}
