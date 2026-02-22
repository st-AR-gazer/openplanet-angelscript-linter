import { collectDocumentModel } from "../functionModel";
import { createRange } from "../range";
import type { LintIssue, LintRule, LintRuleContext, TextRange } from "../types";

export const noDuplicateIncludesRule: LintRule = {
  id: "noDuplicateIncludes",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noDuplicateIncludes.severity;
    const documentModel = collectDocumentModel(context.scan);
    const firstByPath = new Map<string, number>();

    for (const include of documentModel.includes) {
      const firstLine = firstByPath.get(include.normalizedPath);
      if (firstLine === undefined) {
        firstByPath.set(include.normalizedPath, include.line);
        continue;
      }

      issues.push({
        ruleId: this.id,
        message: `Duplicate #include path "${include.path}" (already included on line ${firstLine + 1}).`,
        severity,
        range: createRange(
          include.line,
          include.character,
          include.line,
          include.character + "#include".length
        ),
        fix: {
          title: `Remove duplicate #include "${include.path}"`,
          range: toLineDeleteRange(context, include.line),
          newText: ""
        }
      });
    }

    return issues;
  }
};

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
