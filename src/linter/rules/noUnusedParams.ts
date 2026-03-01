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

        const hasRead = hasParameterEvent(fn, parameter.name, "read", parameter.endOffset, parameter.scopeId);
        if (hasRead) {
          continue;
        }

        if (isOutLikeParameter(parameter.rawText)) {
          const hasWrite = hasParameterEvent(
            fn,
            parameter.name,
            "write",
            parameter.endOffset,
            parameter.scopeId
          );
          if (hasWrite) {
            continue;
          }
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

function hasParameterEvent(
  fn: ReturnType<typeof collectFunctionModels>[number],
  name: string,
  kind: "read" | "write",
  afterOffset: number,
  scopeId: number
): boolean {
  return fn.events.some(
    (event) =>
      event.name === name &&
      event.kind === kind &&
      event.startOffset > afterOffset &&
      isScopeSelfOrDescendant(fn.scopes, event.scopeId, scopeId)
  );
}

function isOutLikeParameter(rawText: string): boolean {
  const compact = rawText.replace(/\s+/g, " ");
  return /\b(?:out|inout)\b/i.test(compact);
}
