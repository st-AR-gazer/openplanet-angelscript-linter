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

        let pendingWrite: SymbolEvent | null = null;
        for (const event of events) {
          if (event.kind === "write") {
            if (pendingWrite) {
              const key = `${local.name}:${pendingWrite.startOffset}`;
              if (!seen.has(key)) {
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
            pendingWrite = event;
            continue;
          }

          pendingWrite = null;
        }
      }
    }

    return issues;
  }
};

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
