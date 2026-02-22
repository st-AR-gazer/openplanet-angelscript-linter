import { positionFromOffset } from "./scan";
import type { ScannedDocument } from "./types";

export interface FunctionParameter {
  name: string;
  typeText: string;
  rawText: string;
  startOffset: number;
  endOffset: number;
  line: number;
  character: number;
}

export interface LocalDeclaration {
  name: string;
  typeText: string;
  startOffset: number;
  endOffset: number;
  line: number;
  character: number;
  depth: number;
  initializerText?: string;
  initializerOffset?: number;
}

export interface AssignmentRecord {
  name: string;
  expressionText: string;
  startOffset: number;
  line: number;
  character: number;
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

const primitiveIntegerTypePattern = /^(?:u?int(?:8|16|32|64)?|uint(?:8|16|32|64)?)$/i;
const floatLiteralPattern =
  /(?:\b\d+\.\d*(?:[eE][+-]?\d+)?[fFdD]?\b|\B\.\d+(?:[eE][+-]?\d+)?[fFdD]?\b|\b\d+[eE][+-]?\d+[fFdD]?\b)/;

export function collectFunctionModels(scan: ScannedDocument): FunctionModel[] {
  const text = scan.codeText;
  const models: FunctionModel[] = [];
  const functionCandidatePattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = functionCandidatePattern.exec(text)) !== null) {
    const name = match[1];
    if (nonFunctionCallKeywords.has(name)) {
      continue;
    }

    const openParenOffset = match.index + match[0].lastIndexOf("(");
    const closeParenOffset = findMatchingPair(text, openParenOffset, "(", ")");
    if (closeParenOffset < 0) {
      continue;
    }

    let cursor = skipWhitespace(text, closeParenOffset + 1);
    cursor = skipTrailingFunctionQualifiers(text, cursor);
    cursor = skipWhitespace(text, cursor);
    if (text[cursor] !== "{") {
      continue;
    }

    const closeBraceOffset = findMatchingPair(text, cursor, "{", "}");
    if (closeBraceOffset < 0) {
      continue;
    }

    const returnTypeStart = findStatementBoundary(text, match.index);
    const returnTypeText = text.slice(returnTypeStart, match.index).trim();
    const params = parseParameters(
      text,
      openParenOffset + 1,
      closeParenOffset,
      scan
    );
    const bodyStartOffset = cursor + 1;
    const bodyEndOffset = closeBraceOffset;
    const bodyText = text.slice(bodyStartOffset, bodyEndOffset);
    const depthAtIndex = buildBraceDepthIndex(bodyText);
    const locals = collectLocalDeclarations(
      bodyText,
      bodyStartOffset,
      depthAtIndex,
      scan
    );
    const assignments = collectAssignments(bodyText, bodyStartOffset, scan);

    models.push({
      name,
      returnTypeText,
      openBraceOffset: cursor,
      closeBraceOffset,
      bodyStartOffset,
      bodyEndOffset,
      bodyText,
      params,
      locals,
      assignments
    });

    functionCandidatePattern.lastIndex = closeBraceOffset + 1;
  }

  return models;
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

function parseParameters(
  text: string,
  startOffset: number,
  endOffset: number,
  scan: ScannedDocument
): FunctionParameter[] {
  const params: FunctionParameter[] = [];
  const segments = splitTopLevelSegments(text, startOffset, endOffset);

  for (const segment of segments) {
    const trimmedText = segment.text.trim();
    if (!trimmedText || trimmedText === "void") {
      continue;
    }

    const equalsIndex = findTopLevelEquals(trimmedText);
    const signaturePart =
      equalsIndex >= 0 ? trimmedText.slice(0, equalsIndex).trimEnd() : trimmedText;
    const nameMatch = /([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[\s*\])?\s*$/.exec(
      signaturePart
    );
    if (!nameMatch) {
      continue;
    }

    const name = nameMatch[1];
    const nameIndex = signaturePart.lastIndexOf(name);
    if (nameIndex < 0) {
      continue;
    }

    const typeText = signaturePart.slice(0, nameIndex).trim();
    if (!typeText) {
      continue;
    }

    const trimmedStartInSegment = segment.text.indexOf(signaturePart);
    if (trimmedStartInSegment < 0) {
      continue;
    }

    const absoluteNameOffset =
      segment.startOffset + trimmedStartInSegment + nameIndex;
    const position = positionFromOffset(scan, absoluteNameOffset);
    params.push({
      name,
      typeText,
      rawText: trimmedText,
      startOffset: absoluteNameOffset,
      endOffset: absoluteNameOffset + name.length,
      line: position.line,
      character: position.character
    });
  }

  return params;
}

function collectLocalDeclarations(
  bodyText: string,
  bodyStartOffset: number,
  depthAtIndex: number[],
  scan: ScannedDocument
): LocalDeclaration[] {
  const locals: LocalDeclaration[] = [];
  const localPattern =
    /\b((?:const\s+)?(?:auto|[A-Za-z_][A-Za-z0-9_:<>@&\[\]]*(?:\s+[A-Za-z_][A-Za-z0-9_:<>@&\[\]]*)*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^;]*))?;/g;

  let match: RegExpExecArray | null;
  while ((match = localPattern.exec(bodyText)) !== null) {
    const typeText = match[1].trim();
    const typeLeadToken = typeText.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (nonDeclarationTypeKeywords.has(typeLeadToken)) {
      continue;
    }
    const name = match[2];
    const initializerText = match[3]?.trim();
    const nameStartInMatch = match[0].indexOf(name);
    if (nameStartInMatch < 0) {
      continue;
    }

    const startInBody = match.index + nameStartInMatch;
    const before = bodyText[startInBody - 1] ?? "";
    if (before === "." || before === ":" || before === ">" || before === "-") {
      continue;
    }

    const absoluteStart = bodyStartOffset + startInBody;
    const absoluteEnd = absoluteStart + name.length;
    const position = positionFromOffset(scan, absoluteStart);
    const declaration: LocalDeclaration = {
      name,
      typeText,
      startOffset: absoluteStart,
      endOffset: absoluteEnd,
      line: position.line,
      character: position.character,
      depth: depthAtIndex[startInBody] ?? 1
    };

    if (initializerText !== undefined) {
      const equalsInMatch = match[0].indexOf("=");
      if (equalsInMatch >= 0) {
        const afterEquals = match[0].slice(equalsInMatch + 1);
        const leadingSpaces = afterEquals.search(/\S|$/);
        declaration.initializerOffset =
          bodyStartOffset + match.index + equalsInMatch + 1 + leadingSpaces;
      }
      declaration.initializerText = initializerText;
    }

    locals.push(declaration);
  }

  return locals;
}

