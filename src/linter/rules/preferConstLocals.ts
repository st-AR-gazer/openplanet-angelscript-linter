import {
  collectFunctionModels,
  isScopeSelfOrDescendant
} from "../functionModel";
import { createRange } from "../range";
import { positionFromOffset } from "../scan";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

export const preferConstLocalsRule: LintRule = {
  id: "preferConstLocals",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.preferConstLocals.severity;
    const functions = collectFunctionModels(context.scan);

    for (const fn of functions) {
      for (const local of fn.locals) {
        if (!local.initializerText || local.initializerText.trim().length === 0) {
          continue;
        }
        if (local.isConst) {
          continue;
        }
        if (local.name.startsWith("_")) {
          continue;
        }

        const declarationPeers = fn.locals.filter(
          (other) =>
            other.declarationStartOffset === local.declarationStartOffset &&
            other.typeStartOffset === local.typeStartOffset
        );
        if (declarationPeers.length > 1 && declarationPeers[0]?.startOffset !== local.startOffset) {
          continue;
        }

        const hasWriteAfterInitialization = fn.events.some(
          (event) =>
            event.name === local.name &&
            event.kind === "write" &&
            !event.isInitialization &&
            event.startOffset > local.startOffset &&
            isScopeSelfOrDescendant(fn.scopes, event.scopeId, local.scopeId)
        );
        if (hasWriteAfterInitialization) {
          continue;
        }
        const typeStartPosition = positionFromOffset(context.scan, local.typeStartOffset);

        issues.push({
          ruleId: this.id,
          message: `Local "${local.name}" is never reassigned. Prefer const-correctness.`,
          severity,
          range: createRange(
            local.line,
            local.character,
            local.line,
            local.character + local.name.length
          ),
          fix: {
            title: `Add const to "${local.name}" declaration`,
            range: createRange(
              typeStartPosition.line,
              typeStartPosition.character,
              typeStartPosition.line,
              typeStartPosition.character
            ),
            newText: "const "
          }
        });
      }
    }

    return issues;
  }
};
