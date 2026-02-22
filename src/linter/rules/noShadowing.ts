import { createRange } from "../range";
import { collectFunctionModels } from "../functionModel";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

interface ScopedBinding {
  name: string;
  depth: number;
  startOffset: number;
}

export const noShadowingRule: LintRule = {
  id: "noShadowing",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noShadowing.severity;
    const functions = collectFunctionModels(context.scan);

    for (const fn of functions) {
      const bindings: ScopedBinding[] = fn.params.map((parameter) => ({
        name: parameter.name,
        depth: 1,
        startOffset: parameter.startOffset
      }));

      const locals = [...fn.locals].sort(
        (left, right) => left.startOffset - right.startOffset
      );
      for (const local of locals) {
        if (local.name === "_" || local.name.startsWith("_")) {
          continue;
        }

        const shadows = bindings.some(
          (binding) =>
            binding.name === local.name &&
            binding.startOffset < local.startOffset &&
            binding.depth < local.depth
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
            )
          });
        }

        bindings.push({
          name: local.name,
          depth: local.depth,
          startOffset: local.startOffset
        });
      }
    }

    return issues;
  }
};