function collectAssignments(
  bodyText: string,
  bodyStartOffset: number,
  scan: ScannedDocument
): AssignmentRecord[] {
  const assignments: AssignmentRecord[] = [];
  const assignmentPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);/g;

  let match: RegExpExecArray | null;
  while ((match = assignmentPattern.exec(bodyText)) !== null) {
    const name = match[1];
    const expressionText = match[2].trim();
    const startInBody = match.index;
    const beforeName = bodyText[startInBody - 1] ?? "";
    if (beforeName === "." || beforeName === ":" || beforeName === ">") {
      continue;
    }

    const equalsInMatch = match[0].indexOf("=");
    if (equalsInMatch < 0) {
      continue;
    }
    const equalsInBody = startInBody + equalsInMatch;
    const beforeEquals = bodyText[equalsInBody - 1] ?? "";
    const afterEquals = bodyText[equalsInBody + 1] ?? "";
    if (
      beforeEquals === "!" ||
      beforeEquals === "<" ||
      beforeEquals === ">" ||
      beforeEquals === "=" ||
      afterEquals === "="
    ) {
      continue;
    }

    const absoluteStart = bodyStartOffset + startInBody;
    const position = positionFromOffset(scan, absoluteStart);
    assignments.push({
      name,
      expressionText,
      startOffset: absoluteStart,
      line: position.line,
      character: position.character
    });
  }

  return assignments;
}

function buildBraceDepthIndex(bodyText: string): number[] {
  const depthAtIndex = new Array<number>(bodyText.length + 1);
  let depth = 1;
  for (let i = 0; i < bodyText.length; i += 1) {
    depthAtIndex[i] = depth;
    const ch = bodyText[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth = Math.max(1, depth - 1);
    }
  }
  depthAtIndex[bodyText.length] = depth;
  return depthAtIndex;
}

function splitTopLevelSegments(
  text: string,
  startOffset: number,
  endOffset: number
): Array<{ startOffset: number; endOffset: number; text: string }> {
  const segments: Array<{ startOffset: number; endOffset: number; text: string }> = [];
  let segmentStart = startOffset;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;

  for (let i = startOffset; i < endOffset; i += 1) {
    const ch = text[i];
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
      ch === "," &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      segments.push({
        startOffset: segmentStart,
        endOffset: i,
        text: text.slice(segmentStart, i)
      });
      segmentStart = i + 1;
    }
  }

  segments.push({
    startOffset: segmentStart,
    endOffset,
    text: text.slice(segmentStart, endOffset)
  });

  return segments;
}

function findTopLevelEquals(text: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
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
      ch === "=" &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0
    ) {
      if (text[i + 1] === "=") {
        continue;
      }
      return i;
    }
  }
  return -1;
}

function findStatementBoundary(text: string, fromOffset: number): number {
  for (let i = fromOffset - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === ";" || ch === "{" || ch === "}" || ch === "\n") {
      return i + 1;
    }
  }
  return 0;
}

function skipWhitespace(text: string, offset: number): number {
  let i = offset;
  while (i < text.length && /\s/.test(text[i])) {
    i += 1;
  }
  return i;
}

function skipTrailingFunctionQualifiers(text: string, offset: number): number {
  let i = offset;
  while (i < text.length) {
    i = skipWhitespace(text, i);
    if (text[i] === "&") {
      i += 1;
      continue;
    }

    const wordMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(text.slice(i));
    if (!wordMatch) {
      break;
    }
    const word = wordMatch[1];
    if (!trailingSignatureQualifiers.has(word)) {
      break;
    }
    i += word.length;
  }
  return i;
}

function findMatchingPair(
  text: string,
  startOffset: number,
  open: string,
  close: string
): number {
  let depth = 0;
  for (let i = startOffset; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === open) {
      depth += 1;
      continue;
    }
    if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}
