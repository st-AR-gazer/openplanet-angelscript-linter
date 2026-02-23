import { collectFunctionModels, isStringTypeText } from "../functionModel";
import { createRange } from "../range";
import { positionFromOffset } from "../scan";
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
        if (parameter.name.startsWith("_")) {
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
        const parameterStart = positionFromOffset(
          context.scan,
          parameter.parameterStartOffset
        );
        const parameterEnd = positionFromOffset(
          context.scan,
          parameter.parameterEndOffset
        );

        issues.push({
          ruleId: this.id,
          message: `Parameter "${parameter.name}" passes string by value. Prefer "const string &in ${parameter.name}".`,
          severity,
          range: createRange(
            parameter.line,
            parameter.character,
            parameter.line,
            parameter.character + parameter.name.length
          ),
          fix: {
            title: `Rewrite "${parameter.name}" as const string &in`,
            range: createRange(
              parameterStart.line,
              parameterStart.character,
              parameterEnd.line,
              parameterEnd.character
            ),
            newText: `const string &in ${parameter.name}`
          }
        });
      }
    }

    return issues;
  }
};
