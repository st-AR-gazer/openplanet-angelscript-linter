import type { LintIssue, LintRule, LintRuleContext } from "../types";
import { createRange } from "../range";

const todoPattern = /\b(TODO|FIXME|XXX)\b/gi;

export const noTodoCommentsRule: LintRule = {
  id: "noTodoComments",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noTodoComments.severity;

    for (const line of context.scan.lines) {
      if (line.lineComment === null) {
        continue;
      }

      const commentText = line.lineComment.text;
      todoPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = todoPattern.exec(commentText)) !== null) {
        const startCharacter = line.lineComment.startCharacter + match.index;
        const endCharacter = startCharacter + match[0].length;
        issues.push({
          ruleId: this.id,
          message: `Found ${match[0].toUpperCase()} comment marker.`,
          severity,
          range: createRange(
            line.lineNumber,
            startCharacter,
            line.lineNumber,
            endCharacter
          ),
          fix: {
            title: `Remove ${match[0].toUpperCase()} marker`,
            range: createRange(
              line.lineNumber,
              startCharacter,
              line.lineNumber,
              endCharacter
            ),
            newText: ""
          }
        });
      }
    }

    return issues;
  }
};
