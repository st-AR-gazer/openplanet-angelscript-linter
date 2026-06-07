import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runLinter } from "../linter/engine";
import type {
  LintIssue,
  LinterSettings,
  RuleId
} from "../linter/types";

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

function createSettings(): LinterSettings {
  return {
    enable: true,
    profile: "custom",
    maxDiagnostics: 250,
    rules: {
      preprocessor: { enable: true, severity: "error" },
      noTodoComments: { enable: true, severity: "info" },
      noDebugCalls: { enable: true, severity: "warning" },
      noAutoType: { enable: true, severity: "hint" },
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
    }
  };
}

function enableOnly(
  settings: LinterSettings,
  enabledRules: RuleId[]
): void {
  const enabled = new Set(enabledRules);
  for (const ruleId of allRuleIds) {
    settings.rules[ruleId].enable = enabled.has(ruleId);
  }
}

function runCase(
  name: string,
  text: string,
  configure?: (settings: LinterSettings) => void,
  options?: Parameters<typeof runLinter>[2]
): LintIssue[] {
  const settings = createSettings();
  configure?.(settings);
  const issues = runLinter(text, settings, options);
  assert.ok(Array.isArray(issues), `${name}: expected issues array.`);
  return issues;
}

function countRule(issues: LintIssue[], ruleId: RuleId): number {
  return issues.filter((issue) => issue.ruleId === ruleId).length;
}

function testDebugCallsIgnoreStringsAndComments(): void {
  const issues = runCase(
    "debug-calls-ignore-non-code",
    [
      "void Main() {",
      '  string s = "print(fake)";',
      "  // print(inComment);",
      "  /* trace(inBlockComment); */",
      '  print("actual");',
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDebugCalls"])
  );

  assert.equal(countRule(issues, "noDebugCalls"), 1);
}

function testDebugCallsIgnoreQualifiedAndLocalDebugNames(): void {
  const issues = runCase(
    "debug-calls-ignore-qualified-and-local-names",
    [
      "void print(const string &in msg) {",
      "}",
      "",
      "namespace Logger {",
      "  void warn(const string &in msg) {",
      "  }",
      "}",
      "",
      "void Main() {",
      '  Logger::warn("qualified");',
      '  warn("builtin");',
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDebugCalls"])
  );

  assert.equal(
    countRule(issues, "noDebugCalls"),
    1,
    "Only the unqualified built-in-style warn() call should be flagged."
  );
  assert.ok(
    issues.every((issue) => issue.message.includes('warn(...)')),
    "Expected only the bare warn(...) call to be reported."
  );
}

function testDebugCallsAfterCaseLabelsAreReported(): void {
  const issues = runCase(
    "debug-calls-after-case-labels-are-reported",
    [
      "void Main(LogLevel level, const string &in msg) {",
      "  switch (level) {",
      "  case LogLevel::Warning : warn(msg);",
      "    break;",
      "  case LogLevel::Error :",
      "  case LogLevel::Critical : error(msg);",
      "    break;",
      "  default:",
      "    trace(msg);",
      "    break;",
      "  }",
      "}",
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDebugCalls"])
  );

  assert.equal(
    countRule(issues, "noDebugCalls"),
    3,
    "Expected warn, error, and trace calls in switch branches to be reported."
  );
  assert.ok(
    issues.some((issue) => issue.message.includes('warn(...)')),
    "Expected bare warn(...) after a case label to be reported."
  );
  assert.ok(
    issues.some((issue) => issue.message.includes('error(...)')),
    "Expected bare error(...) after a case label to be reported."
  );
}

function testAutoTypeIgnoreStringsAndComments(): void {
  const issues = runCase(
    "auto-type-ignore-non-code",
    [
      "void Main() {",
      '  string s = "auto fake";',
      "  // auto fakeComment;",
      "  /* auto fakeBlock; */",
      "  auto realValue = 1;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noAutoType"])
  );

  assert.equal(countRule(issues, "noAutoType"), 1);
}

function testTodoCommentsOnlyLineComments(): void {
  const issues = runCase(
    "todo-comments-line-only",
    [
      "void Main() {",
      '  string s = "// TODO inside string";',
      "  /* TODO inside block comment */",
      "  // TODO real marker",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noTodoComments"])
  );

  assert.equal(countRule(issues, "noTodoComments"), 1);
  const todoIssue = issues.find((issue) => issue.ruleId === "noTodoComments");
  assert.ok(todoIssue?.fix, "TODO issue should include a quick fix.");
}

function testNoEmptyCatchAndControlBody(): void {
  const issues = runCase(
    "empty-catch-and-control",
    [
      "void Main() {",
      "  try {",
      "    DoA();",
      "  } catch (Exception e) {",
      "  }",
      "  if (Ready()) ;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noEmptyCatch", "noEmptyControlBody"])
  );

  assert.equal(countRule(issues, "noEmptyCatch"), 1);
  assert.equal(countRule(issues, "noEmptyControlBody"), 1);
}

function testNoEmptyCatchAllowsDocumentedCommentOnlyBody(): void {
  const issues = runCase(
    "empty-catch-allows-documented-comment-only-body",
    [
      "void Main() {",
      "  try {",
      "    DoA();",
      "  } catch (Exception e) {",
      "    // Intentional: plugin should keep running after optional cleanup fails.",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noEmptyCatch"])
  );

  assert.equal(
    countRule(issues, "noEmptyCatch"),
    0,
    "Comment-only catch bodies should count as documented intent."
  );
}

function testUnusedLocalsAndParamsAndFixes(): void {
  const issues = runCase(
    "unused-locals-params",
    [
      "int Sum(int usedParam, int unusedParam, int _ignoredParam) {",
      "  int usedLocal = usedParam + 1;",
      "  int unusedLocal = 0;",
      "  return usedLocal;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnusedLocals", "noUnusedParams"])
  );

  assert.equal(countRule(issues, "noUnusedLocals"), 1);
  assert.equal(countRule(issues, "noUnusedParams"), 1);
  const unusedLocalIssue = issues.find((issue) => issue.ruleId === "noUnusedLocals");
  const unusedParamIssue = issues.find((issue) => issue.ruleId === "noUnusedParams");
  assert.ok(unusedLocalIssue?.fix, "Unused-local issue should include a quick fix.");
  assert.ok(unusedParamIssue?.fix, "Unused-param issue should include a quick fix.");
}

function testNoUnusedParamsTreatsWrittenOutParamsAsUsed(): void {
  const issues = runCase(
    "unused-params-out-write",
    [
      "bool BuildXml(string &out xmlOut, string &out errOut) {",
      "  xmlOut = \"\";",
      "  errOut = \"\";",
      "  return true;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnusedParams"])
  );

  assert.equal(
    countRule(issues, "noUnusedParams"),
    0,
    "Written out-params should count as used."
  );
}

function testNoUnusedParamsStillFlagsUntouchedOutParams(): void {
  const issues = runCase(
    "unused-params-out-untouched",
    [
      "bool BuildXml(string &out xmlOut, string &out errOut) {",
      "  xmlOut = \"\";",
      "  return true;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnusedParams"])
  );

  assert.equal(
    countRule(issues, "noUnusedParams"),
    1,
    "Untouched out-params should still be flagged."
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.ruleId === "noUnusedParams" && issue.message.includes("\"errOut\"")
    ),
    "Expected untouched out-parameter errOut to be reported."
  );
}

