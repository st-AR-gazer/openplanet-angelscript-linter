import { positionFromOffset } from "./scan";
import type { ScannedDocument } from "./types";

export interface FunctionParameter {
  name: string;
  typeText: string;
  rawText: string;
  parameterStartOffset: number;
  parameterEndOffset: number;
  startOffset: number;
  endOffset: number;
  line: number;
  character: number;
  scopeId: number;
}

export interface LocalDeclaration {
  name: string;
  typeText: string;
  startOffset: number;
  endOffset: number;
  line: number;
  character: number;
  depth: number;
  scopeId: number;
  declarationStartOffset: number;
  typeStartOffset: number;
  initializerText?: string;
  initializerOffset?: number;
  isConst: boolean;
}

export interface AssignmentRecord {
  name: string;
  operator: string;
  expressionText: string;
  startOffset: number;
  line: number;
  character: number;
}

export interface SymbolEvent {
  name: string;
  kind: "read" | "write";
  startOffset: number;
  line: number;
  character: number;
  scopeId: number;
  isInitialization: boolean;
}

export interface CastRecord {
  typeText: string;
  isHandleCast: boolean;
  startOffset: number;
  line: number;
  character: number;
}

export interface ScopeModel {
  id: number;
  parentId: number | null;
  depth: number;
  startOffset: number;
  endOffset: number;
}

export interface IncludeDirective {
  path: string;
  normalizedPath: string;
  line: number;
  character: number;
  startOffset: number;
}

export interface ImportDirective {
  source: string;
  normalizedSource: string;
  declarationText: string;
  normalizedDeclaration: string;
  line: number;
  character: number;
  startOffset: number;
}

export interface FunctionModel {
  name: string;
  returnTypeText: string;
  openBraceOffset: number;
  closeBraceOffset: number;
  bodyStartOffset: number;
  bodyEndOffset: number;
  bodyText: string;
  params: FunctionParameter[];
  locals: LocalDeclaration[];
  assignments: AssignmentRecord[];
  events: SymbolEvent[];
  casts: CastRecord[];
  scopes: ScopeModel[];
}

export interface DocumentModel {
  functions: FunctionModel[];
  includes: IncludeDirective[];
  imports: ImportDirective[];
}

type LexTokenKind =
  | "identifier"
  | "keyword"
  | "number"
  | "punctuation"
  | "operator"
  | "unknown";

interface LexToken {
  kind: LexTokenKind;
  value: string;
  startOffset: number;
  endOffset: number;
}

interface PairMaps {
  openToClose: Map<number, number>;
  closeToOpen: Map<number, number>;
}

const nonFunctionCallKeywords = new Set<string>([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "throw",
  "sizeof",
  "cast"
]);

const trailingSignatureQualifiers = new Set<string>([
  "const",
  "override",
  "final",
  "private",
  "protected",
  "shared",
  "external",
  "abstract",
  "mixin",
  "property"
]);

const nonDeclarationTypeKeywords = new Set<string>([
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "return",
  "try",
  "catch",
  "throw"
]);

const keywordSet = new Set<string>([
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "return",
  "try",
  "catch",
  "throw",
  "class",
  "interface",
  "enum",
  "namespace",
  "typedef",
  "funcdef",
  "import",
  "from",
  "const",
  "final",
  "override",
  "private",
  "protected",
  "shared",
  "external",
  "abstract",
  "mixin",
  "auto",
  "in",
  "out",
  "inout",
  "get",
  "set",
  "cast",
  "function",
  "super",
  "this",
  "void",
  "bool",
  "int",
  "uint",
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "float",
  "double",
  "string",
  "array",
  "dictionary",
  "true",
  "false",
  "null",
  "and",
  "or",
  "xor",
  "not",
  "is"
]);

const declarationPattern =
  /^\s*((?:const\s+)?(?:auto|[A-Za-z_][A-Za-z0-9_:<>@&\[\]]*(?:\s+[A-Za-z_][A-Za-z0-9_:<>@&\[\]]*)*))\s+(.+?)\s*;?\s*$/;
const declaratorPattern =
  /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[[^\]]*\])?\s*(?:=\s*([\s\S]+))?$/;
const includePattern = /^\s*#include\s+"([^"]+)"\s*$/;
const importPattern = /^\s*import\b[\s\S]*\bfrom\s+"([^"]+)"\s*;\s*$/;
const assignmentOperatorPattern = /^(=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)$/;
const statementAssignmentPattern =
  /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)\s*([\s\S]+?)\s*;?\s*$/;
const castPattern = /\bcast\s*<\s*([^>]+?)\s*>\s*\(/g;
const identifierPattern = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const primitiveIntegerTypePattern = /^(?:u?int(?:8|16|32|64)?|uint(?:8|16|32|64)?)$/i;
const floatLiteralPattern =
  /(?:\b\d+\.\d*(?:[eE][+-]?\d+)?[fFdD]?\b|\B\.\d+(?:[eE][+-]?\d+)?[fFdD]?\b|\b\d+[eE][+-]?\d+[fFdD]?\b)/;

const multiCharOperators = [
  ">>>=",
  "<<=",
  ">>=",
  "++",
  "--",
  "==",
  "!=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "&&",
  "||",
  "<<",
  ">>",
  "::",
  "->"
];

const punctuationChars = new Set(["{", "}", "(", ")", "[", "]", ",", ";", "?", ":"]);
const operatorChars = new Set(["=", "+", "-", "*", "/", "%", "<", ">", "!", "~", "&", "|", "^", "@", "."]);

const modelCache = new WeakMap<ScannedDocument, DocumentModel>();

export function collectDocumentModel(scan: ScannedDocument): DocumentModel {
  const cached = modelCache.get(scan);
  if (cached) {
    return cached;
  }

  const tokens = tokenize(scan.codeText);
  const parenPairs = buildPairMaps(tokens, "(", ")");
  const bracePairs = buildPairMaps(tokens, "{", "}");
  const model: DocumentModel = {
    functions: parseFunctions(scan, tokens, parenPairs, bracePairs),
    includes: parseIncludeDirectives(scan),
    imports: parseImportDirectives(scan)
  };
  modelCache.set(scan, model);
  return model;
}

export function collectFunctionModels(scan: ScannedDocument): FunctionModel[] {
  return collectDocumentModel(scan).functions;
}

export function countIdentifierMatches(text: string, identifier: string): number {
  if (!identifier) {
    return 0;
  }
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "g");
  let count = 0;
  while (pattern.exec(text) !== null) {
    count += 1;
  }
  return count;
}

