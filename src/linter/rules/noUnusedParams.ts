import { createRange } from "../range";
import { countIdentifierMatches, collectFunctionModels } from "../functionModel";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

export const noUnusedParamsRule: LintRule = {
  id: "noUnusedParams",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noUnusedParams.severity;
    const functions = collectFunctionModels(context.scan);

    for (const fn of functions) {
      for (const parameter of fn.params) {
        if (parameter.name === "_" || parameter.name.startsWith("_")) {
          continue;
        }

        if (countIdentifierMatches(fn.bodyText, parameter.name) > 0) {
          continue;
        }

        issues.push({
          ruleId: this.id,
          message: `Parameter "${parameter.name}" is never used.`,
          severity,
          range: createRange(
            parameter.line,
            parameter.character,
            parameter.line,
            parameter.character + parameter.name.length
          )
        });
      }
    }

    return issues;
  }
};
