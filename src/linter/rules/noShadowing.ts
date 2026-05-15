import { createRange } from "../range";
import {
  collectFunctionModels,
  isScopeSelfOrDescendant,
  type FunctionModel,
  type LocalDeclaration
} from "../functionModel";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

interface ScopedBinding {
  name: string;
  startOffset: number;
  scopeId: number;
  scopeEndOffset: number;
}

export const noShadowingRule: LintRule = {
  id: "noShadowing",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noShadowing.severity;
    const functions = collectFunctionModels(context.scan);

    for (const fn of functions) {
      const rootScopeEndOffset = fn.scopes.find((scope) => scope.id === 1)?.endOffset ??
        fn.bodyEndOffset;
      const bindings: ScopedBinding[] = fn.params.map((parameter) => ({
        name: parameter.name,
        startOffset: parameter.startOffset,
        scopeId: parameter.scopeId,
        scopeEndOffset: rootScopeEndOffset
      }));

      const locals = [...fn.locals].sort(
        (left, right) => left.startOffset - right.startOffset
      );
      for (const local of locals) {
        if (local.name === "_" || local.name.startsWith("_")) {
          continue;
        }

        const shadows = bindings.some((binding) =>
          isVisibleOuterBinding(fn, binding, local)
        );
        if (shadows) {
          issues.push({
            ruleId: this.id,
            message: `Declaration of "${local.name}" shadows an outer binding.`,
            severity,
            range: createRange(
              local.line,
              local.character,
              local.line,
              local.character + local.name.length
            ),
            fix: {
              title: `Rename "${local.name}" to "_${local.name}"`,
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

        bindings.push({
          name: local.name,
          startOffset: local.startOffset,
          scopeId: local.scopeId,
          scopeEndOffset: local.scopeEndOffset ?? findScopeEndOffset(fn, local.scopeId)
        });
      }
    }

    return issues;
  }
};

function isVisibleOuterBinding(
  fn: FunctionModel,
  binding: ScopedBinding,
  local: LocalDeclaration
): boolean {
  if (binding.name !== local.name) {
    return false;
  }
  if (binding.startOffset >= local.startOffset) {
    return false;
  }
  if (binding.scopeId === local.scopeId) {
    return false;
  }
  if (binding.scopeEndOffset <= local.startOffset) {
    return false;
  }
  return isScopeSelfOrDescendant(fn.scopes, local.scopeId, binding.scopeId);
}

function findScopeEndOffset(fn: FunctionModel, scopeId: number): number {
  return fn.scopes.find((scope) => scope.id === scopeId)?.endOffset ?? fn.bodyEndOffset;
}