export function normalizeTypeText(rawTypeText: string): string {
  return rawTypeText
    .replace(/\b(const|in|out|inout)\b/g, " ")
    .replace(/[@&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isIntegerTypeText(rawTypeText: string): boolean {
  const normalized = normalizeTypeText(rawTypeText);
  if (!normalized) {
    return false;
  }
  const leaf = normalized.split("::").pop() ?? normalized;
  return primitiveIntegerTypePattern.test(leaf);
}

export function isStringTypeText(rawTypeText: string): boolean {
  const normalized = normalizeTypeText(rawTypeText);
  if (!normalized) {
    return false;
  }
  const leaf = normalized.split("::").pop() ?? normalized;
  return leaf === "string";
}

export function containsFloatLiteral(text: string): boolean {
  return floatLiteralPattern.test(text);
}

export function hasExplicitIntegerCast(text: string): boolean {
  return (
    /\bcast\s*<\s*(?:u?int(?:8|16|32|64)?|uint(?:8|16|32|64)?)\s*>/i.test(text) ||
    /\(\s*(?:u?int(?:8|16|32|64)?|uint(?:8|16|32|64)?)\s*\)/i.test(text)
  );
}

export function isScopeSelfOrDescendant(
  scopes: ScopeModel[],
  scopeId: number,
  ancestorScopeId: number
): boolean {
  if (scopeId === ancestorScopeId) {
    return true;
  }
  let current = scopes.find((scope) => scope.id === scopeId);
  while (current && current.parentId !== null) {
    if (current.parentId === ancestorScopeId) {
      return true;
    }
    current = scopes.find((scope) => scope.id === current?.parentId);
  }
  return false;
}

function parseFunctions(
  scan: ScannedDocument,
  tokens: LexToken[],
  parenPairs: PairMaps,
  bracePairs: PairMaps
): FunctionModel[] {
  const functions: FunctionModel[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const openBrace = tokens[index];
    if (!openBrace || openBrace.value !== "{") {
      continue;
    }

    const closeBraceIndex = bracePairs.openToClose.get(index);
    if (closeBraceIndex === undefined) {
      continue;
    }

    const closeParenIndex = index - 1;
    const closeParenToken = tokens[closeParenIndex];
    if (!closeParenToken || closeParenToken.value !== ")") {
      continue;
    }

    const openParenIndex = parenPairs.closeToOpen.get(closeParenIndex);
    if (openParenIndex === undefined) {
      continue;
    }

    const nameToken = tokens[openParenIndex - 1];
    if (!nameToken || nameToken.kind !== "identifier") {
      continue;
    }
    if (nonFunctionCallKeywords.has(nameToken.value)) {
      continue;
    }

    const qualifierStartIndex = findQualifierStartIndex(tokens, closeParenIndex + 1, index);
    if (qualifierStartIndex < index) {
      continue;
    }

    const functionStartOffset = findFunctionStartOffset(tokens, nameToken.startOffset);
    const returnTypeText = scan.codeText
      .slice(functionStartOffset, nameToken.startOffset)
      .trim();
    const params = parseParameters(
      scan,
      tokens,
      openParenIndex + 1,
      closeParenIndex - 1
    );

    const bodyStartOffset = openBrace.endOffset;
    const bodyEndOffset = tokens[closeBraceIndex].startOffset;
    const bodyText = scan.codeText.slice(bodyStartOffset, bodyEndOffset);
    const bodyAnalysis = analyzeFunctionBody(
      scan,
      tokens,
      index + 1,
      closeBraceIndex - 1,
      params
    );

    functions.push({
      name: nameToken.value,
      returnTypeText,
      openBraceOffset: openBrace.startOffset,
      closeBraceOffset: tokens[closeBraceIndex].startOffset,
      bodyStartOffset,
      bodyEndOffset,
      bodyText,
      params,
      locals: bodyAnalysis.locals,
      assignments: bodyAnalysis.assignments,
      events: bodyAnalysis.events,
      casts: bodyAnalysis.casts,
      scopes: bodyAnalysis.scopes
    });

    index = closeBraceIndex;
  }

  return functions;
}

function parseIncludeDirectives(scan: ScannedDocument): IncludeDirective[] {
  const directives: IncludeDirective[] = [];
  for (const line of scan.lines) {
    const match = includePattern.exec(line.rawText);
    if (!match) {
      continue;
    }
    const path = match[1];
    const character = line.rawText.indexOf("#include");
    const startOffset = (scan.lineOffsets[line.lineNumber] ?? 0) + Math.max(0, character);
    directives.push({
      path,
      normalizedPath: normalizeDirectivePath(path),
      line: line.lineNumber,
      character: Math.max(0, character),
      startOffset
    });
  }
  return directives;
}

function parseImportDirectives(scan: ScannedDocument): ImportDirective[] {
  const directives: ImportDirective[] = [];
  for (const line of scan.lines) {
    const match = importPattern.exec(line.rawText);
    if (!match) {
      continue;
    }
    const source = match[1];
    const declarationText = line.rawText.trim();
    const normalizedDeclaration = declarationText.replace(/\s+/g, " ").toLowerCase();
    const character = line.rawText.indexOf("import");
    const startOffset = (scan.lineOffsets[line.lineNumber] ?? 0) + Math.max(0, character);
    directives.push({
      source,
      normalizedSource: normalizeDirectivePath(source),
      declarationText,
      normalizedDeclaration,
      line: line.lineNumber,
      character: Math.max(0, character),
      startOffset
    });
  }
  return directives;
}

function tokenize(text: string): LexToken[] {
  const tokens: LexToken[] = [];
  let index = 0;

  while (index < text.length) {
    const ch = text[index];
    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }

    if (isIdentifierStart(ch)) {
      let cursor = index + 1;
      while (cursor < text.length && isIdentifierPart(text[cursor])) {
        cursor += 1;
      }
      const value = text.slice(index, cursor);
      tokens.push({
        kind: keywordSet.has(value) ? "keyword" : "identifier",
        value,
        startOffset: index,
        endOffset: cursor
      });
      index = cursor;
      continue;
    }

    if (isDigit(ch)) {
      let cursor = index + 1;
      while (cursor < text.length && /[0-9._]/.test(text[cursor])) {
        cursor += 1;
      }
      tokens.push({
        kind: "number",
        value: text.slice(index, cursor),
        startOffset: index,
        endOffset: cursor
      });
      index = cursor;
      continue;
    }

    let matchedOperator: string | null = null;
    for (const candidate of multiCharOperators) {
      if (text.startsWith(candidate, index)) {
        matchedOperator = candidate;
        break;
      }
    }

    if (matchedOperator !== null) {
      tokens.push({
        kind: "operator",
        value: matchedOperator,
        startOffset: index,
        endOffset: index + matchedOperator.length
      });
      index += matchedOperator.length;
      continue;
    }

    if (punctuationChars.has(ch)) {
      tokens.push({
        kind: "punctuation",
        value: ch,
        startOffset: index,
        endOffset: index + 1
      });
      index += 1;
      continue;
    }

    if (operatorChars.has(ch)) {
      tokens.push({
        kind: "operator",
        value: ch,
        startOffset: index,
        endOffset: index + 1
      });
      index += 1;
      continue;
    }

    tokens.push({
      kind: "unknown",
      value: ch,
      startOffset: index,
      endOffset: index + 1
    });
    index += 1;
  }

  return tokens;
}

function buildPairMaps(tokens: LexToken[], open: string, close: string): PairMaps {
  const openToClose = new Map<number, number>();
  const closeToOpen = new Map<number, number>();
  const stack: number[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === open) {
      stack.push(index);
      continue;
    }
    if (token.value === close) {
      const matchingOpen = stack.pop();
      if (matchingOpen !== undefined) {
        openToClose.set(matchingOpen, index);
        closeToOpen.set(index, matchingOpen);
      }
    }
  }

  return {
    openToClose,
    closeToOpen
  };
}

function parseParameters(
  scan: ScannedDocument,
  tokens: LexToken[],
  startIndex: number,
  endIndex: number
): FunctionParameter[] {
  if (startIndex > endIndex) {
    return [];
  }

  const segments = splitTokenSegments(tokens, startIndex, endIndex);
  const params: FunctionParameter[] = [];
  for (const segment of segments) {
    const segmentStart = tokens[segment.startIndex];
    const segmentEnd = tokens[segment.endIndex];
    if (!segmentStart || !segmentEnd) {
      continue;
    }
    const rawText = scan.codeText.slice(segmentStart.startOffset, segmentEnd.endOffset).trim();
    if (!rawText || rawText === "void") {
      continue;
    }

    const nameToken = findLastIdentifierToken(tokens, segment.startIndex, segment.endIndex);
    if (!nameToken) {
      continue;
    }

    const typeText = scan.codeText
      .slice(segmentStart.startOffset, nameToken.startOffset)
      .trim();
    if (!typeText) {
      continue;
    }

    const position = positionFromOffset(scan, nameToken.startOffset);
    params.push({
      name: nameToken.value,
      typeText,
      rawText,
      parameterStartOffset: segmentStart.startOffset,
      parameterEndOffset: segmentEnd.endOffset,
      startOffset: nameToken.startOffset,
      endOffset: nameToken.endOffset,
      line: position.line,
      character: position.character,
      scopeId: 1
    });
  }

  return params;
}

function analyzeFunctionBody(
  scan: ScannedDocument,
  tokens: LexToken[],
  startIndex: number,
  endIndex: number,
  params: FunctionParameter[]
): {
  locals: LocalDeclaration[];
  assignments: AssignmentRecord[];
  events: SymbolEvent[];
  casts: CastRecord[];
  scopes: ScopeModel[];
} {
  const locals: LocalDeclaration[] = [];
  const assignments: AssignmentRecord[] = [];
  const events: SymbolEvent[] = [];
  const casts: CastRecord[] = [];

  const scopes: ScopeModel[] = [];
  let nextScopeId = 1;
  const rootStartOffset = tokens[startIndex]?.startOffset ?? 0;
  const rootEndOffset = tokens[endIndex]?.endOffset ?? rootStartOffset;
  scopes.push({
    id: nextScopeId,
    parentId: null,
    depth: 1,
    startOffset: rootStartOffset,
    endOffset: rootEndOffset
  });
  const scopeStack: number[] = [nextScopeId];
  nextScopeId += 1;

  const statementRanges: Array<{ start: number; end: number; scopeId: number }> = [];
  let statementStartIndex = startIndex;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }

    if (token.value === "(") {
      parenDepth += 1;
    } else if (token.value === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (token.value === "[") {
      bracketDepth += 1;
    } else if (token.value === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    }

    if (parenDepth === 0 && bracketDepth === 0 && token.value === "{") {
      pushStatementRange(statementRanges, statementStartIndex, index - 1, scopeStack[scopeStack.length - 1]);
      const parentId = scopeStack[scopeStack.length - 1] ?? null;
      const scopeId = nextScopeId;
      nextScopeId += 1;
      scopes.push({
        id: scopeId,
        parentId,
        depth: scopeStack.length + 1,
        startOffset: token.startOffset,
        endOffset: token.endOffset
      });
      scopeStack.push(scopeId);
      statementStartIndex = index + 1;
      continue;
    }

    if (parenDepth === 0 && bracketDepth === 0 && token.value === "}") {
      pushStatementRange(statementRanges, statementStartIndex, index - 1, scopeStack[scopeStack.length - 1]);
      const closingScope = scopeStack.pop();
      if (closingScope !== undefined) {
        const scope = scopes.find((item) => item.id === closingScope);
        if (scope) {
          scope.endOffset = token.endOffset;
        }
      }
      if (scopeStack.length === 0) {
        scopeStack.push(1);
      }
      statementStartIndex = index + 1;
      continue;
    }

    if (parenDepth === 0 && bracketDepth === 0 && token.value === ";") {
      pushStatementRange(statementRanges, statementStartIndex, index, scopeStack[scopeStack.length - 1]);
      statementStartIndex = index + 1;
    }
  }

  for (const statement of statementRanges) {
    const statementTokens = tokens.slice(statement.start, statement.end + 1);
    if (statementTokens.length === 0) {
      continue;
    }
    const statementStart = statementTokens[0].startOffset;
    const statementEnd = statementTokens[statementTokens.length - 1].endOffset;
    const statementText = scan.codeText.slice(statementStart, statementEnd);
    const scopeId = statement.scopeId;
    const scopeDepth = scopes.find((item) => item.id === scopeId)?.depth ?? 1;

    const forLoopLocals = parseForLoopInitializerDeclarations(
      scan,
      statementText,
      statementStart,
      scopeId,
      scopeDepth
    );
    if (forLoopLocals.length > 0) {
      for (const local of forLoopLocals) {
        const alreadyKnown = locals.some(
          (existing) => existing.startOffset === local.startOffset
        );
        if (alreadyKnown) {
          continue;
        }
        locals.push(local);
        if (local.initializerText && local.initializerText.trim().length > 0) {
          events.push({
            name: local.name,
            kind: "write",
            startOffset: local.startOffset,
            line: local.line,
            character: local.character,
            scopeId,
            isInitialization: true
          });
          events.push(
            ...extractIdentifierEvents(
              scan,
              local.initializerText,
              local.initializerOffset ?? local.endOffset,
              "read",
              scopeId
            )
          );
        }
      }
      collectCastRecords(scan, statementText, statementStart, casts);
    }

    const parsedLocals = parseDeclarationsFromStatement(
      scan,
      statementTokens,
      scopeId,
      scopeDepth
    );
    if (parsedLocals.length > 0) {
      for (const local of parsedLocals) {
        locals.push(local);
        if (local.initializerText && local.initializerText.trim().length > 0) {
          events.push({
            name: local.name,
            kind: "write",
            startOffset: local.startOffset,
            line: local.line,
            character: local.character,
            scopeId,
            isInitialization: true
          });
          events.push(
            ...extractIdentifierEvents(
              scan,
              local.initializerText,
              local.initializerOffset ?? local.endOffset,
              "read",
              scopeId
            )
          );
        }
      }
      collectCastRecords(scan, statementText, statementStart, casts);
      continue;
    }

    const fallbackLocals = parseDeclarationsFromTextFallback(
      scan,
      statementText,
      statementStart,
      scopeId,
      scopeDepth
    );
    if (fallbackLocals.length > 0) {
      for (const local of fallbackLocals) {
        locals.push(local);
        if (local.initializerText && local.initializerText.trim().length > 0) {
          events.push({
            name: local.name,
            kind: "write",
            startOffset: local.startOffset,
            line: local.line,
            character: local.character,
            scopeId,
            isInitialization: true
          });
          events.push(
            ...extractIdentifierEvents(
              scan,
              local.initializerText,
              local.initializerOffset ?? local.endOffset,
              "read",
              scopeId
            )
          );
        }
      }
      collectCastRecords(scan, statementText, statementStart, casts);
      continue;
    }

    const assignment = parseAssignmentFromStatement(scan, statementText, statementStart);
    if (assignment) {
      assignments.push(assignment);
      events.push({
        name: assignment.name,
        kind: "write",
        startOffset: assignment.startOffset,
        line: assignment.line,
        character: assignment.character,
        scopeId,
        isInitialization: false
      });
      const expressionOffset = statementStart + statementText.indexOf(assignment.expressionText);
      events.push(
        ...extractIdentifierEvents(
          scan,
          assignment.expressionText,
          expressionOffset,
          "read",
          scopeId
        )
      );
      collectCastRecords(scan, statementText, statementStart, casts);
      continue;
    }

    const trimmedStatement = statementText.trim();
    if (trimmedStatement.length > 0) {
      events.push(
        ...extractIdentifierEvents(scan, statementText, statementStart, "read", scopeId)
      );
      collectCastRecords(scan, statementText, statementStart, casts);
    }
  }

  const trackedNames = new Set<string>([
    ...params.map((param) => param.name),
    ...locals.map((local) => local.name)
  ]);

  const declarationOffsets = new Set<number>();
  for (const param of params) {
    declarationOffsets.add(param.startOffset);
  }
  for (const local of locals) {
    declarationOffsets.add(local.startOffset);
  }

  const tokenEvents = classifyIdentifierTokenEvents(
    scan,
    tokens,
    startIndex,
    endIndex,
    trackedNames,
    declarationOffsets,
    scopes
  );
  for (const event of tokenEvents) {
    const duplicate = events.some(
      (existing) =>
        existing.name === event.name &&
        existing.kind === event.kind &&
        existing.startOffset === event.startOffset
    );
    if (!duplicate) {
      events.push(event);
    }
  }

  events.sort((left, right) => left.startOffset - right.startOffset);
  assignments.sort((left, right) => left.startOffset - right.startOffset);
  casts.sort((left, right) => left.startOffset - right.startOffset);

  return {
    locals,
    assignments,
    events,
    casts,
    scopes
  };
}

