import {
  Component,
  input,
  signal,
  viewChild,
  ElementRef,
  effect,
  inject,
  Injector,
  afterNextRender,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ParsedCpuProfile, CallTreeNode } from '../../core/models/cpu-profile.model';

interface FlameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  node: CallTreeNode;
}

@Component({
  selector: 'app-cpu-flamechart',
  template: `
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <button
          class="px-3 py-1 text-xs rounded"
          [class.bg-emerald-500]="viewMode() === 'top-down'"
          [class.text-white]="viewMode() === 'top-down'"
          [class.bg-gray-700]="viewMode() !== 'top-down'"
          [class.text-gray-300]="viewMode() !== 'top-down'"
          (click)="viewMode.set('top-down')"
        >Top-Down</button>
        <button
          class="px-3 py-1 text-xs rounded"
          [class.bg-emerald-500]="viewMode() === 'bottom-up'"
          [class.text-white]="viewMode() === 'bottom-up'"
          [class.bg-gray-700]="viewMode() !== 'bottom-up'"
          [class.text-gray-300]="viewMode() !== 'bottom-up'"
          (click)="viewMode.set('bottom-up')"
        >Bottom-Up</button>
        <input
          type="text"
          placeholder="Search functions..."
          class="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded border border-gray-700 w-48"
          (input)="searchQuery.set($any($event.target).value)"
        />
      </div>
      <div class="relative w-full" style="height: 500px">
        <canvas #flameCanvas class="w-full h-full cursor-pointer"></canvas>
        @if (hoveredNode(); as node) {
          <div class="absolute top-2 left-2 bg-gray-900/90 text-white text-xs px-3 py-2 rounded pointer-events-none max-w-sm">
            <div class="font-semibold">{{ node.callFrame.functionName || '(anonymous)' }}</div>
            <div class="text-gray-400">{{ node.callFrame.url || '(native)' }}:{{ node.callFrame.lineNumber }}</div>
            <div>Self: {{ node.selfTime.toFixed(1) }}ms | Total: {{ node.totalTime.toFixed(1) }}ms</div>
          </div>
        }
      </div>
    </div>
  `,
})
export class CpuFlamechartComponent {
  readonly profile = input.required<ParsedCpuProfile>();
  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('flameCanvas');

  readonly hoveredNode = signal<CallTreeNode | null>(null);
  readonly viewMode = signal<'top-down' | 'bottom-up'>('top-down');
  readonly searchQuery = signal('');

  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private rects: FlameRect[] = [];
  private renderVersion = 0;

