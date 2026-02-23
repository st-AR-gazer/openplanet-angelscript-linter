import * as vscode from "vscode";
import { runLinter } from "./linter/engine";
import { getLinterSettings } from "./linter/settings";
import type { LintIssue, LintSeverity, TextRange } from "./linter/types";

const lintCollectionName = "openplanet-angelscript-linter";
const lintDebounceMs = 150;
const diagnosticSource = "openplanet-angelscript-linter";
const relintCommand = "openplanetAngelscriptLinter.relint";
const applyPreferConstFixCommand =
  "openplanetAngelscriptLinter.applyPreferConstFixAtLine";
const preferConstRuleId = "preferConstLocals";

let diagnosticsCollection: vscode.DiagnosticCollection | undefined;
const pendingLintTimers = new Map<string, ReturnType<typeof setTimeout>>();
const cachedIssuesByUri = new Map<string, LintIssue[]>();
const codeLensChangeEmitter = new vscode.EventEmitter<void>();

export function activate(context: vscode.ExtensionContext): void {
  diagnosticsCollection = vscode.languages.createDiagnosticCollection(
    lintCollectionName
  );
  context.subscriptions.push(diagnosticsCollection);
  context.subscriptions.push(codeLensChangeEmitter);

  const lintOpenDocuments = (): void => {
    for (const document of vscode.workspace.textDocuments) {
      scheduleLint(document, 0);
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      scheduleLint(document, 0);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      scheduleLint(event.document, lintDebounceMs);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      scheduleLint(document, 0);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      clearPendingLint(document.uri.toString());
      diagnosticsCollection?.delete(document.uri);
      cachedIssuesByUri.delete(document.uri.toString());
      codeLensChangeEmitter.fire();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("openplanetAngelscriptLinter")) {
        return;
      }

      lintOpenDocuments();
      codeLensChangeEmitter.fire();
    }),
    vscode.commands.registerCommand(
      relintCommand,
      () => {
        lintOpenDocuments();
      }
    ),
    vscode.commands.registerCommand(
      applyPreferConstFixCommand,
      async (uri?: vscode.Uri, line?: number) => {
        await applyPreferConstFixAtLine(uri, line);
      }
    ),
    vscode.languages.registerCodeActionsProvider(
      { language: "openplanet-angelscript" },
      {
        provideCodeActions(document, _range, context) {
          return provideLintCodeActions(document, context.diagnostics);
        }
      },
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
      }
    ),
    vscode.languages.registerCodeLensProvider(
      { language: "openplanet-angelscript" },
      {
        onDidChangeCodeLenses: codeLensChangeEmitter.event,
        provideCodeLenses(document) {
          return providePreferConstCodeLenses(document);
        }
      }
    ),
    vscode.languages.registerHoverProvider(
      { language: "openplanet-angelscript" },
      {
        provideHover(document, position) {
          return providePreferConstHoverAction(document, position);
        }
      }
    )
  );

  lintOpenDocuments();
}

export function deactivate(): void {
  for (const timer of pendingLintTimers.values()) {
    clearTimeout(timer);
  }
  pendingLintTimers.clear();
  diagnosticsCollection?.dispose();
  diagnosticsCollection = undefined;
}

function scheduleLint(document: vscode.TextDocument, debounceMs: number): void {
  if (!isTargetDocument(document)) {
    return;
  }

  const uriKey = document.uri.toString();
  clearPendingLint(uriKey);

  if (debounceMs <= 0) {
    lintDocument(document);
    return;
  }

  const timer = setTimeout(() => {
    pendingLintTimers.delete(uriKey);
    lintDocument(document);
  }, debounceMs);
  pendingLintTimers.set(uriKey, timer);
}

function clearPendingLint(uriKey: string): void {
  const timer = pendingLintTimers.get(uriKey);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  pendingLintTimers.delete(uriKey);
}

function lintDocument(document: vscode.TextDocument): void {
  if (!diagnosticsCollection || !isTargetDocument(document)) {
    return;
  }

  const settings = getLinterSettings();
  if (!settings.enable) {
    diagnosticsCollection.set(document.uri, []);
    return;
  }

  const issues = runLinter(document.getText(), settings);
  cachedIssuesByUri.set(document.uri.toString(), issues);
  const diagnostics = issues.map((issue) => toDiagnostic(issue));
  diagnosticsCollection.set(document.uri, diagnostics);
  codeLensChangeEmitter.fire();
}

