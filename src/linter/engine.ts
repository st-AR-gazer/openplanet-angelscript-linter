import { noAutoTypeRule } from "./rules/noAutoType";
import { noDeadStoreRule } from "./rules/noDeadStore";
import { noDebugCallsRule } from "./rules/noDebugCalls";
import { noDuplicateIncludesRule } from "./rules/noDuplicateIncludes";
import { noDuplicateImportsRule } from "./rules/noDuplicateImports";
import { noEmptyCatchRule } from "./rules/noEmptyCatch";
import { noEmptyControlBodyRule } from "./rules/noEmptyControlBody";
import { noImplicitFloatToIntRule } from "./rules/noImplicitFloatToInt";
import { noRiskyHandleCastRule } from "./rules/noRiskyHandleCast";
import { noShadowingRule } from "./rules/noShadowing";
import { noStringByValueParamRule } from "./rules/noStringByValueParam";
import { noTodoCommentsRule } from "./rules/noTodoComments";
import { noUnreachableCodeRule } from "./rules/noUnreachableCode";
import { noUnusedLocalsRule } from "./rules/noUnusedLocals";
import { noUnusedParamsRule } from "./rules/noUnusedParams";
import { preferConstLocalsRule } from "./rules/preferConstLocals";
import { noUnguardedOptionalDependencyRule } from "./rules/noUnguardedOptionalDependency";
import { buildLinterEnvironment, isLineInactive } from "./environment";
import { scanDocument } from "./scan";
import { isSuppressed, parseSuppressions } from "./suppressions";
import type { LintIssue, LintRule, LinterRunOptions, LinterSettings } from "./types";

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
  noImplicitFloatToIntRule,
  noDeadStoreRule,
  noDuplicateIncludesRule,
  noDuplicateImportsRule,
  preferConstLocalsRule,
  noUnguardedOptionalDependencyRule,
  noRiskyHandleCastRule
];

export function runLinter(
  text: string,
  settings: LinterSettings,
  options?: LinterRunOptions
): LintIssue[] {
  if (!settings.enable) {
    return [];
  }

  const suppressions = parseSuppressions(text);
  const scan = scanDocument(text);
  const environment = buildLinterEnvironment(scan, options);
  const allIssues: LintIssue[] = [];
  const preprocessorSettings = settings.rules.preprocessor;

  if (preprocessorSettings.enable) {
    for (const diagnostic of environment.preprocessor.diagnostics) {
      const issue: LintIssue = {
        ruleId: "preprocessor",
        message: diagnostic.message,
        range: {
          start: {
            line: diagnostic.line,
            character: diagnostic.character
          },
          end: {
            line: diagnostic.line,
            character: diagnostic.endCharacter
          }
        },
        severity: preprocessorSettings.severity
      };
      if (isSuppressed(suppressions, issue.ruleId, issue.range.start.line)) {
        continue;
      }
      allIssues.push(issue);
      if (allIssues.length >= settings.maxDiagnostics) {
        return allIssues;
      }
    }
  }

  for (const rule of rules) {
    const ruleSettings = settings.rules[rule.id];
    if (!ruleSettings.enable) {
      continue;
    }

    const ruleIssues = rule.run({
      text,
      settings,
      suppressions,
      scan,
      environment
    });

    for (const issue of ruleIssues) {
      if (isLineInactive(environment.preprocessor, issue.range.start.line)) {
        continue;
      }
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
