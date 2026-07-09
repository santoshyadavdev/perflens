/// <reference lib="webworker" />

import { buildCallTree } from './cpu-profile-parser';
import type { CpuProfileRaw, CpuWorkerMessage } from '../models/cpu-profile.model';

addEventListener('message', async (event: MessageEvent) => {
  const { file, fileName } = event.data as { file: File; fileName: string };

  try {
    postProgress('Reading file...', 10);
    const text = await file.text();

    postProgress('Parsing JSON...', 30);
    const raw: CpuProfileRaw = JSON.parse(text);

    postProgress('Building call tree...', 60);
    const profile = buildCallTree(raw, fileName);

    postProgress('Finalizing...', 90);

    const result: CpuWorkerMessage = { type: 'result', profile };
    postMessage(result);
  } catch (err) {
    const error: CpuWorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error parsing CPU profile',
    };
    postMessage(error);
  }
});

function postProgress(phase: string, percent: number): void {
  const msg: CpuWorkerMessage = { type: 'progress', phase, percent };
  postMessage(msg);
}