function isTargetDocument(document: vscode.TextDocument): boolean {
  return document.languageId === "openplanet-angelscript";
}

function provideLintCodeActions(
  document: vscode.TextDocument,
  diagnostics: readonly vscode.Diagnostic[]
): vscode.CodeAction[] {
  const actions: vscode.CodeAction[] = [];
  const seenKeys = new Set<string>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.source !== diagnosticSource) {
      continue;
    }

    const data = toLinterDiagnosticData(
      (diagnostic as vscode.Diagnostic & { data?: unknown }).data
    );
    const ruleId = getDiagnosticRuleId(diagnostic, data);
    if (!ruleId) {
      continue;
    }

    const resolvedFix = data.fix ?? lookupCachedFix(document, diagnostic, ruleId);
    if (resolvedFix) {
      const fixAction = new vscode.CodeAction(
        resolvedFix.title,
        vscode.CodeActionKind.QuickFix
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(
          new vscode.Position(resolvedFix.range.startLine, resolvedFix.range.startCharacter),
          new vscode.Position(resolvedFix.range.endLine, resolvedFix.range.endCharacter)
        ),
        resolvedFix.newText
      );
      fixAction.edit = edit;
      fixAction.diagnostics = [diagnostic];
      fixAction.isPreferred = true;
      const key = `fix:${ruleId}:${diagnostic.range.start.line}:${diagnostic.range.start.character}:${resolvedFix.title}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        actions.push(fixAction);
      }
    }

    const suppressAction = new vscode.CodeAction(
      `Disable ${ruleId} for next line`,
      vscode.CodeActionKind.QuickFix
    );
    const suppressEdit = new vscode.WorkspaceEdit();
    suppressEdit.insert(
      document.uri,
      new vscode.Position(diagnostic.range.start.line, 0),
      `// oplint-disable-next-line ${ruleId}\n`
    );
    suppressAction.edit = suppressEdit;
    suppressAction.diagnostics = [diagnostic];
    const suppressKey = `suppress:${ruleId}:${diagnostic.range.start.line}`;
    if (!seenKeys.has(suppressKey)) {
      seenKeys.add(suppressKey);
      actions.push(suppressAction);
    }

    const blockSuppressAction = new vscode.CodeAction(
      `Disable ${ruleId} for block`,
      vscode.CodeActionKind.QuickFix
    );
    const blockSuppressEdit = new vscode.WorkspaceEdit();
    const blockStartLine = diagnostic.range.start.line;
    const blockEndLine = Math.min(
      diagnostic.range.end.line + 1,
      Math.max(0, document.lineCount - 1)
    );
    blockSuppressEdit.insert(
      document.uri,
      new vscode.Position(blockStartLine, 0),
      `// oplint-disable-start ${ruleId}\n`
    );
    blockSuppressEdit.insert(
      document.uri,
      new vscode.Position(blockEndLine + 1, 0),
      `// oplint-disable-end ${ruleId}\n`
    );
    blockSuppressAction.edit = blockSuppressEdit;
    blockSuppressAction.diagnostics = [diagnostic];
    const blockSuppressKey = `suppress-block:${ruleId}:${blockStartLine}:${blockEndLine}`;
    if (!seenKeys.has(blockSuppressKey)) {
      seenKeys.add(blockSuppressKey);
      actions.push(blockSuppressAction);
    }

    const fileSuppressAction = new vscode.CodeAction(
      `Disable ${ruleId} for file`,
      vscode.CodeActionKind.QuickFix
    );
    const fileSuppressEdit = new vscode.WorkspaceEdit();
    fileSuppressEdit.insert(
      document.uri,
      new vscode.Position(0, 0),
      `// oplint-disable ${ruleId}\n`
    );
    fileSuppressAction.edit = fileSuppressEdit;
    fileSuppressAction.diagnostics = [diagnostic];
    const fileSuppressKey = `suppress-file:${ruleId}`;
    if (!seenKeys.has(fileSuppressKey)) {
      seenKeys.add(fileSuppressKey);
      actions.push(fileSuppressAction);
    }

    const enableAction = new vscode.CodeAction(
      `Re-enable ${ruleId} below`,
      vscode.CodeActionKind.QuickFix
    );
    const enableEdit = new vscode.WorkspaceEdit();
    enableEdit.insert(
      document.uri,
      new vscode.Position(diagnostic.range.end.line + 1, 0),
      `// oplint-enable ${ruleId}\n`
    );
    enableAction.edit = enableEdit;
    enableAction.diagnostics = [diagnostic];
    const enableKey = `enable:${ruleId}:${diagnostic.range.end.line + 1}`;
    if (!seenKeys.has(enableKey)) {
      seenKeys.add(enableKey);
      actions.push(enableAction);
    }
  }

  return actions;
}

