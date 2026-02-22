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
