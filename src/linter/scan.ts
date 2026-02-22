import type {
  LineComment,
  ScannedDocument,
  ScannedLine,
  TextPosition
} from "./types";

export function scanDocument(text: string): ScannedDocument {
  const lines = text.replace(/\r/g, "").split("\n");
  const scannedLines: ScannedLine[] = [];
  let inBlockComment = false;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const rawText = lines[lineNumber];
    const codeChars = rawText.split("");
    let lineComment: LineComment | null = null;

    for (let column = 0; column < rawText.length; ) {
      const current = rawText[column];
      const next = rawText[column + 1];

      if (inBlockComment) {
        codeChars[column] = " ";
        if (current === "*" && next === "/") {
          codeChars[column + 1] = " ";
          column += 2;
          inBlockComment = false;
          continue;
        }
        column += 1;
        continue;
      }

      if (current === "/" && next === "/") {
        lineComment = {
          line: lineNumber,
          startCharacter: column,
          text: rawText.slice(column)
        };
        for (let i = column; i < rawText.length; i += 1) {
          codeChars[i] = " ";
        }
        break;
      }

      if (current === "/" && next === "*") {
        codeChars[column] = " ";
        codeChars[column + 1] = " ";
        column += 2;
        inBlockComment = true;
        continue;
      }

      if (current === "\"" || current === "'") {
        const quote = current;
        codeChars[column] = " ";
        column += 1;

        while (column < rawText.length) {
          const stringChar = rawText[column];
          codeChars[column] = " ";
          if (stringChar === "\\") {
            column += 1;
            if (column < rawText.length) {
              codeChars[column] = " ";
              column += 1;
            }
            continue;
          }
          if (stringChar === quote) {
            column += 1;
            break;
          }
          column += 1;
        }
        continue;
      }

      column += 1;
    }

    scannedLines.push({
      lineNumber,
      rawText,
      codeText: codeChars.join(""),
      lineComment
    });
  }

  const codeText = scannedLines.map((line) => line.codeText).join("\n");
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of scannedLines) {
    lineOffsets.push(offset);
    offset += line.codeText.length + 1;
  }

  return {
    lines: scannedLines,
    codeText,
    lineOffsets
  };
}

export function positionFromOffset(
  scan: ScannedDocument,
  rawOffset: number
): TextPosition {
  if (scan.lines.length === 0) {
    return {
      line: 0,
      character: 0
    };
  }

  const offset = Math.max(0, Math.min(rawOffset, scan.codeText.length));
  let low = 0;
  let high = scan.lineOffsets.length - 1;
  let line = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lineStart = scan.lineOffsets[mid];
    if (lineStart <= offset) {
      line = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineStart = scan.lineOffsets[line];
  const lineLength = scan.lines[line]?.codeText.length ?? 0;
  const character = Math.min(Math.max(offset - lineStart, 0), lineLength);
  return {
    line,
    character
  };
}
