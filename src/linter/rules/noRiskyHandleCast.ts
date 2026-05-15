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
        if (isObviouslyGuardedHandleCast(fn, cast)) {
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

function isObviouslyGuardedHandleCast(
  fn: ReturnType<typeof collectFunctionModels>[number],
  cast: ReturnType<typeof collectFunctionModels>[number]["casts"][number]
): boolean {
  const statement = fn.statements.find(
    (candidate) =>
      candidate.startOffset <= cast.startOffset &&
      cast.startOffset < candidate.endOffset
  );
  if (!statement) {
    return false;
  }

  const local = findLocalInitializedByCast(fn, statement, cast.startOffset);
  if (!local) {
    return false;
  }

  const nextStatement = fn.statements.find(
    (candidate) =>
      candidate.scopeId === statement.scopeId &&
      candidate.startOffset > statement.startOffset
  );
  if (!nextStatement) {
    return false;
  }

  return isEarlyExitNullGuard(nextStatement.text, local.name);
}

function findLocalInitializedByCast(
  fn: ReturnType<typeof collectFunctionModels>[number],
  statement: ReturnType<typeof collectFunctionModels>[number]["statements"][number],
  castOffset: number
): ReturnType<typeof collectFunctionModels>[number]["locals"][number] | undefined {
  const localsInStatement = fn.locals
    .filter(
      (local) =>
        local.scopeId === statement.scopeId &&
        local.declarationStartOffset >= statement.startOffset &&
        local.declarationStartOffset < statement.endOffset &&
        local.initializerOffset !== undefined &&
        local.initializerText &&
        local.initializerText.trim().length > 0
    )
    .sort(
      (left, right) =>
        (left.initializerOffset ?? Number.MAX_SAFE_INTEGER) -
        (right.initializerOffset ?? Number.MAX_SAFE_INTEGER)
    );

  for (let index = 0; index < localsInStatement.length; index += 1) {
    const local = localsInStatement[index];
    const initializerStart = local.initializerOffset ?? Number.MAX_SAFE_INTEGER;
    const nextInitializerStart =
      localsInStatement[index + 1]?.initializerOffset ?? statement.endOffset;
    if (castOffset >= initializerStart && castOffset < nextInitializerStart) {
      return local;
    }
  }

  return undefined;
}

function isEarlyExitNullGuard(statementText: string, localName: string): boolean {
  const escapedName = escapeRegExp(localName);
  const nullCheck =
    `(?:${escapedName}\\s+(?:is|==)\\s+null|null\\s+(?:is|==)\\s+${escapedName})`;

  return new RegExp(
    `^\\s*if\\s*\\(\\s*${nullCheck}\\s*\\)\\s*(?:continue\\s*;|break\\s*;|return\\b[\\s\\S]*;|throw\\b[\\s\\S]*;)\\s*$`
  ).test(statementText);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