function parseForLoopInitializerDeclarations(
  scan: ScannedDocument,
  statementText: string,
  statementStartOffset: number,
  scopeId: number,
  scopeDepth: number
): LocalDeclaration[] {
  const forMatch = /\bfor\s*\(/.exec(statementText);
  if (!forMatch) {
    return [];
  }

  const openParenInStatement =
    forMatch.index + forMatch[0].lastIndexOf("(");
  const closeParenInStatement = findMatchingParenInText(
    statementText,
    openParenInStatement
  );
  if (closeParenInStatement < 0) {
    return [];
  }

  const headerText = statementText.slice(
    openParenInStatement + 1,
    closeParenInStatement
  );
  const headerSegments = splitTopLevelText(headerText, ";");
  if (headerSegments.length === 0) {
    return [];
  }

  const initializer = headerSegments[0];
  const initializerText = initializer.text;
  if (!initializerText || initializerText.trim().length === 0) {
    return [];
  }

  const initializerBaseOffset =
    statementStartOffset + openParenInStatement + 1 + initializer.start;
  const initializerTokens = tokenize(initializerText).map((token) => ({
    ...token,
    startOffset: token.startOffset + initializerBaseOffset,
    endOffset: token.endOffset + initializerBaseOffset
  }));
  if (initializerTokens.length < 2) {
    return parseDeclarationsFromTextFallback(
      scan,
      initializerText,
      initializerBaseOffset,
      scopeId,
      scopeDepth
    );
  }

  const parsed = parseDeclarationsFromStatement(
    scan,
    initializerTokens,
    scopeId,
    scopeDepth
  );
  if (parsed.length > 0) {
    return parsed;
  }

  return parseDeclarationsFromTextFallback(
    scan,
    initializerText,
    initializerBaseOffset,
    scopeId,
    scopeDepth
  );
}

function parseDeclarationsFromStatement(
  scan: ScannedDocument,
  statementTokens: LexToken[],
  scopeId: number,
  scopeDepth: number
): LocalDeclaration[] {
  if (statementTokens.length === 0) {
    return [];
  }

  const tokens =
    statementTokens[statementTokens.length - 1]?.value === ";"
      ? statementTokens.slice(0, statementTokens.length - 1)
      : [...statementTokens];
  if (tokens.length < 2) {
    return [];
  }

  const firstToken = tokens[0];
  if (!firstToken) {
    return [];
  }
  if (firstToken.kind !== "identifier" && firstToken.kind !== "keyword") {
    return [];
  }
  if (nonDeclarationTypeKeywords.has(firstToken.value.toLowerCase())) {
    return [];
  }

  const nameTokenIndex = findFirstDeclaratorNameTokenIndex(tokens);
  if (nameTokenIndex <= 0) {
    return [];
  }

  const typeStartOffset = tokens[0].startOffset;
  const typeEndOffset = tokens[nameTokenIndex - 1]?.endOffset ?? typeStartOffset;
  const typeText = scan.codeText.slice(typeStartOffset, typeEndOffset).trim();
  if (!typeText) {
    return [];
  }

  const segments = splitDeclaratorSegments(tokens, nameTokenIndex);
  if (segments.length === 0) {
    return [];
  }

  const statementStartOffset = tokens[0].startOffset;
  const locals: LocalDeclaration[] = [];
  for (const segment of segments) {
    if (segment.length === 0) {
      continue;
    }
    const nameToken = findSegmentNameToken(segment);
    if (!nameToken) {
      continue;
    }

    const initializer = readInitializerFromSegment(scan, segment);
    const position = positionFromOffset(scan, nameToken.startOffset);
    const declarationStartOffset = segment[0]?.startOffset ?? statementStartOffset;
    const local: LocalDeclaration = {
      name: nameToken.value,
      typeText,
      startOffset: nameToken.startOffset,
      endOffset: nameToken.endOffset,
      line: position.line,
      character: position.character,
      depth: scopeDepth,
      scopeId,
      declarationStartOffset,
      typeStartOffset,
      isConst: /\bconst\b/i.test(typeText)
    };

    if (initializer !== null) {
      local.initializerOffset = initializer.offset;
      local.initializerText = initializer.text;
    }
    locals.push(local);
  }

  return locals;
}

function parseDeclarationsFromTextFallback(
  scan: ScannedDocument,
  statementText: string,
  statementStartOffset: number,
  scopeId: number,
  scopeDepth: number
): LocalDeclaration[] {
  if (!statementText) {
    return [];
  }

  const leadingWhitespaceLength = statementText.search(/\S|$/);
  const trimmedText = statementText
    .slice(Math.max(0, leadingWhitespaceLength))
    .replace(/;\s*$/, "")
    .trimEnd();
  if (!trimmedText) {
    return [];
  }

  const declarationMatch = declarationPattern.exec(trimmedText);
  if (!declarationMatch) {
    return [];
  }

  const typeText = declarationMatch[1]?.trim() ?? "";
  const declaratorsText = declarationMatch[2] ?? "";
  if (!typeText || !declaratorsText.trim()) {
    return [];
  }

  const firstTypeWord = typeText.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (nonDeclarationTypeKeywords.has(firstTypeWord)) {
    return [];
  }

  const baseOffset = statementStartOffset + Math.max(0, leadingWhitespaceLength);
  const typeStartInTrimmed = trimmedText.indexOf(typeText);
  const typeStartOffset =
    typeStartInTrimmed >= 0 ? baseOffset + typeStartInTrimmed : baseOffset;
  const declaratorsStartInTrimmed = trimmedText.indexOf(
    declaratorsText,
    Math.max(0, typeStartInTrimmed) + typeText.length
  );
  if (declaratorsStartInTrimmed < 0) {
    return [];
  }

  const segments = splitTopLevelText(declaratorsText, ",");
  const locals: LocalDeclaration[] = [];
  for (const segment of segments) {
    const segmentText = segment.text;
    if (!segmentText || segmentText.trim().length === 0) {
      continue;
    }

    const leadingSegmentWhitespace = segmentText.search(/\S|$/);
    const trimmedSegmentText = segmentText
      .slice(Math.max(0, leadingSegmentWhitespace))
      .trimEnd();
    if (!trimmedSegmentText) {
      continue;
    }

    const declaratorMatch = declaratorPattern.exec(trimmedSegmentText);
    if (!declaratorMatch) {
      continue;
    }
    const name = declaratorMatch[1];
    if (!name || keywordSet.has(name)) {
      continue;
    }

    const nameStartInSegment = trimmedSegmentText.indexOf(name);
    if (nameStartInSegment < 0) {
      continue;
    }

    const declarationStartOffset =
      baseOffset +
      declaratorsStartInTrimmed +
      segment.start +
      Math.max(0, leadingSegmentWhitespace);
    const nameStartOffset = declarationStartOffset + nameStartInSegment;
    const namePosition = positionFromOffset(scan, nameStartOffset);
    const local: LocalDeclaration = {
      name,
      typeText,
      startOffset: nameStartOffset,
      endOffset: nameStartOffset + name.length,
      line: namePosition.line,
      character: namePosition.character,
      depth: scopeDepth,
      scopeId,
      declarationStartOffset,
      typeStartOffset,
      isConst: /\bconst\b/i.test(typeText)
    };

    const initializerText = declaratorMatch[2]?.trim();
    if (initializerText && initializerText.length > 0) {
      const equalsInSegment = trimmedSegmentText.indexOf("=");
      if (equalsInSegment >= 0) {
        const initializerRaw = trimmedSegmentText.slice(equalsInSegment + 1);
        const initializerLeading = initializerRaw.search(/\S|$/);
        local.initializerText = initializerText;
        local.initializerOffset =
          declarationStartOffset + equalsInSegment + 1 + Math.max(0, initializerLeading);
      }
    }

    locals.push(local);
  }

  return locals;
}

function parseAssignmentFromStatement(
  scan: ScannedDocument,
  statementText: string,
  statementStartOffset: number
): AssignmentRecord | null {
  const match = statementAssignmentPattern.exec(statementText);
  if (!match) {
    return null;
  }
  const name = match[1];
  const operator = match[2];
  if (!assignmentOperatorPattern.test(operator)) {
    return null;
  }
  const expressionText = match[3].trim();
  const nameStartInStatement = statementText.indexOf(name);
  if (nameStartInStatement < 0) {
    return null;
  }
  const absoluteStart = statementStartOffset + nameStartInStatement;
  const position = positionFromOffset(scan, absoluteStart);
  return {
    name,
    operator,
    expressionText,
    startOffset: absoluteStart,
    line: position.line,
    character: position.character
  };
}

function extractIdentifierEvents(
  scan: ScannedDocument,
  text: string,
  baseOffset: number,
  kind: "read" | "write",
  scopeId: number
): SymbolEvent[] {
  const events: SymbolEvent[] = [];
  identifierPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = identifierPattern.exec(text)) !== null) {
    const name = match[0];
    if (keywordSet.has(name)) {
      continue;
    }
    const absoluteOffset = baseOffset + match.index;
    const position = positionFromOffset(scan, absoluteOffset);
    events.push({
      name,
      kind,
      startOffset: absoluteOffset,
      line: position.line,
      character: position.character,
      scopeId,
      isInitialization: false
    });
  }
  return events;
}

