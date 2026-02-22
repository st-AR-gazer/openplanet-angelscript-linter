import { collectFunctionModels, isStringTypeText } from "../functionModel";
import { createRange } from "../range";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

export const noStringByValueParamRule: LintRule = {
  id: "noStringByValueParam",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noStringByValueParam.severity;
    const functions = collectFunctionModels(context.scan);

    for (const fn of functions) {
      for (const parameter of fn.params) {
        if (!isStringTypeText(parameter.typeText)) {
          continue;
        }
        if (parameter.rawText.includes("@")) {
          continue;
        }
        if (/&\s*(?:in|out|inout)\b/i.test(parameter.rawText)) {
          continue;
        }
        if (parameter.rawText.includes("&")) {
          continue;
        }

        issues.push({
          ruleId: this.id,
          message: `Parameter "${parameter.name}" passes string by value. Prefer "const string &in ${parameter.name}".`,
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
