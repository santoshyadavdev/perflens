import type {
  CpuProfileRaw,
  CpuProfileNodeRaw,
  CallTreeNode,
  ParsedCpuProfile,
  FlatProfileEntry,
  SampleTick,
  DeoptEvent,
  CpuProfileComparison,
  CpuProfileDiff,
} from '../models/cpu-profile.model';

export function buildCallTree(raw: CpuProfileRaw, fileName: string): ParsedCpuProfile {
  const nodeMap = new Map<number, CpuProfileNodeRaw>();
  for (const node of raw.nodes) {
    nodeMap.set(node.id, node);
  }

  const selfTimeMap = new Map<number, number>();
  const samples: SampleTick[] = [];
  let cumulativeTime = 0;

  for (let i = 0; i < raw.samples.length; i++) {
    const nodeId = raw.samples[i];
    const deltaUs = raw.timeDeltas[i] ?? 0;
    const deltaMs = deltaUs / 1000;
    cumulativeTime += deltaMs;

    selfTimeMap.set(nodeId, (selfTimeMap.get(nodeId) ?? 0) + deltaMs);
    samples.push({ nodeId, timestamp: cumulativeTime, delta: deltaMs });
  }

  const totalTime = cumulativeTime;

  const ticksByKey = new Map<string, number>();
  for (const nodeId of raw.samples) {
    const node = nodeMap.get(nodeId);
    if (node) {
      const key = callFrameKey(node.callFrame);
      ticksByKey.set(key, (ticksByKey.get(key) ?? 0) + 1);
    }
  }

  const visited = new Set<number>();

  function buildNode(rawNode: CpuProfileNodeRaw, depth: number): CallTreeNode {
    if (visited.has(rawNode.id)) {
      return { id: rawNode.id, callFrame: rawNode.callFrame, selfTime: 0, totalTime: 0, children: [], depth };
    }
    visited.add(rawNode.id);
    const children = (rawNode.children ?? [])
      .map(childId => nodeMap.get(childId))
      .filter((n): n is CpuProfileNodeRaw => n !== undefined)
      .map(child => buildNode(child, depth + 1));

    const selfTime = selfTimeMap.get(rawNode.id) ?? 0;
    const childrenTotal = children.reduce((sum, c) => sum + c.totalTime, 0);

    return {
      id: rawNode.id,
      callFrame: rawNode.callFrame,
      selfTime,
      totalTime: selfTime + childrenTotal,
      children,
      depth,
    };
  }

  const rootRaw = raw.nodes[0];
  const root = buildNode(rootRaw, 0);

  const deoptEvents: DeoptEvent[] = raw.nodes
    .filter(n => n.deoptReason && n.deoptReason.length > 0)
    .map(n => ({
      callFrame: n.callFrame,
      reason: n.deoptReason!,
      hitCount: n.hitCount,
      selfTime: selfTimeMap.get(n.id) ?? 0,
    }));

  const flatProfile = buildFlatProfileFromTree(root, totalTime, raw.nodes, ticksByKey);

  return { fileName, totalTime, root, flatProfile, samples, deoptEvents };
}

export function buildFlatProfile(parsed: ParsedCpuProfile): FlatProfileEntry[] {
  return parsed.flatProfile;
}

function buildFlatProfileFromTree(
  root: CallTreeNode,
  totalTime: number,
  rawNodes: CpuProfileNodeRaw[],
  ticksByKey: Map<string, number>,
): FlatProfileEntry[] {
  const map = new Map<string, {
    callFrame: CallTreeNode['callFrame'];
    selfTime: number;
    totalTime: number;
    hitCount: number;
    deoptReason?: string;
  }>();

  const deoptMap = new Map<string, string>();
  for (const n of rawNodes) {
    if (n.deoptReason && n.deoptReason.length > 0) {
      deoptMap.set(callFrameKey(n.callFrame), n.deoptReason);
    }
  }

  function walk(node: CallTreeNode): void {
    const key = callFrameKey(node.callFrame);
    const existing = map.get(key);
    if (existing) {
      existing.selfTime += node.selfTime;
      existing.totalTime += node.totalTime;
    } else {
      map.set(key, {
        callFrame: node.callFrame,
        selfTime: node.selfTime,
        totalTime: node.totalTime,
        hitCount: ticksByKey.get(key) ?? 0,
        deoptReason: deoptMap.get(key),
      });
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  walk(root);

  const entries: FlatProfileEntry[] = [];
  for (const entry of map.values()) {
    entries.push({
      callFrame: entry.callFrame,
      selfTime: entry.selfTime,
      totalTime: entry.totalTime,
      selfPercent: totalTime > 0 ? (entry.selfTime / totalTime) * 100 : 0,
      totalPercent: totalTime > 0 ? (entry.totalTime / totalTime) * 100 : 0,
      hitCount: entry.hitCount,
      deoptReason: entry.deoptReason,
    });
  }

  return entries.sort((a, b) => b.selfTime - a.selfTime);
}

export function compareCpuProfiles(
  baseline: ParsedCpuProfile,
  current: ParsedCpuProfile,
): CpuProfileComparison {
  const baseMap = new Map(baseline.flatProfile.map(e => [callFrameKey(e.callFrame), e]));
  const currMap = new Map(current.flatProfile.map(e => [callFrameKey(e.callFrame), e]));

  const added: FlatProfileEntry[] = [];
  const removed: FlatProfileEntry[] = [];
  const changed: CpuProfileDiff[] = [];

  for (const [key, curr] of currMap) {
    const base = baseMap.get(key);
    if (!base) {
      added.push(curr);
    } else {
      const selfDelta = curr.selfTime - base.selfTime;
      const totalDelta = curr.totalTime - base.totalTime;
      if (Math.abs(selfDelta) > 0.01 || Math.abs(totalDelta) > 0.01) {
        changed.push({
          callFrame: curr.callFrame,
          baselineSelfTime: base.selfTime,
          currentSelfTime: curr.selfTime,
          selfTimeDelta: selfDelta,
          baselineTotalTime: base.totalTime,
          currentTotalTime: curr.totalTime,
          totalTimeDelta: totalDelta,
        });
      }
    }
  }

  for (const [key, base] of baseMap) {
    if (!currMap.has(key)) {
      removed.push(base);
    }
  }

  return {
    baseline,
    current,
    added: added.sort((a, b) => b.selfTime - a.selfTime),
    removed: removed.sort((a, b) => b.selfTime - a.selfTime),
    changed: changed.sort((a, b) => Math.abs(b.selfTimeDelta) - Math.abs(a.selfTimeDelta)),
  };
}

function callFrameKey(cf: { functionName: string; url: string; lineNumber: number; columnNumber: number }): string {
  return `${cf.functionName}|${cf.url}|${cf.lineNumber}|${cf.columnNumber}`;
}
