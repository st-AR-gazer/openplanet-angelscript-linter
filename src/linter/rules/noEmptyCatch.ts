import { createRange } from "../range";
import { positionFromOffset } from "../scan";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

const emptyCatchPattern = /\bcatch\b\s*(?:\([^)]*\)\s*)?\{\s*\}/g;

export const noEmptyCatchRule: LintRule = {
  id: "noEmptyCatch",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noEmptyCatch.severity;

    emptyCatchPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = emptyCatchPattern.exec(context.scan.codeText)) !== null) {
      const rawCatchText = context.text.slice(match.index, match.index + match[0].length);
      if (containsDocumentationComment(rawCatchText)) {
        continue;
      }

      const start = positionFromOffset(context.scan, match.index);
      const end = positionFromOffset(context.scan, match.index + "catch".length);
      issues.push({
        ruleId: this.id,
        message: "Empty catch block. Handle the exception or document why it is ignored.",
        severity,
        range: createRange(start.line, start.character, end.line, end.character)
      });
    }

    return issues;
  }
};

function containsDocumentationComment(catchText: string): boolean {
  const openBrace = catchText.indexOf("{");
  const closeBrace = catchText.lastIndexOf("}");
  if (openBrace < 0 || closeBrace <= openBrace) {
    return false;
  }

  const body = catchText.slice(openBrace + 1, closeBrace);
  return /\/\/|\/\*/.test(body);
}
