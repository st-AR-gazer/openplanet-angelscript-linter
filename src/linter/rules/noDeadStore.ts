import {
  collectFunctionModels,
  isScopeSelfOrDescendant,
  type SymbolEvent
} from "../functionModel";
import { createRange } from "../range";
import type { LintFix, LintIssue, LintRule, LintRuleContext, TextRange } from "../types";

export const noDeadStoreRule: LintRule = {
  id: "noDeadStore",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noDeadStore.severity;
    const functions = collectFunctionModels(context.scan);
    const seen = new Set<string>();

    for (const fn of functions) {
      for (const local of fn.locals) {
        if (local.name === "_" || local.name.startsWith("_")) {
          continue;
        }

        const events = fn.events
          .filter(
            (event) =>
              event.name === local.name &&
              event.startOffset >= local.startOffset &&
              isScopeSelfOrDescendant(fn.scopes, event.scopeId, local.scopeId)
          )
          .sort((left, right) => left.startOffset - right.startOffset);

        const pendingWriteByScope = new Map<number, SymbolEvent>();
        for (const event of events) {
          if (event.kind === "write") {
            const pendingWrite = pendingWriteByScope.get(event.scopeId);
            if (pendingWrite) {
              const overwriteConsumesPreviousValue = doesWriteConsumePreviousValue(
                fn.assignments,
                local.name,
                event
              );
              const key = `${local.name}:${pendingWrite.startOffset}`;
              if (!overwriteConsumesPreviousValue && !seen.has(key)) {
                seen.add(key);
                issues.push({
                  ruleId: this.id,
                  message: `Value assigned to "${local.name}" is overwritten before being read.`,
                  severity,
                  range: createRange(
                    pendingWrite.line,
                    pendingWrite.character,
                    pendingWrite.line,
                    pendingWrite.character + local.name.length
                  ),
                  fix: buildDeadStoreFix(context, local.name, pendingWrite)
                });
              }
            }
            pendingWriteByScope.set(event.scopeId, event);
            continue;
          }

          pendingWriteByScope.clear();
        }
      }
    }

  return issues;
  }
};

function doesWriteConsumePreviousValue(
  assignments: Array<{
    name: string;
    operator: string;
    expressionText: string;
    startOffset: number;
  }>,
  localName: string,
  writeEvent: SymbolEvent
): boolean {
  if (writeEvent.isInitialization) {
    return false;
  }

  const assignment = assignments.find(
    (entry) =>
      entry.startOffset === writeEvent.startOffset &&
      entry.name === localName
  );
  if (!assignment) {
    return false;
  }

  if (assignment.operator !== "=") {
    return true;
  }

  return containsStandaloneIdentifierRead(
    assignment.expressionText,
    localName
  );
}

function containsStandaloneIdentifierRead(
  expressionText: string,
  localName: string
): boolean {
  const escapedName = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escapedName}\\b`, "g");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(expressionText)) !== null) {
    const previousCharacter = expressionText[match.index - 1] ?? "";
    if (
      previousCharacter === "." ||
      previousCharacter === ":" ||
      previousCharacter === ">"
    ) {
      continue;
    }
    return true;
  }

  return false;
}

function buildDeadStoreFix(
  context: LintRuleContext,
  localName: string,
  pendingWrite: SymbolEvent
): LintFix | undefined {
  if (pendingWrite.isInitialization) {
    return undefined;
  }
  const line = context.scan.lines[pendingWrite.line];
  if (!line) {
    return undefined;
  }

  const escapedName = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const safeAssignmentPattern = new RegExp(
    `^\\s*${escapedName}\\s*(=|\\+=|-=|\\*=|/=|%=|&=|\\|=|\\^=|<<=|>>=)\\s*[^;]+;\\s*(?://.*)?$`
  );
  if (!safeAssignmentPattern.test(line.codeText)) {
    return undefined;
  }

  return {
    title: `Remove overwritten assignment to "${localName}"`,
    range: toLineDeleteRange(context, pendingWrite.line),
    newText: ""
  };
}

function toLineDeleteRange(context: LintRuleContext, zeroBasedLine: number): TextRange {
  const line = context.scan.lines[zeroBasedLine];
  if (!line) {
    return createRange(zeroBasedLine, 0, zeroBasedLine, 0);
  }

  if (zeroBasedLine < context.scan.lines.length - 1) {
    return createRange(zeroBasedLine, 0, zeroBasedLine + 1, 0);
  }

  return createRange(
    zeroBasedLine,
    0,
    zeroBasedLine,
    line.rawText.length
  );
}