function testNoUnusedParamsTreatsContextualFromParameterAsUsed(): void {
  const issues = runCase(
    "unused-params-contextual-from",
    [
      "vec4 LerpColor(const vec4 &in from, const vec4 &in to, float factor) {",
      "  factor = Math::Clamp(factor, 0.0f, 1.0f);",
      "  return Math::Lerp(from, to, factor);",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnusedParams"])
  );

  assert.equal(
    countRule(issues, "noUnusedParams"),
    0,
    'Expected contextual parameter name "from" to be parsed and recognized as used.'
  );
}

function testNoShadowing(): void {
  const issues = runCase(
    "shadowing",
    [
      "void Main() {",
      "  int value = 1;",
      "  if (true) {",
      "    int value = 2;",
      "    print(value);",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noShadowing"])
  );

  assert.equal(countRule(issues, "noShadowing"), 1);
  const shadowIssue = issues.find((issue) => issue.ruleId === "noShadowing");
  assert.ok(shadowIssue?.fix, "Shadowing issue should include a quick fix.");
}

function testNoShadowingAllowsSequentialForLoopVariables(): void {
  const issues = runCase(
    "shadowing-allows-sequential-for-loop-variables",
    [
      "void Main(array<string>@ first, array<string>@ second) {",
      "  for (uint i = 0; i < first.Length; i++) {",
      "    print(first[i]);",
      "  }",
      "  for (uint i = 0; i < second.Length; i++) {",
      "    print(second[i]);",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noShadowing"])
  );

  assert.equal(
    countRule(issues, "noShadowing"),
    0,
    "AngelScript for-loop initializer variables are visible only within the loop statement."
  );
}

function testNoShadowingStillFlagsNestedForLoopVariables(): void {
  const issues = runCase(
    "shadowing-flags-nested-for-loop-variables",
    [
      "void Main(array<string>@ outer, array<string>@ inner) {",
      "  for (uint i = 0; i < outer.Length; i++) {",
      "    for (uint i = 0; i < inner.Length; i++) {",
      "      print(inner[i]);",
      "    }",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noShadowing"])
  );

  assert.equal(
    countRule(issues, "noShadowing"),
    1,
    "Nested for-loop variables should still warn when they shadow an active outer loop binding."
  );
}

function testForInitializerScopeExpiresAfterLoopStatement(): void {
  const issues = runCase(
    "for-initializer-scope-expires-after-loop-statement",
    [
      "void Main() {",
      "  for (uint i = 0; false; ) {",
      "  }",
      "  print(i);",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnusedLocals"])
  );

  assert.equal(
    countRule(issues, "noUnusedLocals"),
    1,
    "Reads after a for-loop statement should not count as uses of the expired loop variable."
  );
}

function testNoShadowingAllowsSequentialForeachVariables(): void {
  const issues = runCase(
    "shadowing-allows-sequential-foreach-variables",
    [
      "void Main(array<string>@ first, array<string>@ second) {",
      "  foreach (auto name : first) {",
      "    print(name);",
      "  }",
      "  foreach (auto name : second) {",
      "    print(name);",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noShadowing"])
  );

  assert.equal(
    countRule(issues, "noShadowing"),
    0,
    "Sequential foreach variables should not shadow after the previous loop statement ends."
  );
}

function testNoShadowingStillFlagsNestedForeachVariables(): void {
  const issues = runCase(
    "shadowing-flags-nested-foreach-variables",
    [
      "void Main(array<string>@ outer, array<string>@ inner) {",
      "  foreach (auto name : outer) {",
      "    foreach (auto name : inner) {",
      "      print(name);",
      "    }",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noShadowing"])
  );

  assert.equal(
    countRule(issues, "noShadowing"),
    1,
    "Nested foreach variables should still warn when they shadow an active outer loop binding."
  );
}

function testInactivePreprocessorLinesSuppressDiagnostics(): void {
  const issues = runCase(
    "inactive-preprocessor-lines-suppress-diagnostics",
    [
      "void Main() {",
      "#if 0",
      "  print(\"inactive\");",
      "#endif",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDebugCalls"])
  );

  assert.equal(
    countRule(issues, "noDebugCalls"),
    0,
    "Diagnostics in definitely inactive preprocessor regions should be suppressed."
  );
}

function testDuplicateDirectivesIgnoreInactivePreprocessorBranches(): void {
  const issues = runCase(
    "duplicate-directives-ignore-inactive-preprocessor-branches",
    [
      "#if 0",
      '#include "Core/Utils.as"',
      'import void Ping() from "Companion";',
      "#endif",
      '#include "Core/Utils.as"',
      'import void Ping() from "Companion";'
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDuplicateIncludes", "noDuplicateImports"])
  );

  assert.equal(
    countRule(issues, "noDuplicateIncludes"),
    0,
    "Inactive includes should not establish the canonical include for duplicate checks."
  );
  assert.equal(
    countRule(issues, "noDuplicateImports"),
    0,
    "Inactive imports should not establish the canonical import for duplicate checks."
  );
}

function testDuplicateImportsRespectNamespaces(): void {
  const issues = runCase(
    "duplicate-imports-respect-namespaces",
    [
      "namespace UiNav {",
      '  import bool ValidateRef(NodeRef@ r) from "UiNav";',
      "}",
      "namespace UiNav { namespace CT {",
      '  import bool ValidateRef(NodeRef@ r) from "UiNav";',
      "} }",
      "namespace UiNav { namespace ML {",
      '  import bool ValidateRef(NodeRef@ r) from "UiNav";',
      "} }"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDuplicateImports"])
  );

  assert.equal(
    countRule(issues, "noDuplicateImports"),
    0,
    "Imports with identical signatures in different namespaces should not be treated as duplicates."
  );
}

function testUnknownPreprocessorDefinesAreReported(): void {
  const issues = runCase(
    "unknown-preprocessor-defines-are-reported",
    [
      "string FormatHeaders(dictionary@ headers) {",
      "#if OPENPLANER_VERSION_1_29_6",
      "  return Text::Join(headers.GetKeys(), \"\\r\\n\");",
      "#elif OPENPLANER_VERSION_1_29_5_OR_EARLIER",
      "  return string::Join(headers.GetKeys(), \"\\r\\n\");",
      "#endif",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["preprocessor"])
  );

  assert.equal(
    countRule(issues, "preprocessor"),
    2,
    "Unknown preprocessor defines should be reported directly instead of surfacing only downstream control-flow fallout."
  );
}

function testKnownPreprocessorFamiliesStayPermissive(): void {
  const issues = runCase(
    "known-preprocessor-families-stay-permissive",
    [
      "void Main() {",
      "#if TMNEXT",
      "  print(\"tmnext\");",
      "#endif",
      "#if DEPENDENCY_CHAMPIONMEDALS && COMP_WEEKLY",
      "  print(\"dep\");",
      "#endif",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["preprocessor"]),
    {
      infoTomlText: [
        "[script]",
        "optional_dependencies = [\"ChampionMedals\"]"
      ].join("\n")
    }
  );

  assert.equal(
    countRule(issues, "preprocessor"),
    0,
    "Built-in, dependency, and competition-profile define families should remain accepted."
  );
}

function testOptionalDependencyUseRequiresGuard(): void {
  const issues = runCase(
    "optional-dependency-use-requires-guard",
    [
      "uint TryGetChampionTime() {",
      "  return ChampionMedals::GetCMTime();",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
    {
      infoTomlText: [
        "[script]",
        "optional_dependencies = [\"ChampionMedals\"]"
      ].join("\n")
    }
  );

  assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 1);
}

function testOptionalDependencyUseAcceptsDependencyGuard(): void {
  const issues = runCase(
    "optional-dependency-use-accepts-dependency-guard",
    [
      "uint TryGetChampionTime() {",
      "#if DEPENDENCY_CHAMPIONMEDALS",
      "  return ChampionMedals::GetCMTime();",
      "#endif",
      "  return 0;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
    {
      infoTomlText: [
        "[script]",
        "optional_dependencies = [\"ChampionMedals\"]"
      ].join("\n")
    }
  );

  assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 0);
}

function testOptionalDependencyUseAcceptsDefinedGuard(): void {
  const issues = runCase(
    "optional-dependency-use-accepts-defined-guard",
    [
      "uint TryGetChampionTime() {",
      "#if defined(DEPENDENCY_CHAMPIONMEDALS) && TMNEXT",
      "  return ChampionMedals::GetCMTime();",
      "#endif",
      "  return 0;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
    {
      infoTomlText: [
        "[script]",
        "optional_dependencies = [\"ChampionMedals\"]"
      ].join("\n")
    }
  );

  assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 0);
}

function testRequiredDependencyUseDoesNotRequireOptionalGuard(): void {
  const issues = runCase(
    "required-dependency-use-does-not-require-optional-guard",
    [
      "uint TryGetChampionTime() {",
      "  return ChampionMedals::GetCMTime();",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
    {
      infoTomlText: [
        "[script]",
        "dependencies = [\"ChampionMedals\"]"
      ].join("\n")
    }
  );

  assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 0);
}

function testOptionalDependencyImportRequiresGuard(): void {
  const issues = runCase(
    "optional-dependency-import-requires-guard",
    [
      "import uint GetCMTime() from \"ChampionMedals\";",
      "void Main() {}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
    {
      infoTomlText: [
        "[script]",
        "optional_dependencies = [\"ChampionMedals\"]"
      ].join("\n")
    }
  );

  assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 1);
}

function testOptionalDependencyExportedGlobalFunctionRequiresGuard(): void {
  const pluginsRoot = createDependencyPluginFixture(
    "ChampionMedals",
    [
      "[script]",
      "exports = [\"Exports.as\"]"
    ].join("\n"),
    "uint GetCMTime() { return 1; }\n"
  );

  try {
    const issues = runCase(
      "optional-dependency-exported-global-function-requires-guard",
      [
        "uint TryGetChampionTime() {",
        "  return GetCMTime();",
        "}"
      ].join("\n"),
      (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
      {
        pluginRoots: [pluginsRoot],
        infoTomlText: [
          "[script]",
          "optional_dependencies = [\"ChampionMedals\"]"
        ].join("\n")
      }
    );

    assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 1);
    assert.ok(
      issues.some((issue) => issue.message.includes("ChampionMedals")),
      "Expected diagnostic to reference the optional dependency name."
    );
  } finally {
    fs.rmSync(pluginsRoot, { recursive: true, force: true });
  }
}

function testOptionalDependencyExportedNamespaceAliasRequiresGuard(): void {
  const pluginsRoot = createDependencyPluginFixture(
    "ChampionMedals",
    [
      "[script]",
      "shared_exports = [\"Exports.as\"]"
    ].join("\n"),
    [
      "namespace CM {",
      "  uint GetTime() { return 1; }",
      "}"
    ].join("\n")
  );

  try {
    const issues = runCase(
      "optional-dependency-exported-namespace-alias-requires-guard",
      [
        "uint TryGetChampionTime() {",
        "  return CM::GetTime();",
        "}"
      ].join("\n"),
      (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
      {
        pluginRoots: [pluginsRoot],
        infoTomlText: [
          "[script]",
          "optional_dependencies = [\"ChampionMedals\"]"
        ].join("\n")
      }
    );

    assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 1);
  } finally {
    fs.rmSync(pluginsRoot, { recursive: true, force: true });
  }
}

function testOptionalDependencyExportedTypeRequiresGuard(): void {
  const pluginsRoot = createDependencyPluginFixture(
    "PVM",
    [
      "[script]",
      "exports = [\"Exports.as\"]"
    ].join("\n"),
    "class PVMJsonSource {}\n"
  );

  try {
    const issues = runCase(
      "optional-dependency-exported-type-requires-guard",
      [
        "void Main() {",
        "  PVMJsonSource@ source;",
        "}"
      ].join("\n"),
      (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
      {
        pluginRoots: [pluginsRoot],
        infoTomlText: [
          "[script]",
          "optional_dependencies = [\"PVM\"]"
        ].join("\n")
      }
    );

    assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 1);
  } finally {
    fs.rmSync(pluginsRoot, { recursive: true, force: true });
  }
}

function testOptionalDependencyExportedEnumRequiresGuard(): void {
  const pluginsRoot = createDependencyPluginFixture(
    "MedalPack",
    [
      "[script]",
      "exports = [\"Exports.as\"]"
    ].join("\n"),
    "enum MedalKind { Champion }\n"
  );

  try {
    const issues = runCase(
      "optional-dependency-exported-enum-requires-guard",
      [
        "void Main() {",
        "  MedalKind kind = MedalKind::Champion;",
        "}"
      ].join("\n"),
      (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
      {
        pluginRoots: [pluginsRoot],
        infoTomlText: [
          "[script]",
          "optional_dependencies = [\"MedalPack\"]"
        ].join("\n")
      }
    );

    assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 1);
  } finally {
    fs.rmSync(pluginsRoot, { recursive: true, force: true });
  }
}

function testOptionalDependencyExportedSymbolAllowsLocalDeclaration(): void {
  const pluginsRoot = createDependencyPluginFixture(
    "ChampionMedals",
    [
      "[script]",
      "exports = [\"Exports.as\"]"
    ].join("\n"),
    "uint GetCMTime() { return 1; }\n"
  );

  try {
    const issues = runCase(
      "optional-dependency-exported-symbol-allows-local-declaration",
      [
        "uint GetCMTime() { return 0; }",
        "uint TryGetChampionTime() {",
        "  return GetCMTime();",
        "}"
      ].join("\n"),
      (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
      {
        pluginRoots: [pluginsRoot],
        infoTomlText: [
          "[script]",
          "optional_dependencies = [\"ChampionMedals\"]"
        ].join("\n")
      }
    );

    assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 0);
  } finally {
    fs.rmSync(pluginsRoot, { recursive: true, force: true });
  }
}

function testOptionalDependencyExportsFromOpArchiveRequireGuard(): void {
  const pluginsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "op-linter-deps-op-"));
  fs.writeFileSync(
    path.join(pluginsRoot, "ChampionMedals.op"),
    buildStoredZip({
      "info.toml": [
        "[script]",
        "exports = [\"Exports.as\"]"
      ].join("\n"),
      "Exports.as": "uint GetCMTime() { return 1; }\n"
    })
  );

  try {
    const issues = runCase(
      "optional-dependency-exports-from-op-archive-require-guard",
      [
        "uint TryGetChampionTime() {",
        "  return GetCMTime();",
        "}"
      ].join("\n"),
      (settings) => enableOnly(settings, ["noUnguardedOptionalDependency"]),
      {
        pluginRoots: [pluginsRoot],
        infoTomlText: [
          "[script]",
          "optional_dependencies = [\"ChampionMedals\"]"
        ].join("\n")
      }
    );

    assert.equal(countRule(issues, "noUnguardedOptionalDependency"), 1);
  } finally {
    fs.rmSync(pluginsRoot, { recursive: true, force: true });
  }
}

function createDependencyPluginFixture(
  dependencyName: string,
  infoTomlText: string,
  exportText: string
): string {
  const pluginsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "op-linter-deps-"));
  const dependencyRoot = path.join(pluginsRoot, dependencyName);
  fs.mkdirSync(dependencyRoot, { recursive: true });
  fs.writeFileSync(path.join(dependencyRoot, "info.toml"), infoTomlText, "utf8");
  fs.writeFileSync(path.join(dependencyRoot, "Exports.as"), exportText, "utf8");
  return pluginsRoot;
}

function buildStoredZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [entryName, text] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(entryName, "utf8");
    const dataBuffer = Buffer.from(text, "utf8");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(Object.keys(entries).length, 8);
  endRecord.writeUInt16LE(Object.keys(entries).length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localData.length, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localData, centralDirectory, endRecord]);
}

function testNoUnreachableCode(): void {
  const issues = runCase(
    "unreachable",
    [
      "void Main() {",
      "  return;",
      "  int shouldFlag = 1;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnreachableCode"])
  );

  assert.equal(countRule(issues, "noUnreachableCode"), 1);
  const unreachableIssue = issues.find((issue) => issue.ruleId === "noUnreachableCode");
  assert.ok(unreachableIssue?.fix, "Unreachable-code issue should include a quick fix.");
}

function testNoUnreachableCodeIgnoresConditionalEarlyReturn(): void {
  const issues = runCase(
    "unreachable-ignores-conditional-early-return",
    [
      "int NthIndexOf(const string &in str, const string &in value, int n) {",
      "  if (n <= 0) return -1;",
      "  int len = int(str.Length);",
      "  int vlen = int(value.Length);",
      "  if (vlen <= 0 || vlen > len) return -1;",
      "  return len + vlen;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnreachableCode"])
  );

  assert.equal(
    countRule(issues, "noUnreachableCode"),
    0,
    "Conditional early returns should not make following lines unreachable."
  );
}

function testNoUnreachableCodeIgnoresElseContinuation(): void {
  const issues = runCase(
    "unreachable-ignores-else-continuation",
    [
      "int Pick(bool cond) {",
      "  if (cond) {",
      "    return 1;",
      "  } else {",
      "    return 2;",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnreachableCode"])
  );

  assert.equal(
    countRule(issues, "noUnreachableCode"),
    0,
    "Else continuation after a return in the if-branch should not be unreachable."
  );
}

function testNoUnreachableCodeIgnoresCatchContinuation(): void {
  const issues = runCase(
    "unreachable-ignores-catch-continuation",
    [
      "int Recover() {",
      "  try {",
      "    return 1;",
      "  } catch {",
      "    return 2;",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnreachableCode"])
  );

  assert.equal(
    countRule(issues, "noUnreachableCode"),
    0,
    "Catch continuation after a return in try should not be unreachable."
  );
}

function testNoUnreachableCodeIgnoresPreprocessorAlternativeBranches(): void {
  const issues = runCase(
    "unreachable-ignores-preprocessor-alternative-branches",
    [
      "bool IsCustomMedalsAvailable() {",
      "#if DEPENDENCY_CUSTOMMEDALS",
      '  return PluginState::IsPluginLoaded("CustomMedals", "Custom Medals");',
      "#else",
      "  return false;",
      "#endif",
      "}",
      "",
      "void Main() {",
      "#if DEPENDENCY_CUSTOMMEDALS",
      "  return;",
      "  int stillUnreachableInSameBranch = 1;",
      "#endif",
      "  int reachableWhenDependencyMissing = 2;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnreachableCode"])
  );

  assert.equal(
    countRule(issues, "noUnreachableCode"),
    1,
    "Preprocessor alternative branches and code after #endif should reset reachability."
  );
  assert.ok(
    issues.some((issue) => issue.range.start.line === 11),
    "Code after a return in the same preprocessor branch should still be reported."
  );
}

function testStringByValueAndImplicitFloatToInt(): void {
  const issues = runCase(
    "string-by-value-float-to-int",
    [
      "int Convert(string msg, const string &in stable) {",
      "  int value = 1.25;",
      "  value = 2.5;",
      "  return 3.75;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noStringByValueParam", "noImplicitFloatToInt"])
  );

  assert.equal(countRule(issues, "noStringByValueParam"), 1);
  assert.ok(countRule(issues, "noImplicitFloatToInt") >= 2);
  const byValueIssue = issues.find((issue) => issue.ruleId === "noStringByValueParam");
  assert.ok(byValueIssue?.fix, "String-by-value issue should include a quick fix.");
}

function testImplicitFloatToIntAllowsPrimitiveConstructorCasts(): void {
  const issues = runCase(
    "implicit-float-to-int-allows-primitive-constructor-casts",
    [
      "uint Convert(uint authorTime) {",
      "  uint cached = int(Math::Floor(1.25f));",
      "  return uint(Math::Floor(float(authorTime) * 0.085f) * 10.0f);",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noImplicitFloatToInt"])
  );

  assert.equal(
    countRule(issues, "noImplicitFloatToInt"),
    0,
    "Primitive constructor casts like uint(...) and int(...) should count as explicit integer casts."
  );
}

function testImplicitFloatToIntIgnoresFloatArgumentsInReturnedCalls(): void {
  const issues = runCase(
    "implicit-float-to-int-ignores-float-arguments-in-returned-calls",
    [
      "uint _PercentileMs(const string &in name, float pct) {",
      "  return 0;",
      "}",
      "uint P50Ms(const string &in name) {",
      "  return _PercentileMs(name, 0.50f);",
      "}",
      "uint DirectFloat() {",
      "  return 0.50f;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noImplicitFloatToInt"])
  );

  assert.equal(
    countRule(issues, "noImplicitFloatToInt"),
    1,
    "Float literals used as call arguments should not be treated as the returned value, but direct float returns should still be flagged."
  );
}

function testStringByValueParamIgnoresUnderscorePrefix(): void {
  const issues = runCase(
    "string-by-value-underscore-prefix",
    [
      "void WriteFile(string _path, string visible) {",
      "  print(_path);",
      "  print(visible);",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noStringByValueParam"])
  );

  assert.equal(
    countRule(issues, "noStringByValueParam"),
    1,
    "Underscore-prefixed string parameter should be ignored by noStringByValueParam."
  );
  assert.ok(
    issues.every((issue) => !issue.message.includes("\"_path\"")),
    "Expected no string-by-value issue for underscore-prefixed parameter _path."
  );
}

function testUnusedParamsHandlesDefaultValueIdentifiers(): void {
  const issues = runCase(
    "unused-params-default-value-identifiers",
    [
      "string pluginName = Meta::ExecutingPlugin().Name;",
      "void NotifyInfo(const string &in msg = \"\", const string &in pn = pluginName, int t = 6000) {",
      "  print(msg);",
      "  print(pn);",
      "  print(t);",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnusedParams"])
  );

  assert.equal(
    countRule(issues, "noUnusedParams"),
    0,
    "Default-value identifiers should not be misparsed as parameter names."
  );
}

function testNewRulesDeadStoreDuplicateConstCast(): void {
  const issues = runCase(
    "new-rules",
    [
      '#include "Core/Utils.as"',
      '#include "Core/Utils.as"',
      'import void Ping() from "Companion";',
      'import void Ping() from "Companion";',
      "void Main() {",
      "  int dead = 1;",
      "  dead = 2;",
      "  dead = 3;",
      "  int constCandidate = 4;",
      "  MyType@ handle = cast<MyType@>(GetObj());",
      "  print(handle);",
      "}"
    ].join("\n"),
    (settings) =>
      enableOnly(settings, [
        "noDeadStore",
        "noDuplicateIncludes",
        "noDuplicateImports",
        "preferConstLocals",
        "noRiskyHandleCast"
      ])
  );

  assert.ok(countRule(issues, "noDeadStore") >= 1);
  assert.equal(countRule(issues, "noDuplicateIncludes"), 1);
  assert.equal(countRule(issues, "noDuplicateImports"), 1);
  assert.ok(countRule(issues, "preferConstLocals") >= 1);
  assert.equal(countRule(issues, "noRiskyHandleCast"), 1);

  const includeIssue = issues.find((issue) => issue.ruleId === "noDuplicateIncludes");
  const importIssue = issues.find((issue) => issue.ruleId === "noDuplicateImports");
  const constIssue = issues.find((issue) => issue.ruleId === "preferConstLocals");
  assert.ok(includeIssue?.fix, "Duplicate include should include a quick fix.");
  assert.ok(importIssue?.fix, "Duplicate import should include a quick fix.");
  assert.ok(constIssue?.fix, "Prefer-const issue should include a quick fix.");
  const deadStoreIssue = issues.find((issue) => issue.ruleId === "noDeadStore" && issue.fix);
  assert.ok(deadStoreIssue?.fix, "Dead-store issue should include a safe quick fix.");
}

function testNoRiskyHandleCastAllowsImmediateNullContinueGuard(): void {
  const issues = runCase(
    "handle-cast-immediate-null-continue-guard",
    [
      "class MyType {}",
      "MyType@ GetObj() { return null; }",
      "",
      "void Main() {",
      "  MyType@ handle = cast<MyType@>(GetObj());",
      "  if (handle is null) return;",
      "  print(handle);",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noRiskyHandleCast"])
  );

  assert.equal(
    countRule(issues, "noRiskyHandleCast"),
    0,
    "A handle cast assigned once and immediately null-guarded with early exit should not warn."
  );
}

function testNoDeadStoreAllowsSelfReferentialReassignment(): void {
  const issues = runCase(
    "dead-store-self-referential-reassignment",
    [
      "void Main() {",
      "  string trimmedPath = \"hello/world\";",
      "  int index = trimmedPath.LastIndexOf(\"/\");",
      "  int index2 = trimmedPath.LastIndexOf(\"\\\\\");",
      "  index = Math::Max(index, index2);",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDeadStore"])
  );

  assert.equal(
    countRule(issues, "noDeadStore"),
    0,
    "Self-referential reassignment should count as reading the previous value."
  );
}

function testNoDeadStoreIgnoresIfElseBranchAssignments(): void {
  const issues = runCase(
    "dead-store-ignores-if-else-branch-assignments",
    [
      "void RenameFile(const string &in filePath, const string &in newFileName) {",
      "  string currentPath = filePath;",
      "  string newPath;",
      "  string sanitizedNewName = newFileName;",
      "  if (Directory::IsDirectory(newPath)) {",
      "    string parentDirectory = Path::GetDirectoryName(currentPath);",
      "    newPath = Path::Join(parentDirectory, sanitizedNewName);",
      "  } else {",
      "    string directoryPath = Path::GetDirectoryName(currentPath);",
      "    string extension = Path::GetExtension(currentPath);",
      "    newPath = Path::Join(directoryPath, sanitizedNewName + extension);",
      "  }",
      "  IO::Move(currentPath, newPath);",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDeadStore"])
  );

  assert.equal(
    countRule(issues, "noDeadStore"),
    0,
    "if/else branch writes to the same variable should not be flagged as dead stores before post-branch use."
  );
}

function testPreferConstLocalsIgnoresIndexedAndMemberWrites(): void {
  const issues = runCase(
    "prefer-const-ignores-indexed-member-writes",
    [
      "void Main() {",
      "  Json::Value j = Json::Object();",
      '  j[\"name\"] = Meta::ExecutingPlugin().Name;',
      '  j[\"version\"] = \"1.0.0\";',
      "  j.author = Meta::ExecutingPlugin().Author;",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["preferConstLocals"])
  );

  assert.equal(
    countRule(issues, "preferConstLocals"),
    0,
    "Indexed/member assignments should count as writes and prevent preferConstLocals diagnostics."
  );
}

function testPreferConstLocalsIgnoresHandlesReferencesAndAuto(): void {
  const issues = runCase(
    "prefer-const-ignores-handles-references-auto",
    [
      "class Foo {",
      "  void Mutate() {}",
      "}",
      "",
      "void Main() {",
      "  Foo@ handleValue = Foo();",
      "  Foo &refValue = handleValue;",
      "  auto inferred = handleValue;",
      "  int stableNumber = 42;",
      "  handleValue.Mutate();",
      "  inferred.Mutate();",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["preferConstLocals"])
  );

  const constIssues = issues.filter((issue) => issue.ruleId === "preferConstLocals");
  const names = constIssues.map((issue) => {
    const match = /"([^"]+)"/.exec(issue.message);
    return match ? match[1] : "";
  });

  assert.ok(!names.includes("handleValue"));
  assert.ok(!names.includes("refValue"));
  assert.ok(!names.includes("inferred"));
  assert.ok(
    names.includes("stableNumber"),
    "Primitive locals should still be eligible for preferConstLocals."
  );
}

function testSuppressionsEnableAndBlockScopes(): void {
  const issues = runCase(
    "suppressions-enable-block",
    [
      "void Main() {",
      "  // oplint-disable-start noDebugCalls",
      '  print("muted-block");',
      "  // oplint-disable-end noDebugCalls",
      '  print("reported-a");',
      "  // oplint-disable noDebugCalls",
      '  print("muted-file");',
      "  // oplint-enable noDebugCalls",
      '  print("reported-b");',
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDebugCalls"])
  );

  assert.equal(countRule(issues, "noDebugCalls"), 2);
}

function testSuppressionsAllowWildcardWhenRuleIdOmitted(): void {
  const issues = runCase(
    "suppressions-wildcard-when-rule-id-omitted",
    [
      "void Main() {",
      "  // oplint-disable",
      '  print("muted");',
      "  // oplint-enable",
      '  print("reported");',
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDebugCalls"])
  );

  assert.equal(
    countRule(issues, "noDebugCalls"),
    1,
    "Expected oplint-disable/oplint-enable without rule ids to behave as wildcard suppression."
  );
}

function testSuppressNextLineDirective(): void {
  const issues = runCase(
    "suppress-next-line",
    [
      "void Main() {",
      "  // oplint-disable-next-line noDebugCalls",
      '  print("muted");',
      '  print("reported");',
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDebugCalls"])
  );

  assert.equal(countRule(issues, "noDebugCalls"), 1);
}

function testAngleCommentFenceSuppressesComplaints(): void {
  const issues = runCase(
    "angle-comment-fence-suppresses-complaints",
    [
      "void Main() {",
      "  ///<",
      '  print("muted");',
      "  // TODO muted",
      "  ///>",
      '  print("reported");',
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noDebugCalls", "noTodoComments"])
  );

  assert.equal(
    countRule(issues, "noDebugCalls"),
    1,
    "Expected debug-call diagnostics inside ///< ///> fence to be suppressed."
  );
  assert.equal(
    countRule(issues, "noTodoComments"),
    0,
    "Expected TODO diagnostics inside ///< ///> fence to be suppressed."
  );
}

function testMaxDiagnosticsCap(): void {
  const issues = runCase(
    "max-diagnostics-cap",
    [
      "void Main() {",
      "  // TODO one",
      "  // TODO two",
      '  print("x");',
      "}"
    ].join("\n"),
    (settings) => {
      enableOnly(settings, ["noTodoComments", "noDebugCalls"]);
      settings.maxDiagnostics = 2;
    }
  );

  assert.equal(issues.length, 2);
}

function testMediumCorpusSnapshot(): void {
  const corpusPath = path.join(
    process.cwd(),
    "test-files",
    "linter-corpus",
    "medium-corpus.as"
  );
  const snapshotPath = path.join(
    process.cwd(),
    "test-files",
    "linter-corpus",
    "medium-corpus.snapshot.json"
  );

  const text = fs.readFileSync(corpusPath, "utf8");
  const issues = runCase("medium-corpus-snapshot", text, (settings) => {
    enableOnly(settings, allRuleIds);
  });

  const observedCounts = {} as Record<RuleId, number>;
  for (const ruleId of allRuleIds) {
    observedCounts[ruleId] = countRule(issues, ruleId);
  }

  const observedSnapshot = {
    totalIssues: issues.length,
    ruleCounts: observedCounts,
    issues: issues
      .map((issue) => ({
        ruleId: issue.ruleId,
        severity: issue.severity,
        message: issue.message,
        line: issue.range.start.line,
        character: issue.range.start.character
      }))
      .sort((left, right) => {
        if (left.line !== right.line) return left.line - right.line;
        if (left.character !== right.character) return left.character - right.character;
        if (left.ruleId !== right.ruleId) return left.ruleId.localeCompare(right.ruleId);
        return left.message.localeCompare(right.message);
      })
  };

  if (process.argv.includes("--update-snapshot")) {
    fs.writeFileSync(snapshotPath, `${JSON.stringify(observedSnapshot, null, 2)}\n`, "utf8");
    return;
  }

  const expected = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  assert.deepEqual(observedSnapshot, expected);
}

function testStringPrefixesDoNotCountAsIdentifierReads(): void {
  const issues = runCase(
    "string-prefixes-do-not-count-as-reads",
    [
      "void Main() {",
      "  int n = 0;",
      "  int f = 1;",
      '  string a = n"hello";',
      '  string b = f"world";',
      "  Ping(a);",
      "  Ping(b);",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noUnusedLocals"])
  );

  assert.equal(countRule(issues, "noUnusedLocals"), 2);
  const names = issues
    .map((issue) => issue.message)
    .sort();
  assert.ok(names.some((message) => message.includes('"n"')));
  assert.ok(names.some((message) => message.includes('"f"')));
}

function testForInitializerDeclarationsAreModeled(): void {
  const issues = runCase(
    "for-initializer-declarations-are-modeled",
    [
      "void Main() {",
      "  for (const int i = 0, j = 1; i < 1; i++) {",
      "    print(i);",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["preferConstLocals", "noUnusedLocals"])
  );

  const unusedI = issues.find(
    (issue) => issue.ruleId === "noUnusedLocals" && issue.message.includes('"i"')
  );
  const unusedJ = issues.find(
    (issue) => issue.ruleId === "noUnusedLocals" && issue.message.includes('"j"')
  );
  assert.equal(unusedI, undefined, "Loop variable i should be recognized as used.");
  assert.ok(unusedJ, "Loop variable j should be recognized as declared and unused.");

  const preferConstJ = issues.find(
    (issue) => issue.ruleId === "preferConstLocals" && issue.message.includes('"j"')
  );
  assert.equal(
    preferConstJ,
    undefined,
    "Const for-loop declarations should not trigger preferConstLocals."
  );
}

function testWorkspaceCorpusSnapshot(): void {
  const corpusRoot = path.join(
    process.cwd(),
    "test-files",
    "linter-corpus",
    "workspace"
  );
  const snapshotPath = path.join(
    process.cwd(),
    "test-files",
    "linter-corpus",
    "workspace.snapshot.json"
  );

  const corpusFiles = fs
    .readdirSync(corpusRoot)
    .filter((entry) => entry.toLowerCase().endsWith(".as"))
    .sort((left, right) => left.localeCompare(right));

  const aggregateCounts = {} as Record<RuleId, number>;
  for (const ruleId of allRuleIds) {
    aggregateCounts[ruleId] = 0;
  }

  const fileSnapshots = corpusFiles.map((fileName) => {
    const filePath = path.join(corpusRoot, fileName);
    const text = fs.readFileSync(filePath, "utf8");
    const issues = runCase(`workspace-corpus-${fileName}`, text, (settings) => {
      enableOnly(settings, allRuleIds);
    });

    const ruleCounts = {} as Record<RuleId, number>;
    for (const ruleId of allRuleIds) {
      const count = countRule(issues, ruleId);
      ruleCounts[ruleId] = count;
      aggregateCounts[ruleId] += count;
    }

    return {
      fileName,
      totalIssues: issues.length,
      ruleCounts,
      issues: issues
        .map((issue) => ({
          ruleId: issue.ruleId,
          severity: issue.severity,
          message: issue.message,
          line: issue.range.start.line,
          character: issue.range.start.character
        }))
        .sort((left, right) => {
          if (left.line !== right.line) return left.line - right.line;
          if (left.character !== right.character) return left.character - right.character;
          if (left.ruleId !== right.ruleId) return left.ruleId.localeCompare(right.ruleId);
          return left.message.localeCompare(right.message);
        })
    };
  });

  const observedSnapshot = {
    totalFiles: corpusFiles.length,
    totalIssues: fileSnapshots.reduce((sum, file) => sum + file.totalIssues, 0),
    aggregateRuleCounts: aggregateCounts,
    files: fileSnapshots
  };

  if (process.argv.includes("--update-snapshot")) {
    fs.writeFileSync(snapshotPath, `${JSON.stringify(observedSnapshot, null, 2)}\n`, "utf8");
    return;
  }

  const expected = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  assert.deepEqual(observedSnapshot, expected);
}

function main(): void {
  testDebugCallsIgnoreStringsAndComments();
  testDebugCallsIgnoreQualifiedAndLocalDebugNames();
  testDebugCallsAfterCaseLabelsAreReported();
  testAutoTypeIgnoreStringsAndComments();
  testTodoCommentsOnlyLineComments();
  testNoEmptyCatchAndControlBody();
  testNoEmptyCatchAllowsDocumentedCommentOnlyBody();
  testUnusedLocalsAndParamsAndFixes();
  testNoUnusedParamsTreatsWrittenOutParamsAsUsed();
  testNoUnusedParamsStillFlagsUntouchedOutParams();
  testNoUnusedParamsTreatsContextualFromParameterAsUsed();
  testNoShadowing();
  testNoShadowingAllowsSequentialForLoopVariables();
  testNoShadowingStillFlagsNestedForLoopVariables();
  testForInitializerScopeExpiresAfterLoopStatement();
  testNoShadowingAllowsSequentialForeachVariables();
  testNoShadowingStillFlagsNestedForeachVariables();
  testInactivePreprocessorLinesSuppressDiagnostics();
  testDuplicateDirectivesIgnoreInactivePreprocessorBranches();
  testDuplicateImportsRespectNamespaces();
  testUnknownPreprocessorDefinesAreReported();
  testKnownPreprocessorFamiliesStayPermissive();
  testOptionalDependencyUseRequiresGuard();
  testOptionalDependencyUseAcceptsDependencyGuard();
  testOptionalDependencyUseAcceptsDefinedGuard();
  testRequiredDependencyUseDoesNotRequireOptionalGuard();
  testOptionalDependencyImportRequiresGuard();
  testOptionalDependencyExportedGlobalFunctionRequiresGuard();
  testOptionalDependencyExportedNamespaceAliasRequiresGuard();
  testOptionalDependencyExportedTypeRequiresGuard();
  testOptionalDependencyExportedEnumRequiresGuard();
  testOptionalDependencyExportedSymbolAllowsLocalDeclaration();
  testOptionalDependencyExportsFromOpArchiveRequireGuard();
  testNoUnreachableCode();
  testNoUnreachableCodeIgnoresConditionalEarlyReturn();
  testNoUnreachableCodeIgnoresElseContinuation();
  testNoUnreachableCodeIgnoresCatchContinuation();
  testNoUnreachableCodeIgnoresPreprocessorAlternativeBranches();
  testStringByValueAndImplicitFloatToInt();
  testImplicitFloatToIntAllowsPrimitiveConstructorCasts();
  testImplicitFloatToIntIgnoresFloatArgumentsInReturnedCalls();
  testStringByValueParamIgnoresUnderscorePrefix();
  testUnusedParamsHandlesDefaultValueIdentifiers();
  testNewRulesDeadStoreDuplicateConstCast();
  testNoRiskyHandleCastAllowsImmediateNullContinueGuard();
  testNoDeadStoreAllowsSelfReferentialReassignment();
  testNoDeadStoreIgnoresIfElseBranchAssignments();
  testPreferConstLocalsIgnoresIndexedAndMemberWrites();
  testPreferConstLocalsIgnoresHandlesReferencesAndAuto();
  testSuppressionsEnableAndBlockScopes();
  testSuppressionsAllowWildcardWhenRuleIdOmitted();
  testSuppressNextLineDirective();
  testAngleCommentFenceSuppressesComplaints();
  testMaxDiagnosticsCap();
  testStringPrefixesDoNotCountAsIdentifierReads();
  testForInitializerDeclarationsAreModeled();
  testMediumCorpusSnapshot();
  testWorkspaceCorpusSnapshot();
  console.log("Linter regression tests passed.");
}

main();
