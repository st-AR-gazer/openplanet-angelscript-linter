import {
  isIntegerTypeName,
  parseTypeDescriptor,
  type SemanticTypeRegistry
} from "openplanet-angelscript-core";
import {
  collectFunctionModels,
  containsFloatLiteral,
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
            !hasExplicitIntegerConversion(
              assignment.expressionText,
              context.environment.semanticTypes
            )
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
            !hasExplicitIntegerConversion(
              local.initializerText,
              context.environment.semanticTypes
            )
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
          !hasExplicitIntegerConversion(
            assignment.expressionText,
            context.environment.semanticTypes
          )
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
          !containsTopLevelFloatLiteral(expressionText) ||
          hasExplicitIntegerConversion(
            expressionText,
            context.environment.semanticTypes
          )
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

function hasExplicitIntegerConversion(
  expressionText: string,
  semanticTypes: SemanticTypeRegistry
): boolean {
  const patterns = [
    /\bcast\s*<\s*([^>]+?)\s*>/g,
    /\(\s*([A-Za-z_][A-Za-z0-9_:<>@&\[\]\s]*)\s*\)/g,
    /\b([A-Za-z_][A-Za-z0-9_:]*)\s*\(/g
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(expressionText)) !== null) {
      const typeText = match[1]?.trim();
      if (!typeText) {
        continue;
      }
      const descriptor = parseTypeDescriptor(typeText, semanticTypes);
      if (descriptor && isIntegerTypeName(descriptor.normalized)) {
        return true;
      }
    }
  }

  return false;
}

function containsTopLevelFloatLiteral(expressionText: string): boolean {
  const text = expressionText.trim();
  if (!text) {
    return false;
  }

  let topLevelText = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escapeNext = false;

  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const ch = text[cursor];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) {
      if (ch === "\\") {
        escapeNext = true;
      } else if (inSingleQuote && ch === "'") {
        inSingleQuote = false;
      } else if (inDoubleQuote && ch === "\"") {
        inDoubleQuote = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }
    if (ch === "\"") {
      inDoubleQuote = true;
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      continue;
    }
    if (ch === ")") {
      if (parenDepth > 0) {
        parenDepth -= 1;
      }
      continue;
    }
    if (ch === "[") {
      bracketDepth += 1;
      continue;
    }
    if (ch === "]") {
      if (bracketDepth > 0) {
        bracketDepth -= 1;
      }
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      continue;
    }
    if (ch === "}") {
      if (braceDepth > 0) {
        braceDepth -= 1;
      }
      continue;
    }

    if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      topLevelText += ch;
    }
  }

  return containsFloatLiteral(topLevelText);
}
