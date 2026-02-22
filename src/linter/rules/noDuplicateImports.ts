import { collectDocumentModel } from "../functionModel";
import { createRange } from "../range";
import type { LintIssue, LintRule, LintRuleContext, TextRange } from "../types";

export const noDuplicateImportsRule: LintRule = {
  id: "noDuplicateImports",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noDuplicateImports.severity;
    const documentModel = collectDocumentModel(context.scan);
    const firstByImport = new Map<string, number>();

    for (const importDirective of documentModel.imports) {
      const firstLine = firstByImport.get(importDirective.normalizedDeclaration);
      if (firstLine === undefined) {
        firstByImport.set(importDirective.normalizedDeclaration, importDirective.line);
        continue;
      }

      issues.push({
        ruleId: this.id,
        message: `Duplicate import declaration from "${importDirective.source}" (already declared on line ${firstLine + 1}).`,
        severity,
        range: createRange(
          importDirective.line,
          importDirective.character,
          importDirective.line,
          importDirective.character + "import".length
        ),
        fix: {
          title: "Remove duplicate import",
          range: toLineDeleteRange(context, importDirective.line),
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
