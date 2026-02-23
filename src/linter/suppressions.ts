import type { RuleSuppressions } from "./types";

const disableDirectivePattern =
  /^\s*\/\/\s*oplint-disable(?:\s+([A-Za-z0-9_*,-\s]+))?\s*$/i;
const enableDirectivePattern =
  /^\s*\/\/\s*oplint-enable(?:\s+([A-Za-z0-9_*,-\s]+))?\s*$/i;
const disableNextLineDirectivePattern =
  /^\s*\/\/\s*oplint-disable-next-line(?:\s+([A-Za-z0-9_*,-\s]+))?\s*$/i;
const disableStartDirectivePattern =
  /^\s*\/\/\s*oplint-disable-start(?:\s+([A-Za-z0-9_*,-\s]+))?\s*$/i;
const disableEndDirectivePattern =
  /^\s*\/\/\s*oplint-disable-end(?:\s+([A-Za-z0-9_*,-\s]+))?\s*$/i;

export function parseSuppressions(text: string): RuleSuppressions {
  const lines = text.replace(/\r/g, "").split("\n");
  const disabledByLine = new Map<number, Set<string>>();
  const disabledEverywhere = new Set<string>();
  const activePersistent = new Set<string>();
  const activeBlockCounts = new Map<string, number>();
  const disableNextLineByTarget = new Map<number, Set<string>>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const active = collectActiveRulesForLine(
      activePersistent,
      activeBlockCounts,
      disableNextLineByTarget.get(lineIndex)
    );
    if (active.size > 0) {
      disabledByLine.set(lineIndex, active);
    }

    const lineText = lines[lineIndex];

    const disableNext = disableNextLineDirectivePattern.exec(lineText);
    if (disableNext) {
      const targetLine = lineIndex + 1;
      if (targetLine < lines.length) {
        mergeRuleSet(
          disableNextLineByTarget,
          targetLine,
          parseRuleIdSet(disableNext[1])
        );
      }
      continue;
    }

    const disableStart = disableStartDirectivePattern.exec(lineText);
    if (disableStart) {
      incrementRuleCounts(activeBlockCounts, parseRuleIdSet(disableStart[1]));
      continue;
    }

    const disableEnd = disableEndDirectivePattern.exec(lineText);
    if (disableEnd) {
      decrementRuleCounts(activeBlockCounts, parseRuleIdSet(disableEnd[1]));
      continue;
    }

    const enable = enableDirectivePattern.exec(lineText);
    if (enable) {
      removeFromRuleSet(activePersistent, parseRuleIdSet(enable[1]));
      continue;
    }

    const disable = disableDirectivePattern.exec(lineText);
    if (disable) {
      addToRuleSet(activePersistent, parseRuleIdSet(disable[1]));
    }
  }

  for (const ruleId of activePersistent) {
    disabledEverywhere.add(ruleId);
  }

  return {
    disabledEverywhere,
    disabledByLine
  };
}

export function isSuppressed(
  suppressions: RuleSuppressions,
  ruleId: string,
  zeroBasedLine: number
): boolean {
  const lineRules = suppressions.disabledByLine.get(zeroBasedLine);
  if (lineRules?.has("*") || lineRules?.has(ruleId)) {
    return true;
  }

  if (
    suppressions.disabledEverywhere.has("*") ||
    suppressions.disabledEverywhere.has(ruleId)
  ) {
    return true;
  }

  return false;
}

function collectActiveRulesForLine(
  persistent: Set<string>,
  blockCounts: Map<string, number>,
  nextLineRules: Set<string> | undefined
): Set<string> {
  const active = new Set<string>();
  for (const ruleId of persistent) {
    active.add(ruleId);
  }
  for (const [ruleId, count] of blockCounts) {
    if (count > 0) {
      active.add(ruleId);
    }
  }
  if (nextLineRules) {
    for (const ruleId of nextLineRules) {
      active.add(ruleId);
    }
  }
  return active;
}

function mergeRuleSet(
  targetMap: Map<number, Set<string>>,
  key: number,
  values: Set<string>
): void {
  const existing = targetMap.get(key) ?? new Set<string>();
  addToRuleSet(existing, values);
  targetMap.set(key, existing);
}

function incrementRuleCounts(
  counts: Map<string, number>,
  ruleIds: Set<string>
): void {
  if (ruleIds.has("*")) {
    counts.set("*", (counts.get("*") ?? 0) + 1);
    return;
  }

  for (const ruleId of ruleIds) {
    counts.set(ruleId, (counts.get(ruleId) ?? 0) + 1);
  }
}

function decrementRuleCounts(
  counts: Map<string, number>,
  ruleIds: Set<string>
): void {
  if (ruleIds.has("*")) {
    const current = counts.get("*") ?? 0;
    if (current <= 1) {
      counts.delete("*");
    } else {
      counts.set("*", current - 1);
    }
    return;
  }

  for (const ruleId of ruleIds) {
    const current = counts.get(ruleId) ?? 0;
    if (current <= 1) {
      counts.delete(ruleId);
    } else {
      counts.set(ruleId, current - 1);
    }
  }
}

function addToRuleSet(target: Set<string>, values: Set<string>): void {
  if (values.has("*")) {
    target.clear();
    target.add("*");
    return;
  }
  if (target.has("*")) {
    return;
  }
  for (const value of values) {
    target.add(value);
  }
}

function removeFromRuleSet(target: Set<string>, values: Set<string>): void {
  if (values.has("*")) {
    target.clear();
    return;
  }
  if (target.has("*")) {
    target.delete("*");
  }
  for (const value of values) {
    target.delete(value);
  }
}

function parseRuleIdSet(raw?: string): Set<string> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return new Set<string>(["*"]);
  }

  const parsed = new Set<string>();
  for (const chunk of raw.split(",")) {
    const value = chunk.trim();
    if (!value) {
      continue;
    }
    parsed.add(value);
  }

  return parsed;
}
