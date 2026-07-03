declare module 'd3-flame-graph' {
  export interface FlamegraphChart {
    (selection: unknown): void;
    width(size: number): FlamegraphChart;
    cellHeight(size: number): FlamegraphChart;
    minFrameSize(size: number): FlamegraphChart;
    transitionDuration(duration: number): FlamegraphChart;
    setDetailsHandler(handler: (details: string | null) => void): FlamegraphChart;
    resetZoom(): FlamegraphChart;
    destroy(): FlamegraphChart;
  }

  export default function flamegraph(): FlamegraphChart;
}
