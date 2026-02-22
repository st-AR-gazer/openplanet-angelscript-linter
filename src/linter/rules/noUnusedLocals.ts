import { createRange } from "../range";
import { countIdentifierMatches, collectFunctionModels } from "../functionModel";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

export const noUnusedLocalsRule: LintRule = {
  id: "noUnusedLocals",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noUnusedLocals.severity;
    const functions = collectFunctionModels(context.scan);

    for (const fn of functions) {
      for (const local of fn.locals) {
        if (local.name === "_" || local.name.startsWith("_")) {
          continue;
        }

        const localRelativeEnd = Math.max(0, local.endOffset - fn.bodyStartOffset);
        const trailingBody = fn.bodyText.slice(localRelativeEnd);
        if (countIdentifierMatches(trailingBody, local.name) > 0) {
          continue;
        }

        issues.push({
          ruleId: this.id,
          message: `Local "${local.name}" is never used.`,
          severity,
          range: createRange(
            local.line,
            local.character,
            local.line,
            local.character + local.name.length
          )
        });
      }
    }

    return issues;
  }
};
