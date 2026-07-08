import type { HeapGraph } from './heap-graph';

/**
 * Computes the dominator tree of a heap graph using the Cooper, Harvey,
 * Kennedy "A Simple, Fast Dominance Algorithm" (2001).
 *
 * Mutates `graph.nodes[].dominatorOrdinal` in place with the ordinal of
 * each node's immediate dominator (the root dominates itself).
 */
export function computeDominatorTree(graph: HeapGraph): void {
  const rootOrdinal = 0;
  const nodeCount = graph.nodeCount;

  // 1. DFS from root to compute post-order numbering.
  // postOrder[ordinal] = post-order index
  // ordinalOfPostOrder[postOrderIndex] = ordinal
  const postOrder = new Int32Array(nodeCount).fill(-1);
  const ordinalOfPostOrder: number[] = [];
  const visited = new Uint8Array(nodeCount);

  // Iterative post-order DFS to avoid stack overflow on large graphs.
  const stack: Array<{ ordinal: number; edgeIndex: number }> = [];
  visited[rootOrdinal] = 1;
  stack.push({ ordinal: rootOrdinal, edgeIndex: 0 });

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const edges = graph.getOutgoingEdges(frame.ordinal);

    if (frame.edgeIndex < edges.length) {
      const edge = edges[frame.edgeIndex];
      frame.edgeIndex++;
      const toOrdinal = edge.toNodeOrdinal;
      if (!visited[toOrdinal]) {
        visited[toOrdinal] = 1;
        stack.push({ ordinal: toOrdinal, edgeIndex: 0 });
      }
    } else {
      // All children visited; assign post-order number.
      postOrder[frame.ordinal] = ordinalOfPostOrder.length;
      ordinalOfPostOrder.push(frame.ordinal);
      stack.pop();
    }
  }

  const rootPostOrder = postOrder[rootOrdinal];

  // doms[postOrderIndex] = post-order index of immediate dominator
  const doms = new Int32Array(nodeCount).fill(-1);
  doms[rootPostOrder] = rootPostOrder;

  // Intersect walks up the dominator tree using doms[] (indexed by
  // post-order number) until both fingers meet at their common ancestor.
  function intersect(a: number, b: number): number {
    let finger1 = a;
    let finger2 = b;
    while (finger1 !== finger2) {
      while (finger1 < finger2) {
        finger1 = doms[finger1];
      }
      while (finger2 < finger1) {
        finger2 = doms[finger2];
      }
    }
    return finger1;
  }

  let changed = true;
  while (changed) {
    changed = false;

    // Iterate all nodes in reverse post-order (i.e. from highest post-order
    // index down to 0), skipping the root.
    for (let postIndex = ordinalOfPostOrder.length - 1; postIndex >= 0; postIndex--) {
      if (postIndex === rootPostOrder) {
        continue;
      }

      const ordinal = ordinalOfPostOrder[postIndex];
      const retainerEdges = graph.getRetainers(ordinal);

      let newIdom = -1;

      for (const retainerEdge of retainerEdges) {
        const predOrdinal = retainerEdge.fromNodeOrdinal;
        const predPostOrder = postOrder[predOrdinal];

        // Skip predecessors not reachable from root (not visited in DFS).
        if (predPostOrder === -1) {
          continue;
        }

        if (doms[predPostOrder] === -1) {
          // Predecessor not yet processed.
          continue;
        }

        if (newIdom === -1) {
          newIdom = predPostOrder;
        } else {
          newIdom = intersect(predPostOrder, newIdom);
        }
      }

      if (newIdom !== -1 && doms[postIndex] !== newIdom) {
        doms[postIndex] = newIdom;
        changed = true;
      }
    }
  }

  // Write back dominatorOrdinal to nodes.
  for (let postIndex = 0; postIndex < ordinalOfPostOrder.length; postIndex++) {
    const ordinal = ordinalOfPostOrder[postIndex];
    const domPostIndex = doms[postIndex];
    graph.nodes[ordinal].dominatorOrdinal =
      domPostIndex === -1 ? ordinal : ordinalOfPostOrder[domPostIndex];
  }
}

/**
 * Computes retained sizes for every node in the graph. Must be called
 * after `computeDominatorTree()`.
 *
 * Each node's retainedSize starts as its selfSize, then nodes are walked
 * bottom-up through the dominator tree (children before parents), adding
 * each node's retainedSize to its immediate dominator's retainedSize.
 */
export function computeRetainedSizes(graph: HeapGraph): void {
  const nodeCount = graph.nodeCount;

  for (let i = 0; i < nodeCount; i++) {
    graph.nodes[i].retainedSize = graph.nodes[i].selfSize;
  }

  // Order nodes by dominator-tree depth (descending) so that a node's
  // retained size is fully computed (including all of its dominator-tree
  // descendants) before it contributes to its own dominator.
  const depth = new Int32Array(nodeCount).fill(-1);

  function computeDepth(ordinal: number): number {
    if (depth[ordinal] !== -1) {
      return depth[ordinal];
    }
    const dom = graph.nodes[ordinal].dominatorOrdinal;
    if (dom === ordinal) {
      depth[ordinal] = 0;
      return 0;
    }
    const d = computeDepth(dom) + 1;
    depth[ordinal] = d;
    return d;
  }

  const order: number[] = [];
  for (let i = 0; i < nodeCount; i++) {
    computeDepth(i);
    order.push(i);
  }

  order.sort((a, b) => depth[b] - depth[a]);

  for (const ordinal of order) {
    const node = graph.nodes[ordinal];
    const dom = node.dominatorOrdinal;
    if (dom !== ordinal) {
      graph.nodes[dom].retainedSize += node.retainedSize;
    }
  }
}
