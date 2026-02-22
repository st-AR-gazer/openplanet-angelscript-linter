import { createRange } from "../range";
import {
  collectFunctionModels,
  isScopeSelfOrDescendant
} from "../functionModel";
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

        const hasRead = fn.events.some(
          (event) =>
            event.name === local.name &&
            event.kind === "read" &&
            event.startOffset > local.endOffset &&
            isScopeSelfOrDescendant(fn.scopes, event.scopeId, local.scopeId)
        );
        if (hasRead) {
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
          ),
          fix: {
            title: `Prefix "${local.name}" with '_'`,
            range: createRange(
              local.line,
              local.character,
              local.line,
              local.character + local.name.length
            ),
            newText: `_${local.name}`
          }
        });
      }
    }

    return issues;
  }
};
