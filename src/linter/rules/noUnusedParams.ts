import { createRange } from "../range";
import {
  collectFunctionModels,
  isScopeSelfOrDescendant
} from "../functionModel";
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

        const hasRead = fn.events.some(
          (event) =>
            event.name === parameter.name &&
            event.kind === "read" &&
            event.startOffset > parameter.endOffset &&
            isScopeSelfOrDescendant(fn.scopes, event.scopeId, parameter.scopeId)
        );
        if (hasRead) {
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
          ),
          fix: {
            title: `Prefix "${parameter.name}" with '_'`,
            range: createRange(
              parameter.line,
              parameter.character,
              parameter.line,
              parameter.character + parameter.name.length
            ),
            newText: `_${parameter.name}`
          }
        });
      }
    }

    return issues;
  }
};
