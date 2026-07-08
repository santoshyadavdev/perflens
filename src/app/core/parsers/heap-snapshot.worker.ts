/// <reference lib="webworker" />

import { HeapGraph } from './heap-graph';
import { computeDominatorTree, computeRetainedSizes } from './dominator-tree';
import { analyzeSnapshot } from './snapshot-analyzer';
import type { HeapWorkerMessage, RawHeapSnapshot } from '../models/heap-snapshot.model';

addEventListener('message', async (event: MessageEvent) => {
  const { file, fileName } = event.data as { file: File; fileName: string };

  try {
    postProgress('Reading file...', 10);

    const text = await file.text();

    postProgress('Parsing JSON...', 30);
    const raw: RawHeapSnapshot = JSON.parse(text);

    postProgress('Building heap graph...', 50);
    const graph = new HeapGraph(raw);

    postProgress('Computing dominator tree...', 70);
    computeDominatorTree(graph);

    postProgress('Computing retained sizes...', 80);
    computeRetainedSizes(graph);

    postProgress('Analyzing snapshot...', 90);
    const snapshot = analyzeSnapshot(graph, fileName);

    const result: HeapWorkerMessage = { type: 'result', snapshot };
    postMessage(result);
  } catch (err) {
    const error: HeapWorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error parsing heap snapshot',
    };
    postMessage(error);
  }
});

function postProgress(phase: string, percent: number): void {
  const msg: HeapWorkerMessage = { type: 'progress', phase, percent };
  postMessage(msg);
}
