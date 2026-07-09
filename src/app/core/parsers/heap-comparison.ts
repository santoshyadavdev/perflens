import type { ParsedHeapSnapshot, HeapComparison, ConstructorSummary } from '../models/heap-snapshot.model';

export function compareSnapshots(
  before: ParsedHeapSnapshot,
  after: ParsedHeapSnapshot,
): HeapComparison {
  const beforeMap = new Map(before.constructorSummaries.map(s => [s.name, s]));
  const afterMap = new Map(after.constructorSummaries.map(s => [s.name, s]));

  const addedConstructors: ConstructorSummary[] = [];
  const removedConstructors: ConstructorSummary[] = [];
  const grownConstructors: Array<ConstructorSummary & { countDelta: number; sizeDelta: number }> = [];

  // Find added and grown
  for (const [name, afterSummary] of afterMap) {
    const beforeSummary = beforeMap.get(name);
    if (!beforeSummary) {
      addedConstructors.push(afterSummary);
    } else if (afterSummary.count > beforeSummary.count || afterSummary.shallowSize > beforeSummary.shallowSize) {
      grownConstructors.push({
        ...afterSummary,
        countDelta: afterSummary.count - beforeSummary.count,
        sizeDelta: afterSummary.shallowSize - beforeSummary.shallowSize,
      });
    }
  }

  // Find removed
  for (const [name, beforeSummary] of beforeMap) {
    if (!afterMap.has(name)) {
      removedConstructors.push(beforeSummary);
    }
  }

  const beforeTotal = before.constructorSummaries.reduce((s, c) => s + c.shallowSize, 0);
  const afterTotal = after.constructorSummaries.reduce((s, c) => s + c.shallowSize, 0);

  return {
    addedConstructors: addedConstructors.sort((a, b) => b.shallowSize - a.shallowSize),
    removedConstructors: removedConstructors.sort((a, b) => b.shallowSize - a.shallowSize),
    grownConstructors: grownConstructors.sort((a, b) => b.sizeDelta - a.sizeDelta),
    totalSizeDelta: afterTotal - beforeTotal,
  };
}