function collectCastRecords(
  scan: ScannedDocument,
  statementText: string,
  statementStartOffset: number,
  target: CastRecord[]
): void {
  castPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = castPattern.exec(statementText)) !== null) {
    const typeText = match[1].trim();
    const absoluteOffset = statementStartOffset + match.index;
    const position = positionFromOffset(scan, absoluteOffset);
    target.push({
      typeText,
      isHandleCast: /@/.test(typeText),
      startOffset: absoluteOffset,
      line: position.line,
      character: position.character
    });
  }
}

function classifyIdentifierTokenEvents(
  scan: ScannedDocument,
  tokens: LexToken[],
  startIndex: number,
  endIndex: number,
  trackedNames: Set<string>,
  declarationOffsets: Set<number>,
  scopes: ScopeModel[]
): SymbolEvent[] {
  const events: SymbolEvent[] = [];
  const scopeStack: number[] = [1];

  for (let index = startIndex; index <= endIndex; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }

    if (token.value === "{") {
      const nextScope = scopes.find(
        (item) =>
          item.parentId === scopeStack[scopeStack.length - 1] &&
          item.startOffset === token.startOffset
      );
      if (nextScope) {
        scopeStack.push(nextScope.id);
      }
      continue;
    }

    if (token.value === "}") {
      if (scopeStack.length > 1) {
        scopeStack.pop();
      }
      continue;
    }

    if (token.kind !== "identifier") {
      continue;
    }
    if (!trackedNames.has(token.value)) {
      continue;
    }
    if (declarationOffsets.has(token.startOffset)) {
      continue;
    }
    const previous = tokens[index - 1];
    if (
      previous &&
      (previous.value === "." || previous.value === "::" || previous.value === "->")
    ) {
      continue;
    }

    const next = tokens[index + 1];
    const isWrite =
      (next !== undefined && assignmentOperatorPattern.test(next.value)) ||
      (next !== undefined && (next.value === "++" || next.value === "--")) ||
      (previous !== undefined && (previous.value === "++" || previous.value === "--"));
    const position = positionFromOffset(scan, token.startOffset);
    events.push({
      name: token.value,
      kind: isWrite ? "write" : "read",
      startOffset: token.startOffset,
      line: position.line,
      character: position.character,
      scopeId: scopeStack[scopeStack.length - 1] ?? 1,
      isInitialization: false
    });
  }

  return events;
}