function providePreferConstCodeLenses(
  document: vscode.TextDocument
): vscode.CodeLens[] {
  if (!isTargetDocument(document) || !isPreferConstCodeLensEnabled()) {
    return [];
  }

  const diagnostics = diagnosticsCollection?.get(document.uri) ?? [];
  const lenses: vscode.CodeLens[] = [];
  const seenLines = new Set<number>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.source !== diagnosticSource) {
      continue;
    }

    const data = toLinterDiagnosticData(
      (diagnostic as vscode.Diagnostic & { data?: unknown }).data
    );
    const ruleId = getDiagnosticRuleId(diagnostic, data);
    if (ruleId !== preferConstRuleId) {
      continue;
    }

    const line = diagnostic.range.start.line;
    if (seenLines.has(line)) {
      continue;
    }
    seenLines.add(line);

    lenses.push(
      new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
        title: "Add const",
        command: applyPreferConstFixCommand,
        arguments: [document.uri, line]
      })
    );
  }

  return lenses;
}

function toDiagnostic(issue: LintIssue): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    toVscodeRange(issue.range),
    issue.message,
    toDiagnosticSeverity(issue.severity)
  );
  diagnostic.code = issue.ruleId;
  diagnostic.source = diagnosticSource;
  (diagnostic as vscode.Diagnostic & { data?: unknown }).data =
    toDiagnosticData(issue);
  return diagnostic;
}

function toDiagnosticData(issue: LintIssue): LinterDiagnosticData {
  if (!issue.fix) {
    return {
      ruleId: issue.ruleId
    };
  }

  return {
    ruleId: issue.ruleId,
    fix: {
      title: issue.fix.title,
      newText: issue.fix.newText,
      range: {
        startLine: issue.fix.range.start.line,
        startCharacter: issue.fix.range.start.character,
        endLine: issue.fix.range.end.line,
        endCharacter: issue.fix.range.end.character
      }
    }
  };
}

function toVscodeRange(range: TextRange): vscode.Range {
  return new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character)
  );
}

function toDiagnosticSeverity(severity: LintSeverity): vscode.DiagnosticSeverity {
  switch (severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "info":
      return vscode.DiagnosticSeverity.Information;
    case "hint":
      return vscode.DiagnosticSeverity.Hint;
  }
}

function getDiagnosticRuleId(
  diagnostic: vscode.Diagnostic,
  data: LinterDiagnosticData
): string | undefined {
  if (typeof diagnostic.code === "string" && diagnostic.code.length > 0) {
    return diagnostic.code;
  }

  if (typeof data.ruleId === "string" && data.ruleId.length > 0) {
    return data.ruleId;
  }

  return undefined;
}

interface LinterDiagnosticData {
  ruleId?: string;
  fix?: {
    title: string;
    newText: string;
    range: {
      startLine: number;
      startCharacter: number;
      endLine: number;
      endCharacter: number;
    };
  };
}

function toLinterDiagnosticData(raw: unknown): LinterDiagnosticData {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const record = raw as Record<string, unknown>;
  const data: LinterDiagnosticData = {};

  if (typeof record.ruleId === "string") {
    data.ruleId = record.ruleId;
  }

  if (typeof record.fix === "object" && record.fix !== null) {
    const fix = record.fix as Record<string, unknown>;
    if (
      typeof fix.title === "string" &&
      typeof fix.newText === "string" &&
      typeof fix.range === "object" &&
      fix.range !== null
    ) {
      const range = fix.range as Record<string, unknown>;
      if (
        typeof range.startLine === "number" &&
        typeof range.startCharacter === "number" &&
        typeof range.endLine === "number" &&
        typeof range.endCharacter === "number"
      ) {
        data.fix = {
          title: fix.title,
          newText: fix.newText,
          range: {
            startLine: range.startLine,
            startCharacter: range.startCharacter,
            endLine: range.endLine,
            endCharacter: range.endCharacter
          }
        };
      }
    }
  }

  return data;
}

