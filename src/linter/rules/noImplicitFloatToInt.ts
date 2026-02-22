import {
  collectFunctionModels,
  containsFloatLiteral,
  hasExplicitIntegerCast,
  isIntegerTypeText
} from "../functionModel";
import { createRange } from "../range";
import { positionFromOffset } from "../scan";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

export const noImplicitFloatToIntRule: LintRule = {
  id: "noImplicitFloatToInt",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noImplicitFloatToInt.severity;
    const functions = collectFunctionModels(context.scan);

    for (const fn of functions) {
      const knownIntegerBindings = new Map<string, true>();
      for (const parameter of fn.params) {
        if (isIntegerTypeText(parameter.typeText)) {
          knownIntegerBindings.set(parameter.name, true);
        }
      }

      const locals = [...fn.locals].sort(
        (left, right) => left.startOffset - right.startOffset
      );
      const assignments = [...fn.assignments].sort(
        (left, right) => left.startOffset - right.startOffset
      );

      let assignmentIndex = 0;
      for (const local of locals) {
        while (
          assignmentIndex < assignments.length &&
          assignments[assignmentIndex].startOffset < local.startOffset
        ) {
          const assignment = assignments[assignmentIndex];
          if (
            knownIntegerBindings.has(assignment.name) &&
            containsFloatLiteral(assignment.expressionText) &&
            !hasExplicitIntegerCast(assignment.expressionText)
          ) {
            issues.push({
              ruleId: this.id,
              message: `Assignment to integer "${assignment.name}" may truncate float precision.`,
              severity,
              range: createRange(
                assignment.line,
                assignment.character,
                assignment.line,
                assignment.character + assignment.name.length
              )
            });
          }
          assignmentIndex += 1;
        }

        if (isIntegerTypeText(local.typeText)) {
          knownIntegerBindings.set(local.name, true);
          if (
            local.initializerText &&
            containsFloatLiteral(local.initializerText) &&
            !hasExplicitIntegerCast(local.initializerText)
          ) {
            const issuePosition = local.initializerOffset
              ? positionFromOffset(context.scan, local.initializerOffset)
              : { line: local.line, character: local.character };
            issues.push({
              ruleId: this.id,
              message: `Initializer for integer "${local.name}" may truncate float precision.`,
              severity,
              range: createRange(
                issuePosition.line,
                issuePosition.character,
                issuePosition.line,
                issuePosition.character + 1
              )
            });
          }
        }
      }

      while (assignmentIndex < assignments.length) {
        const assignment = assignments[assignmentIndex];
        if (
          knownIntegerBindings.has(assignment.name) &&
          containsFloatLiteral(assignment.expressionText) &&
          !hasExplicitIntegerCast(assignment.expressionText)
        ) {
          issues.push({
            ruleId: this.id,
            message: `Assignment to integer "${assignment.name}" may truncate float precision.`,
            severity,
            range: createRange(
              assignment.line,
              assignment.character,
              assignment.line,
              assignment.character + assignment.name.length
            )
          });
        }
        assignmentIndex += 1;
      }

      if (!isIntegerTypeText(fn.returnTypeText)) {
        continue;
      }

      const returnPattern = /\breturn\s+([^;]+);/g;
      let returnMatch: RegExpExecArray | null;
      while ((returnMatch = returnPattern.exec(fn.bodyText)) !== null) {
        const expressionText = returnMatch[1].trim();
        if (
          !containsFloatLiteral(expressionText) ||
          hasExplicitIntegerCast(expressionText)
        ) {
          continue;
        }

        const expressionOffset =
          fn.bodyStartOffset + returnMatch.index + returnMatch[0].indexOf(expressionText);
        const expressionPosition = positionFromOffset(context.scan, expressionOffset);
        issues.push({
          ruleId: this.id,
          message: `Return expression may truncate float precision for integer return type.`,
          severity,
          range: createRange(
            expressionPosition.line,
            expressionPosition.character,
            expressionPosition.line,
            expressionPosition.character + Math.max(1, expressionText.length)
          )
        });
      }
    }

    return issues;
  }
};