function findFirstDeclaratorNameTokenIndex(tokens: LexToken[]): number {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.kind !== "identifier") {
      continue;
    }
    if (keywordSet.has(token.value)) {
      continue;
    }
    const previous = tokens[index - 1];
    if (
      previous &&
      (previous.value === "." || previous.value === "::" || previous.value === "->")
    ) {
      continue;
    }
    const next = tokens[index + 1];
    if (!next) {
      continue;
    }
    if (
      next.value !== "=" &&
      next.value !== "," &&
      next.value !== "[" &&
      next.value !== ")" &&
      next.value !== ";"
    ) {
      continue;
    }
    if (!isTypeTokenSequence(tokens, 0, index - 1)) {
      continue;
    }
    return index;
  }

  return -1;
}

function isTypeTokenSequence(tokens: LexToken[], start: number, end: number): boolean {
  if (start > end) {
    return false;
  }
  for (let index = start; index <= end; index += 1) {
    const token = tokens[index];
    if (!token) {
      return false;
    }
    if (token.kind === "identifier") {
      continue;
    }
    if (token.kind === "keyword") {
      if (nonDeclarationTypeKeywords.has(token.value.toLowerCase())) {
        return false;
      }
      continue;
    }
    if (
      token.value === "::" ||
      token.value === "<" ||
      token.value === ">" ||
      token.value === ">>" ||
      token.value === ">>>" ||
      token.value === "[" ||
      token.value === "]" ||
      token.value === "@" ||
      token.value === "&" ||
      token.value === "*"
    ) {
      continue;
    }
    return false;
  }
  return true;
}

