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

declare module 'd3-selection' {
  export interface D3Selection {
    datum(data: unknown): D3Selection;
    call(chart: (selection: unknown) => void): D3Selection;
  }

  export function select(element: Element): D3Selection;
}
