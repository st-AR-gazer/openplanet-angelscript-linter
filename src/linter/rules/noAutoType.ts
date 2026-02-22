import type { LintIssue, LintRule, LintRuleContext } from "../types";
import { createRange } from "../range";

const autoDeclarationPattern = /\bauto\s+([A-Za-z_][A-Za-z0-9_]*)/g;

export const noAutoTypeRule: LintRule = {
  id: "noAutoType",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noAutoType.severity;

    for (const line of context.scan.lines) {
      autoDeclarationPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = autoDeclarationPattern.exec(line.codeText)) !== null) {
        const startCharacter = match.index;
        const endCharacter = startCharacter + "auto".length;
        issues.push({
          ruleId: this.id,
          message: `Avoid "auto" for local declarations; prefer explicit types.`,
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
