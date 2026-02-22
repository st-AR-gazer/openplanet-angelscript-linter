import { collectFunctionModels } from "../functionModel";
import { createRange } from "../range";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

export const noRiskyHandleCastRule: LintRule = {
  id: "noRiskyHandleCast",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noRiskyHandleCast.severity;
    const functions = collectFunctionModels(context.scan);

    for (const fn of functions) {
      for (const cast of fn.casts) {
        if (!cast.isHandleCast) {
          continue;
        }

        issues.push({
          ruleId: this.id,
          message: `Handle cast "cast<${cast.typeText}>(...)" may return null; guard usages explicitly.`,
          severity,
          range: createRange(
            cast.line,
            cast.character,
            cast.line,
            cast.character + "cast".length
          )
        });
      }
    }

    return issues;
  }
};
