import type {
  PreprocessorModel,
  SemanticTypeInfo,
  SemanticTypeRegistry
} from "openplanet-angelscript-core";

export type LintSeverity = "error" | "warning" | "info" | "hint";

export type LinterProfile = "custom" | "recommended" | "strict";

export type RuleId =
  | "preprocessor"
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
  | "noImplicitFloatToInt"
  | "noDeadStore"
  | "noDuplicateIncludes"
  | "noDuplicateImports"
  | "preferConstLocals"
  | "noUnguardedOptionalDependency"
  | "noRiskyHandleCast";

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
  environment: LinterEnvironment;
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

export interface LinterRunOptions {
  documentPath?: string;
  workspaceRoot?: string;
  infoTomlText?: string;
  pluginRoots?: string[];
}

export interface LinterEnvironment {
  infoToml: PluginInfoToml;
  preprocessor: PreprocessorModel;
  dependencyExports: DependencyExportIndex;
  semanticTypes: SemanticTypeRegistry;
}

export interface PluginInfoToml {
  dependencies: string[];
  optionalDependencies: string[];
  defines: string[];
  imports: string[];
  exports: string[];
  sharedExports: string[];
  moduleName?: string;
}

export interface DependencyExportIndex {
  byDependencyKey: Map<string, DependencyExportSymbols>;
}

export interface DependencyExportSymbols {
  dependencyName: string;
  namespaces: ReadonlySet<string>;
  functions: ReadonlySet<string>;
  types: ReadonlySet<string>;
  semanticTypes: readonly SemanticTypeInfo[];
}
