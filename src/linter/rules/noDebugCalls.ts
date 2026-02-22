import type { LintIssue, LintRule, LintRuleContext } from "../types";
import { createRange } from "../range";

const debugCallPattern = /\b(print|trace|warn)\s*\(/g;

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
