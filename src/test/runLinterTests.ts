import assert from "node:assert/strict";

import { runLinter } from "../linter/engine";
import type {
  LintIssue,
  LinterSettings,
  RuleId
} from "../linter/types";

const allRuleIds: RuleId[] = [
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
  "noImplicitFloatToInt"
];

function createSettings(): LinterSettings {
  return {
    enable: true,
    profile: "custom",
    maxDiagnostics: 250,
    rules: {
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
      noImplicitFloatToInt: { enable: true, severity: "warning" }
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
  configure?: (settings: LinterSettings) => void
): LintIssue[] {
  const settings = createSettings();
  configure?.(settings);
  const issues = runLinter(text, settings);
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

function testNoEmptyCatch(): void {
  const issues = runCase(
    "empty-catch",
    [
      "void Main() {",
      "  try {",
      "    DoA();",
      "  } catch (Exception e) {",
      "  }",
      "",
      "  try {",
      "    DoB();",
      "  } catch {",
      "    // intentionally ignored",
      "  }",
      "",
      "  try {",
      "    DoC();",
      "  } catch (Exception e) {",
      "    trace(e);",
      "  }",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noEmptyCatch"])
  );

  assert.equal(countRule(issues, "noEmptyCatch"), 2);
}

function testNoEmptyControlBodyAndDoWhileExclusion(): void {
  const issues = runCase(
    "empty-control-bodies",
    [
      "void Main() {",
      "  if (Ready()) ;",
      "  for (int i = 0; i < 3; i++) ;",
      "  while (Ready()) ;",
      "  do {",
      "    DoWork();",
      "  } while (Ready());",
      "}"
    ].join("\n"),
    (settings) => enableOnly(settings, ["noEmptyControlBody"])
  );

  assert.equal(countRule(issues, "noEmptyControlBody"), 3);
}

function testUnusedLocalsAndParams(): void {
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

function main(): void {
  testDebugCallsIgnoreStringsAndComments();
  testAutoTypeIgnoreStringsAndComments();
  testTodoCommentsOnlyLineComments();
  testNoEmptyCatch();
  testNoEmptyControlBodyAndDoWhileExclusion();
  testUnusedLocalsAndParams();
  testNoShadowing();
  testNoUnreachableCode();
  testStringByValueAndImplicitFloatToInt();
  testSuppressionsEnableAndBlockScopes();
  testSuppressNextLineDirective();
  testMaxDiagnosticsCap();
  console.log("Linter regression tests passed.");
}

main();
