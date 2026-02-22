import { noAutoTypeRule } from "./rules/noAutoType";
import { noDebugCallsRule } from "./rules/noDebugCalls";
import { noEmptyCatchRule } from "./rules/noEmptyCatch";
import { noEmptyControlBodyRule } from "./rules/noEmptyControlBody";
import { noImplicitFloatToIntRule } from "./rules/noImplicitFloatToInt";
import { noShadowingRule } from "./rules/noShadowing";
import { noStringByValueParamRule } from "./rules/noStringByValueParam";
import { noTodoCommentsRule } from "./rules/noTodoComments";
import { noUnreachableCodeRule } from "./rules/noUnreachableCode";
import { noUnusedLocalsRule } from "./rules/noUnusedLocals";
import { noUnusedParamsRule } from "./rules/noUnusedParams";
import { scanDocument } from "./scan";
import { isSuppressed, parseSuppressions } from "./suppressions";
import type { LintIssue, LintRule, LinterSettings } from "./types";

const rules: LintRule[] = [
  noTodoCommentsRule,
  noDebugCallsRule,
  noAutoTypeRule,
  noEmptyCatchRule,
  noEmptyControlBodyRule,
  noUnusedLocalsRule,
  noUnusedParamsRule,
  noShadowingRule,
  noUnreachableCodeRule,
  noStringByValueParamRule,
  noImplicitFloatToIntRule
];

export function runLinter(
  text: string,
  settings: LinterSettings
): LintIssue[] {
  if (!settings.enable) {
    return [];
  }

  const suppressions = parseSuppressions(text);
  const scan = scanDocument(text);
  const allIssues: LintIssue[] = [];

  for (const rule of rules) {
    const ruleSettings = settings.rules[rule.id];
    if (!ruleSettings.enable) {
      continue;
    }

    const ruleIssues = rule.run({
      text,
      settings,
      suppressions,
      scan
    });

    for (const issue of ruleIssues) {
      if (isSuppressed(suppressions, issue.ruleId, issue.range.start.line)) {
        continue;
      }

      allIssues.push(issue);
      if (allIssues.length >= settings.maxDiagnostics) {
        return allIssues;
      }
    }
  }

  return allIssues;
}