function splitDeclaratorSegments(tokens: LexToken[], startIndex: number): LexToken[][] {
  const segments: LexToken[][] = [];
  let current: LexToken[] = [];
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;

  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (token.value === "(") {
      parenDepth += 1;
    } else if (token.value === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (token.value === "[") {
      bracketDepth += 1;
    } else if (token.value === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (token.value === "{") {
      braceDepth += 1;
    } else if (token.value === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (token.value === "<") {
      angleDepth += 1;
    } else if (token.value === ">") {
      angleDepth = Math.max(0, angleDepth - 1);
    } else if (token.value === ">>") {
      angleDepth = Math.max(0, angleDepth - 2);
    }

    if (
      token.value === "," &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      continue;
    }

    current.push(token);
  }

  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}

function findSegmentNameToken(tokens: LexToken[]): LexToken | null {
  for (const token of tokens) {
    if (token.kind === "identifier" && !keywordSet.has(token.value)) {
      return token;
    }
  }
  return null;
}

function readInitializerFromSegment(
  scan: ScannedDocument,
  tokens: LexToken[]
): { text: string; offset: number } | null {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (token.value === "(") {
      parenDepth += 1;
    } else if (token.value === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (token.value === "[") {
      bracketDepth += 1;
    } else if (token.value === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (token.value === "{") {
      braceDepth += 1;
    } else if (token.value === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (token.value === "<") {
      angleDepth += 1;
    } else if (token.value === ">") {
      angleDepth = Math.max(0, angleDepth - 1);
    } else if (token.value === ">>") {
      angleDepth = Math.max(0, angleDepth - 2);
    }

    if (
      token.value === "=" &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      const nextToken = tokens[index + 1];
      const lastToken = tokens[tokens.length - 1];
      if (!nextToken || !lastToken || nextToken.startOffset >= lastToken.endOffset) {
        return null;
      }
      const text = scan.codeText
        .slice(nextToken.startOffset, lastToken.endOffset)
        .trim();
      if (!text) {
        return null;
      }
      const firstNonWhitespace = scan.codeText
        .slice(nextToken.startOffset, lastToken.endOffset)
        .search(/\S/);
      const offset =
        firstNonWhitespace >= 0
          ? nextToken.startOffset + firstNonWhitespace
          : nextToken.startOffset;
      return {
        text,
        offset
      };
    }
  }
  return null;
}

function splitTokenSegments(
  tokens: LexToken[],
  startIndex: number,
  endIndex: number
): Array<{ startIndex: number; endIndex: number }> {
  const segments: Array<{ startIndex: number; endIndex: number }> = [];
  let segmentStart = startIndex;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (token.value === "(") {
      parenDepth += 1;
    } else if (token.value === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (token.value === "[") {
      bracketDepth += 1;
    } else if (token.value === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (token.value === "{") {
      braceDepth += 1;
    } else if (token.value === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (token.value === "<") {
      if (shouldTreatAsTemplateOpen(tokens, index, angleDepth)) {
        angleDepth += 1;
      }
    } else if (token.value === ">") {
      angleDepth = Math.max(0, angleDepth - 1);
    } else if (token.value === ">>") {
      angleDepth = Math.max(0, angleDepth - 2);
    } else if (token.value === ">>>") {
      angleDepth = Math.max(0, angleDepth - 3);
    }

    if (
      token.value === "," &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      if (segmentStart <= index - 1) {
        segments.push({
          startIndex: segmentStart,
          endIndex: index - 1
        });
      }
      segmentStart = index + 1;
    }
  }

  if (segmentStart <= endIndex) {
    segments.push({
      startIndex: segmentStart,
      endIndex
    });
  }

  return segments;
}

function splitTopLevelText(
  text: string,
  delimiter: string
): Array<{ start: number; end: number; text: string }> {
  const segments: Array<{ start: number; end: number; text: string }> = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "(") {
      parenDepth += 1;
      continue;
    }
    if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (ch === "[") {
      bracketDepth += 1;
      continue;
    }
    if (ch === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      continue;
    }
    if (ch === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (ch === "<") {
      angleDepth += 1;
      continue;
    }
    if (ch === ">") {
      angleDepth = Math.max(0, angleDepth - 1);
      continue;
    }

    if (
      ch === delimiter &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      segments.push({
        start,
        end: index,
        text: text.slice(start, index)
      });
      start = index + 1;
    }
  }

  segments.push({
    start,
    end: text.length,
    text: text.slice(start)
  });
  return segments;
}

function findMatchingParenInText(text: string, openParenIndex: number): number {
  let depth = 0;
  let inString: "\"" | "'" | null = null;
  let inBlockComment = false;

  for (let index = openParenIndex; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1] ?? "";

    if (inString !== null) {
      if (ch === "\\") {
        index += 1;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n" && text[index] !== "\r") {
        index += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      inString = ch;
      continue;
    }

    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function findLastIdentifierToken(
  tokens: LexToken[],
  startIndex: number,
  endIndex: number
): LexToken | null {
  for (let index = endIndex; index >= startIndex; index -= 1) {
    const token = tokens[index];
    if (!token || token.kind !== "identifier") {
      continue;
    }
    if (keywordSet.has(token.value)) {
      continue;
    }
    const previous = tokens[index - 1];
    if (
      previous &&
      (previous.value === "." || previous.value === "::" || previous.value === "->")
    ) {
      continue;
    }
    return token;
  }
  return null;
}

function findQualifierStartIndex(
  tokens: LexToken[],
  startIndex: number,
  endIndex: number
): number {
  let index = startIndex;
  while (index < endIndex) {
    const token = tokens[index];
    if (!token) {
      index += 1;
      continue;
    }
    if (token.value === "&") {
      index += 1;
      continue;
    }
    if (token.kind === "keyword" && trailingSignatureQualifiers.has(token.value)) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function findFunctionStartOffset(tokens: LexToken[], nameOffset: number): number {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.endOffset > nameOffset) {
      continue;
    }
    if (token.value === ";" || token.value === "}" || token.value === "{") {
      return token.endOffset;
    }
  }
  return 0;
}

function shouldTreatAsTemplateOpen(
  tokens: LexToken[],
  index: number,
  angleDepth: number
): boolean {
  const token = tokens[index];
  const previous = tokens[index - 1];
  const next = tokens[index + 1];
  if (!token || token.value !== "<") {
    return false;
  }
  if (!previous || !next) {
    return false;
  }
  if (previous.kind !== "identifier" && previous.kind !== "keyword") {
    return angleDepth > 0;
  }
  if (next.value === ">" || next.value === ")" || next.value === ";") {
    return false;
  }
  return next.kind === "identifier" || next.kind === "keyword" || next.value === "@";
}

function normalizeDirectivePath(value: string): string {
  return value.trim().replace(/\\/g, "/").toLowerCase();
}

function pushStatementRange(
  target: Array<{ start: number; end: number; scopeId: number }>,
  start: number,
  end: number,
  scopeId: number | undefined
): void {
  if (start > end) {
    return;
  }
  if (scopeId === undefined) {
    return;
  }
  target.push({
    start,
    end,
    scopeId
  });
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_";
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