  private static readonly ROW_HEIGHT = 18;
  private static readonly COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  ];

  constructor() {
    afterNextRender(() => {
      effect(() => {
        const data = this.profile();
        const canvasEl = this.canvasRef();
        const _mode = this.viewMode();
        const _query = this.searchQuery();
        if (!data || !canvasEl) return;

        const version = ++this.renderVersion;
        queueMicrotask(() => {
          if (this.renderVersion !== version) return;
          this.renderFlameChart(data, canvasEl.nativeElement);
        });
      }, { injector: this.injector });
    });

    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        const canvas = this.canvasRef()?.nativeElement;
        if (!canvas) return;

        canvas.addEventListener('mousemove', (e: MouseEvent) => {
          const rect = canvas.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (canvas.width / rect.width);
          const y = (e.clientY - rect.top) * (canvas.height / rect.height);

          let found: CallTreeNode | null = null;
          for (const r of this.rects) {
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
              found = r.node;
            }
          }
          this.hoveredNode.set(found);
        });

        canvas.addEventListener('mouseleave', () => {
          this.hoveredNode.set(null);
        });
      });
    }
  }

  private renderFlameChart(profile: ParsedCpuProfile, canvas: HTMLCanvasElement): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayW, displayH);

    this.rects = [];
    const root = profile.root;
    if (root.totalTime <= 0) return;

    const query = this.searchQuery().toLowerCase();

    if (this.viewMode() === 'top-down') {
      this.renderTopDown(ctx, root, 0, displayW, 0, root.totalTime, query);
    } else {
      this.renderBottomUp(ctx, profile, displayW, displayH, query);
    }
  }

  private renderTopDown(
    ctx: CanvasRenderingContext2D,
    node: CallTreeNode,
    x: number,
    width: number,
    y: number,
    totalTime: number,
    query: string,
  ): void {
    const h = CpuFlamechartComponent.ROW_HEIGHT;
    const w = (node.totalTime / totalTime) * width;
    if (w < 1) return;

    const isMatch = query.length > 0 && node.callFrame.functionName.toLowerCase().includes(query);
    const isDimmed = query.length > 0 && !isMatch;

    ctx.fillStyle = isDimmed
      ? 'rgba(60, 60, 60, 0.5)'
      : this.getFrameColor(node);
    ctx.fillRect(x + 0.5, y + 0.5, Math.max(w - 1, 0), h - 1);

    if (isMatch) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(w - 1, 0), h - 1);
    }

    this.rects.push({ x, y, w, h, node });

    if (w > 30) {
      ctx.fillStyle = isDimmed ? '#666' : '#fff';
      ctx.font = '10px sans-serif';
      const maxChars = Math.floor(w / 6);
      const label = node.callFrame.functionName || '(anonymous)';
      const text = label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
      ctx.fillText(text, x + 3, y + 12);
    }

    let childX = x;
    for (const child of node.children) {
      this.renderTopDown(ctx, child, childX, width, y + h, totalTime, query);
      childX += (child.totalTime / totalTime) * width;
    }
  }

  private renderBottomUp(
    ctx: CanvasRenderingContext2D,
    profile: ParsedCpuProfile,
    displayW: number,
    displayH: number,
    query: string,
  ): void {
    const h = CpuFlamechartComponent.ROW_HEIGHT;
    const entries = profile.flatProfile
      .filter(e => e.callFrame.functionName !== '(root)')
      .slice(0, Math.floor(displayH / h));

    let y = 0;
    for (const entry of entries) {
      const w = (entry.selfPercent / 100) * displayW;
      const isMatch = query.length > 0 && entry.callFrame.functionName.toLowerCase().includes(query);
      const isDimmed = query.length > 0 && !isMatch;

      const tempNode: CallTreeNode = {
        id: 0,
        callFrame: entry.callFrame,
        selfTime: entry.selfTime,
        totalTime: entry.totalTime,
        children: [],
        depth: 0,
      };

      ctx.fillStyle = isDimmed ? 'rgba(60, 60, 60, 0.5)' : this.getFrameColor(tempNode);
      ctx.fillRect(0.5, y + 0.5, Math.max(w - 1, 0), h - 1);

      this.rects.push({ x: 0, y, w: displayW, h, node: tempNode });

      if (isMatch) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(0.5, y + 0.5, Math.max(w - 1, 0), h - 1);
      }

      ctx.fillStyle = isDimmed ? '#666' : '#fff';
      ctx.font = '10px sans-serif';
      const label = `${entry.callFrame.functionName || '(anonymous)'} — ${entry.selfPercent.toFixed(1)}%`;
      const maxChars = Math.floor(displayW / 6);
      const text = label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
      ctx.fillText(text, w + 6, y + 12);

      y += h;
    }
  }

  private getFrameColor(node: CallTreeNode): string {
    const name = node.callFrame.functionName;
    if (name === '(idle)') return '#374151';
    if (name === '(program)') return '#4b5563';
    if (name.includes('garbage collector') || name.includes('GC')) return '#dc2626';

    const hash = (name + node.callFrame.url).split('').reduce((h, c) => h + c.charCodeAt(0), 0);
    return CpuFlamechartComponent.COLORS[hash % CpuFlamechartComponent.COLORS.length];
  }
}
