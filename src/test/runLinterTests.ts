import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
  "noImplicitFloatToInt",
  "noDeadStore",
  "noDuplicateIncludes",
  "noDuplicateImports",
  "preferConstLocals",
  "noRiskyHandleCast"
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
      noImplicitFloatToInt: { enable: true, severity: "warning" },
      noDeadStore: { enable: true, severity: "warning" },
      noDuplicateIncludes: { enable: true, severity: "warning" },
      noDuplicateImports: { enable: true, severity: "warning" },
      preferConstLocals: { enable: true, severity: "info" },
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
  testAutoTypeIgnoreStringsAndComments();
  testTodoCommentsOnlyLineComments();
  testNoEmptyCatchAndControlBody();
  testUnusedLocalsAndParamsAndFixes();
  testNoShadowing();
  testNoUnreachableCode();
  testStringByValueAndImplicitFloatToInt();
  testNewRulesDeadStoreDuplicateConstCast();
  testSuppressionsEnableAndBlockScopes();
  testSuppressNextLineDirective();
  testMaxDiagnosticsCap();
  testStringPrefixesDoNotCountAsIdentifierReads();
  testForInitializerDeclarationsAreModeled();
  testMediumCorpusSnapshot();
  testWorkspaceCorpusSnapshot();
  console.log("Linter regression tests passed.");
}

main();