function lookupCachedFix(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  ruleId: string
): LinterDiagnosticData["fix"] | undefined {
  const issues = cachedIssuesByUri.get(document.uri.toString());
  if (!issues || issues.length === 0) {
    return undefined;
  }

  const issue = issues.find((entry) => {
    if (entry.ruleId !== ruleId || !entry.fix) {
      return false;
    }
    if (entry.message !== diagnostic.message) {
      return false;
    }
    return (
      entry.range.start.line === diagnostic.range.start.line &&
      entry.range.start.character === diagnostic.range.start.character &&
      entry.range.end.line === diagnostic.range.end.line &&
      entry.range.end.character === diagnostic.range.end.character
    );
  });
  if (!issue?.fix) {
    return undefined;
  }

  return {
    title: issue.fix.title,
    newText: issue.fix.newText,
    range: {
      startLine: issue.fix.range.start.line,
      startCharacter: issue.fix.range.start.character,
      endLine: issue.fix.range.end.line,
      endCharacter: issue.fix.range.end.character
    }
  };
}

async function applyPreferConstFixAtLine(
  uri?: vscode.Uri | string,
  line?: number
): Promise<void> {
  const commandUri =
    typeof uri === "string"
      ? vscode.Uri.parse(uri)
      : uri;
  const activeEditor = vscode.window.activeTextEditor;
  const document = commandUri
    ? vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.toString() === commandUri.toString()
      ) ?? activeEditor?.document
    : activeEditor?.document;
  if (!document || !isTargetDocument(document)) {
    return;
  }

  const targetLine =
    typeof line === "number"
      ? line
      : activeEditor?.selection.active.line;
  if (typeof targetLine !== "number") {
    return;
  }

  const diagnostics = diagnosticsCollection?.get(document.uri) ?? [];
  const targetDiagnostic = diagnostics.find((diagnostic) => {
    if (diagnostic.source !== diagnosticSource) {
      return false;
    }
    const data = toLinterDiagnosticData(
      (diagnostic as vscode.Diagnostic & { data?: unknown }).data
    );
    const ruleId = getDiagnosticRuleId(diagnostic, data);
    return (
      ruleId === preferConstRuleId && diagnostic.range.start.line === targetLine
    );
  });
  if (!targetDiagnostic) {
    return;
  }

  const data = toLinterDiagnosticData(
    (targetDiagnostic as vscode.Diagnostic & { data?: unknown }).data
  );
  const resolvedFix =
    data.fix ?? lookupCachedFix(document, targetDiagnostic, preferConstRuleId);
  if (!resolvedFix) {
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(
      new vscode.Position(
        resolvedFix.range.startLine,
        resolvedFix.range.startCharacter
      ),
      new vscode.Position(
        resolvedFix.range.endLine,
        resolvedFix.range.endCharacter
      )
    ),
    resolvedFix.newText
  );
  await vscode.workspace.applyEdit(edit);
}

function isPreferConstCodeLensEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("openplanetAngelscriptLinter")
    .get<boolean>("preferConstLocals.inlineFixCodeLens.enable", false);
}

function isPreferConstHoverFixLinkEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("openplanetAngelscriptLinter")
    .get<boolean>("preferConstLocals.hoverFixLink.enable", false);
}

function providePreferConstHoverAction(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Hover | undefined {
  if (!isTargetDocument(document) || !isPreferConstHoverFixLinkEnabled()) {
    return undefined;
  }

  const diagnostics = diagnosticsCollection?.get(document.uri) ?? [];
  const diagnostic = diagnostics.find((entry) => {
    if (entry.source !== diagnosticSource) {
      return false;
    }
    const data = toLinterDiagnosticData(
      (entry as vscode.Diagnostic & { data?: unknown }).data
    );
    const ruleId = getDiagnosticRuleId(entry, data);
    if (ruleId !== preferConstRuleId) {
      return false;
    }
    return entry.range.contains(position);
  });

  if (!diagnostic) {
    return undefined;
  }

  const commandUri = vscode.Uri.parse(
    `command:${applyPreferConstFixCommand}?${encodeURIComponent(
      JSON.stringify([document.uri.toString(), diagnostic.range.start.line])
    )}`
  );
  const markdown = new vscode.MarkdownString(
    `[Add const](${commandUri.toString()})`
  );
  markdown.isTrusted = true;

  return new vscode.Hover(markdown, diagnostic.range);
}
