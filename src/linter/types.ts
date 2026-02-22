export type LintSeverity = "error" | "warning" | "info" | "hint";

export type LinterProfile = "custom" | "recommended" | "strict";

export type RuleId =
  | "noTodoComments"
  | "noDebugCalls"
  | "noAutoType"
  | "noEmptyCatch"
  | "noEmptyControlBody"
  | "noUnusedLocals"
  | "noUnusedParams"
  | "noShadowing"
  | "noUnreachableCode"
  | "noStringByValueParam"
  | "noImplicitFloatToInt";

export interface RuleConfig {
  enable: boolean;
  severity: LintSeverity;
}

export interface LinterSettings {
  enable: boolean;
  profile: LinterProfile;
  maxDiagnostics: number;
  rules: Record<RuleId, RuleConfig>;
}

export interface TextPosition {
  line: number;
  character: number;
}

export interface TextRange {
  start: TextPosition;
  end: TextPosition;
}

export interface LintIssue {
  ruleId: RuleId;
  message: string;
  range: TextRange;
  severity: LintSeverity;
  fix?: LintFix;
}

export interface LintFix {
  title: string;
  range: TextRange;
  newText: string;
}

export interface LintRuleContext {
  text: string;
  settings: LinterSettings;
  suppressions: RuleSuppressions;
  scan: ScannedDocument;
}

export interface LintRule {
  id: RuleId;
  run(context: LintRuleContext): LintIssue[];
}

export interface RuleSuppressions {
  disabledEverywhere: Set<string>;
  disabledByLine: Map<number, Set<string>>;
}

export interface LineComment {
  line: number;
  startCharacter: number;
  text: string;
}

export interface ScannedLine {
  lineNumber: number;
  rawText: string;
  codeText: string;
  lineComment: LineComment | null;
}

export interface ScannedDocument {
  lines: ScannedLine[];
  codeText: string;
  lineOffsets: number[];
}
