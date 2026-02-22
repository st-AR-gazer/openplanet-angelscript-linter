import { createRange } from "../range";
import { positionFromOffset } from "../scan";
import type { LintIssue, LintRule, LintRuleContext } from "../types";

const parenthesizedExpressionPattern = "\\((?:[^()]|\\([^()]*\\))*\\)";
const ifWhileEmptyBodyPattern = new RegExp(
  `\\b(if|while)\\s*${parenthesizedExpressionPattern}\\s*;`,
  "g"
);
const forEmptyBodyPattern = new RegExp(
  `\\bfor\\s*${parenthesizedExpressionPattern}\\s*;`,
  "g"
);

function isIdentifierCharacter(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function readPreviousIdentifier(text: string, fromIndex: number): string {
  let i = fromIndex;
  while (i >= 0 && isIdentifierCharacter(text[i])) {
    i -= 1;
  }
  return text.slice(i + 1, fromIndex + 1);
}

function isDoWhileTerminator(codeText: string, whileIndex: number): boolean {
  let i = whileIndex - 1;
  while (i >= 0 && /\s/.test(codeText[i])) {
    i -= 1;
  }
  if (i < 0 || codeText[i] !== "}") {
    return false;
  }

  let depth = 1;
  i -= 1;
  while (i >= 0) {
    const ch = codeText[i];
    if (ch === "}") {
      depth += 1;
    } else if (ch === "{") {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
    i -= 1;
  }
  if (depth !== 0) {
    return false;
  }

  i -= 1;
  while (i >= 0 && /\s/.test(codeText[i])) {
    i -= 1;
  }
  if (i < 0) {
    return false;
  }
  return readPreviousIdentifier(codeText, i) === "do";
}

export const noEmptyControlBodyRule: LintRule = {
  id: "noEmptyControlBody",
  run(context: LintRuleContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const severity = context.settings.rules.noEmptyControlBody.severity;

    const reportIssue = (keyword: string, offset: number): void => {
      const start = positionFromOffset(context.scan, offset);
      const end = positionFromOffset(context.scan, offset + keyword.length);
      issues.push({
        ruleId: this.id,
        message: `Suspicious empty ${keyword} body. Remove the stray ';' or add a block.`,
        severity,
        range: createRange(start.line, start.character, end.line, end.character)
      });
    };

    ifWhileEmptyBodyPattern.lastIndex = 0;
    let ifWhileMatch: RegExpExecArray | null;
    while ((ifWhileMatch = ifWhileEmptyBodyPattern.exec(context.scan.codeText)) !== null) {
      const keyword = ifWhileMatch[1];
      if (keyword === "while" && isDoWhileTerminator(context.scan.codeText, ifWhileMatch.index)) {
        continue;
      }
      reportIssue(keyword, ifWhileMatch.index);
    }

    forEmptyBodyPattern.lastIndex = 0;
    let forMatch: RegExpExecArray | null;
    while ((forMatch = forEmptyBodyPattern.exec(context.scan.codeText)) !== null) {
      reportIssue("for", forMatch.index);
    }

    return issues;
  }
};
