import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace, TraceEvent } from '../../models/trace-event.model';
import { ActionItem } from '../../models/action-item.model';

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/webp',
  'image/avif',
]);

const MODERN_FORMATS = new Set(['image/webp', 'image/avif']);

const SMALL_IMAGE_THRESHOLD = 50 * 1024;    // 50KB — skip entirely
const LARGE_IMAGE_THRESHOLD = 500 * 1024;   // 500KB — critical + suggest resize

interface ImageRecord {
  url: string;
  mimeType?: string;
  size?: number;
  receivedDataBytes?: number;
}

export class ImageDeliveryRule implements AnalysisRule {
  readonly name = 'image-delivery';

  analyze(trace: ParsedTrace): RuleResult {
    const images = this.buildImageMap(trace.traceEvents);
    const candidates = Array.from(images.values()).filter(({ mimeType, size }) => {
      if (!mimeType || !size || !IMAGE_MIME_TYPES.has(mimeType)) return false;
      if (size <= SMALL_IMAGE_THRESHOLD) return false;

      const isModern = MODERN_FORMATS.has(mimeType);
      const isLarge = size > LARGE_IMAGE_THRESHOLD;
      return !isModern || isLarge;
    });
    const actionItems: ActionItem[] = [];
    const largestCandidateSize = Math.max(...candidates.map(image => image.size ?? 0), 0);

    let idx = 0;
    for (const img of candidates) {
      const { url, mimeType, size } = img;
      if (!mimeType || !size) continue;

      const isModern = MODERN_FORMATS.has(mimeType);
      const isLarge = size > LARGE_IMAGE_THRESHOLD;
      const isLikelyLcp = size === largestCandidateSize;
      const sizeKb = (size / 1024).toFixed(0);
      const fileName = url.split('/').pop()?.split('?')[0] ?? url;

      const severity = isLarge ? 'critical' : 'warning';
      const fixes: string[] = [];

      if (!isModern) {
        fixes.push(`Convert to WebP or AVIF: \`cwebp -q 80 ${fileName} -o ${fileName.replace(/\.[^.]+$/, '.webp')}\``);
      }
      if (isLarge) {
        fixes.push(`Resize to the display dimensions before serving — serving oversized images wastes bandwidth.`);
      }
      fixes.push(`Add \`loading="lazy"\` for below-the-fold images.`);
      fixes.push(`Add explicit \`width\` and \`height\` attributes to prevent layout shift.`);
      fixes.push(`Use \`fetchpriority="high"\` if this is the LCP image to prioritize loading.`);

      const reasons: string[] = [];
      if (!isModern) reasons.push(`non-modern format (${mimeType})`);
      if (isLarge) reasons.push(`large size (${sizeKb}KB > 500KB)`);

      actionItems.push({
        id: `image-delivery-${idx++}`,
        severity,
        title: `Unoptimized image: ${fileName} (${sizeKb}KB)`,
        detail: `${fileName} is ${sizeKb}KB with ${reasons.join(' and ')}. Optimizing images reduces LCP and overall page weight.`,
        metric: isLikelyLcp ? 'LCP' : 'SIZE',
        fix: fixes.join('\n'),
        source: { scriptUrl: url },
      });
    }

    return { actionItems, metrics: [] };
  }

  private buildImageMap(events: TraceEvent[]): Map<string, ImageRecord> {
    const images = new Map<string, ImageRecord>();

    for (const e of events) {
      const data = e.args?.['data'] as Record<string, unknown> | undefined;
      if (!data) continue;
      const requestId = data['requestId'] as string | undefined;
      if (!requestId) continue;

      if (e.name === 'ResourceSendRequest') {
        const url = data['url'] as string | undefined;
        if (url) {
          images.set(requestId, { url });
        }
      } else if (e.name === 'ResourceReceiveResponse') {
        const record = images.get(requestId);
        if (record) {
          record.mimeType = data['mimeType'] as string | undefined;
          const size = data['encodedDataLength'] as number | undefined;
          if (size) record.size = size;
        }
      } else if (e.name === 'ResourceReceivedData') {
        const record = images.get(requestId);
        if (record) {
          record.receivedDataBytes = (record.receivedDataBytes ?? 0) + ((data['encodedDataLength'] as number | undefined) ?? 0);
        }
      } else if (e.name === 'ResourceFinish') {
        const record = images.get(requestId);
        if (record) {
          const size = data['encodedDataLength'] as number | undefined;
          if (size) record.size = size;
        }
      }
    }

    for (const record of images.values()) {
      if (!record.size && record.receivedDataBytes) {
        record.size = record.receivedDataBytes;
      }
    }

    return images;
  }
}
