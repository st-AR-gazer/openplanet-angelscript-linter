import type { TextRange } from "./types";

export function createRange(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number
): TextRange {
  return {
    start: {
      line: startLine,
      character: startCharacter
    },
    end: {
      line: endLine,
      character: endCharacter
    }
  };
}
