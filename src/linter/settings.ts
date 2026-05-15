import * as vscode from "vscode";
import type {
  LinterProfile,
  LintSeverity,
  LinterSettings,
  RuleConfig,
  RuleId
} from "./types";

const defaultSeverity: LintSeverity = "warning";

const recommendedRuleConfig: Record<RuleId, RuleConfig> = {
  preprocessor: { enable: true, severity: "error" },
  noTodoComments: { enable: true, severity: "info" },
  noDebugCalls: { enable: true, severity: "warning" },
  noAutoType: { enable: false, severity: "hint" },
  noEmptyCatch: { enable: true, severity: "warning" },
  noEmptyControlBody: { enable: true, severity: "warning" },
  noUnusedLocals: { enable: true, severity: "warning" },
  noUnusedParams: { enable: true, severity: "info" },
  noShadowing: { enable: true, severity: "warning" },
  noUnreachableCode: { enable: true, severity: "warning" },
  noStringByValueParam: { enable: true, severity: "warning" },
  noImplicitFloatToInt: { enable: true, severity: "warning" },
  noDeadStore: { enable: true, severity: "warning" },
  noDuplicateIncludes: { enable: true, severity: "warning" },
  noDuplicateImports: { enable: true, severity: "warning" },
  preferConstLocals: { enable: true, severity: "info" },
  noUnguardedOptionalDependency: { enable: true, severity: "warning" },
  noRiskyHandleCast: { enable: true, severity: "warning" }
};

const strictRuleConfig: Record<RuleId, RuleConfig> = {
  preprocessor: { enable: true, severity: "error" },
  noTodoComments: { enable: true, severity: "warning" },
  noDebugCalls: { enable: true, severity: "warning" },
  noAutoType: { enable: true, severity: "warning" },
  noEmptyCatch: { enable: true, severity: "warning" },
  noEmptyControlBody: { enable: true, severity: "warning" },
  noUnusedLocals: { enable: true, severity: "warning" },
  noUnusedParams: { enable: true, severity: "warning" },
  noShadowing: { enable: true, severity: "warning" },
  noUnreachableCode: { enable: true, severity: "warning" },
  noStringByValueParam: { enable: true, severity: "warning" },
  noImplicitFloatToInt: { enable: true, severity: "warning" },
  noDeadStore: { enable: true, severity: "warning" },
  noDuplicateIncludes: { enable: true, severity: "warning" },
  noDuplicateImports: { enable: true, severity: "warning" },
  preferConstLocals: { enable: true, severity: "warning" },
  noUnguardedOptionalDependency: { enable: true, severity: "warning" },
  noRiskyHandleCast: { enable: true, severity: "warning" }
};

const allRuleIds: RuleId[] = [
  "preprocessor",
  "noTodoComments",
  "noDebugCalls",
  "noAutoType",
  "noEmptyCatch",
  "noEmptyControlBody",
  "noUnusedLocals",
  "noUnusedParams",
  "noShadowing",
  "noUnreachableCode",
  "noStringByValueParam",
  "noImplicitFloatToInt",
  "noDeadStore",
  "noDuplicateIncludes",
  "noDuplicateImports",
  "preferConstLocals",
  "noUnguardedOptionalDependency",
  "noRiskyHandleCast"
];

export function getLinterSettings(): LinterSettings {
  const config = vscode.workspace.getConfiguration("openplanetAngelscriptLinter");
  const profile = readProfile(config.get<string>("profile"), "recommended");

  const baseRuleConfig =
    profile === "strict"
      ? strictRuleConfig
      : profile === "recommended"
        ? recommendedRuleConfig
        : readCustomRules(config);
  const rules = cloneRuleConfig(baseRuleConfig);
  applyExplicitRuleOverrides(config, rules);

  return {
    enable: config.get<boolean>("enable", true),
    profile,
    maxDiagnostics: Math.max(0, config.get<number>("maxDiagnostics", 250)),
    rules
  };
}

function readCustomRules(
  config: vscode.WorkspaceConfiguration
): Record<RuleId, RuleConfig> {
  const result = cloneRuleConfig(recommendedRuleConfig);
  for (const ruleId of allRuleIds) {
    result[ruleId] = {
      enable: config.get<boolean>(`rules.${ruleId}.enable`, result[ruleId].enable),
      severity: readSeverity(
        config.get<string>(`rules.${ruleId}.severity`),
        result[ruleId].severity
      )
    };
  }

  return result;
}

function applyExplicitRuleOverrides(
  config: vscode.WorkspaceConfiguration,
  rules: Record<RuleId, RuleConfig>
): void {
  for (const ruleId of allRuleIds) {
    const explicitEnable = readExplicitConfigValue<boolean>(
      config,
      `rules.${ruleId}.enable`
    );
    if (typeof explicitEnable === "boolean") {
      rules[ruleId].enable = explicitEnable;
    }

    const explicitSeverity = readExplicitConfigValue<string>(
      config,
      `rules.${ruleId}.severity`
    );
    if (typeof explicitSeverity === "string") {
      rules[ruleId].severity = readSeverity(
        explicitSeverity,
        rules[ruleId].severity
      );
    }
  }
}

function readExplicitConfigValue<T>(
  config: vscode.WorkspaceConfiguration,
  key: string
): T | undefined {
  const inspected = config.inspect<T>(key);
  if (!inspected) {
    return undefined;
  }

  return (
    inspected.workspaceFolderLanguageValue ??
    inspected.workspaceFolderValue ??
    inspected.workspaceLanguageValue ??
    inspected.workspaceValue ??
    inspected.globalLanguageValue ??
    inspected.globalValue
  );
}

function cloneRuleConfig(
  config: Record<RuleId, RuleConfig>
): Record<RuleId, RuleConfig> {
  const cloned = {} as Record<RuleId, RuleConfig>;
  for (const ruleId of allRuleIds) {
    cloned[ruleId] = {
      enable: config[ruleId].enable,
      severity: config[ruleId].severity
    };
  }
  return cloned;
}

function readProfile(
  rawValue: string | undefined,
  fallback: LinterProfile
): LinterProfile {
  switch (rawValue) {
    case "custom":
    case "recommended":
    case "strict":
      return rawValue;
    default:
      return fallback;
  }
}

function readSeverity(
  rawValue: string | undefined,
  fallback: LintSeverity
): LintSeverity {
  if (!rawValue) {
    return fallback;
  }

  switch (rawValue) {
    case "error":
    case "warning":
    case "info":
    case "hint":
      return rawValue;
    default:
      return defaultSeverity;
  }
}
