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
import type { TreemapNode } from '../../core/models/heap-snapshot.model';
import { formatBytes } from '../../core/utils/format';

interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
  node: TreemapNode;
  depth: number;
}

@Component({
  selector: 'app-heap-treemap',
  template: `
    <div class="relative w-full" style="height: 500px">
      <canvas #treemapCanvas class="w-full h-full cursor-pointer"></canvas>
      @if (hoveredNode(); as node) {
        <div class="absolute top-2 left-2 bg-gray-900/90 text-white text-sm px-3 py-2 rounded pointer-events-none">
          {{ node.name }} — {{ formatBytes(node.value) }}
        </div>
      }
    </div>
  `,
})
export class HeapTreemapComponent {
  readonly treemapData = input.required<TreemapNode>();
  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('treemapCanvas');

  readonly hoveredNode = signal<TreemapNode | null>(null);

  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private rects: LayoutRect[] = [];
  private renderVersion = 0;

  constructor() {
    afterNextRender(() => {
      effect(() => {
        const data = this.treemapData();
        const canvasEl = this.canvasRef();
        if (!data || !canvasEl) return;

        const version = ++this.renderVersion;
        queueMicrotask(() => {
          if (this.renderVersion !== version) return;
          this.renderTreemap(data, canvasEl.nativeElement);
        });
      }, { injector: this.injector });
    });

    // Mouse move handler for hover
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        const canvas = this.canvasRef()?.nativeElement;
        if (!canvas) return;

        canvas.addEventListener('mousemove', (e: MouseEvent) => {
          const rect = canvas.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (canvas.width / rect.width);
          const y = (e.clientY - rect.top) * (canvas.height / rect.height);

          let found: TreemapNode | null = null;
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

  private renderTreemap(data: TreemapNode, canvas: HTMLCanvasElement): void {
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
    this.squarify(data.children ?? [], 0, 0, displayW, displayH, 0, ctx);
  }

  private squarify(
    nodes: TreemapNode[],
    x: number, y: number, w: number, h: number,
    depth: number,
    ctx: CanvasRenderingContext2D,
  ): void {
    if (nodes.length === 0 || w < 1 || h < 1) return;

    const total = nodes.reduce((s, n) => s + n.value, 0);
    if (total === 0) return;

    const sorted = [...nodes].sort((a, b) => b.value - a.value);

    let cx = x, cy = y, cw = w, ch = h;

    for (const node of sorted) {
      const ratio = node.value / total;
      let nw: number, nh: number, nx: number, ny: number;

      if (cw >= ch) {
        nw = cw * ratio;
        nh = ch;
        nx = cx;
        ny = cy;
        cx += nw;
        cw -= nw;
      } else {
        nw = cw;
        nh = ch * ratio;
        nx = cx;
        ny = cy;
        cy += nh;
        ch -= nh;
      }

      const color = this.getColor(node, depth);
      ctx.fillStyle = color;
      ctx.fillRect(nx + 1, ny + 1, Math.max(nw - 2, 0), Math.max(nh - 2, 0));

      this.rects.push({ x: nx, y: ny, w: nw, h: nh, node, depth });

      if (nw > 40 && nh > 16) {
        ctx.fillStyle = '#fff';
        ctx.font = '11px sans-serif';
        const label = node.name.length > nw / 7 ? node.name.slice(0, Math.floor(nw / 7)) + '…' : node.name;
        ctx.fillText(label, nx + 4, ny + 14);
      }

      if (node.children && node.children.length > 0 && nw > 20 && nh > 20) {
        this.squarify(node.children, nx + 2, ny + 18, Math.max(nw - 4, 0), Math.max(nh - 20, 0), depth + 1, ctx);
      }
    }
  }

  private getColor(node: TreemapNode, depth: number): string {
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    ];
    const hash = node.name.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
    const baseColor = colors[(hash + depth) % colors.length];
    const darken = Math.max(0.6, 1 - depth * 0.15);
    return this.adjustBrightness(baseColor, darken);
  }

  private adjustBrightness(hex: string, factor: number): string {
    const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
    const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
    const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  }

  readonly formatBytes = formatBytes;
}
