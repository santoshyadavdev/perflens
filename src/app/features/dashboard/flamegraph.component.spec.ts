import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlamegraphComponent } from './flamegraph.component';
import { ParsedTrace, TraceEvent } from '../../core/models/trace-event.model';

function makeTrace(traceEvents: TraceEvent[]): ParsedTrace {
  return {
    traceEvents,
    metadata: {
      traceStartTime: 0,
      traceEndTime: 20_000,
      url: 'https://example.com',
    },
    mainThreadId: 1,
    navigationStart: 0,
  };
}

describe('FlamegraphComponent', () => {
  let fixture: ComponentFixture<FlamegraphComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlamegraphComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FlamegraphComponent);
  });

  it('creates successfully', () => {
    fixture.componentRef.setInput('trace', makeTrace([]));
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('buildHierarchy transforms main-thread trace events into a flamegraph tree', () => {
    const trace = makeTrace([
      {
        name: 'RootTask',
        cat: 'devtools.timeline',
        ph: 'X',
        ts: 0,
        dur: 10_000,
        pid: 1,
        tid: 1,
      },
      {
        name: 'FunctionCall',
        cat: 'devtools.timeline',
        ph: 'X',
        ts: 1_000,
        dur: 4_000,
        pid: 1,
        tid: 1,
        args: { data: { functionName: 'bootstrap', url: 'https://cdn.example.com/main.js' } },
      },
      {
        name: 'TinyTask',
        cat: 'devtools.timeline',
        ph: 'X',
        ts: 1_500,
        dur: 200,
        pid: 1,
        tid: 1,
      },
      {
        name: 'EvaluateScript',
        cat: 'devtools.timeline',
        ph: 'X',
        ts: 2_500,
        dur: 1_000,
        pid: 1,
        tid: 1,
        args: { data: { url: 'https://cdn.example.com/vendor.js' } },
      },
      {
        name: 'Layout',
        cat: 'devtools.timeline',
        ph: 'X',
        ts: 6_000,
        dur: 2_000,
        pid: 1,
        tid: 1,
      },
      {
        name: 'IgnoredOtherThread',
        cat: 'devtools.timeline',
        ph: 'X',
        ts: 500,
        dur: 8_000,
        pid: 1,
        tid: 2,
      },
      {
        name: 'IgnoredInstant',
        cat: 'devtools.timeline',
        ph: 'I',
        ts: 700,
        pid: 1,
        tid: 1,
      },
    ]);

    const hierarchy = fixture.componentInstance.buildHierarchy(trace);

    expect(hierarchy).toEqual({
      name: 'Main Thread',
      value: 10,
      children: [
        {
          name: 'RootTask',
          value: 10,
          children: [
            {
              name: 'bootstrap (main.js)',
              value: 4,
              children: [
                {
                  name: 'EvaluateScript (vendor.js)',
                  value: 1,
                  children: [],
                },
              ],
            },
            {
              name: 'Layout',
              value: 2,
              children: [],
            },
          ],
        },
      ],
    });
  });

  it('buildHierarchy prefers function names over trace event names', () => {
    const trace = makeTrace([
      {
        name: 'FunctionCall',
        cat: 'devtools.timeline',
        ph: 'X',
        ts: 0,
        dur: 2_000,
        pid: 1,
        tid: 1,
        args: { data: { functionName: 'initApp', url: 'https://example.com/assets/app.bundle.js' } },
      },
    ]);

    const hierarchy = fixture.componentInstance.buildHierarchy(trace);

    expect(hierarchy.children?.[0]?.name).toBe('initApp (app.bundle.js)');
  });

  it('buildHierarchy keeps longer same-start events above shorter nested events', () => {
    const trace = makeTrace([
      {
        name: 'InnerTask',
        cat: 'devtools.timeline',
        ph: 'X',
        ts: 0,
        dur: 2_000,
        pid: 1,
        tid: 1,
      },
      {
        name: 'OuterTask',
        cat: 'devtools.timeline',
        ph: 'X',
        ts: 0,
        dur: 10_000,
        pid: 1,
        tid: 1,
      },
    ]);

    const hierarchy = fixture.componentInstance.buildHierarchy(trace);

    expect(hierarchy).toEqual({
      name: 'Main Thread',
      value: 10,
      children: [
        {
          name: 'OuterTask',
          value: 10,
          children: [
            {
              name: 'InnerTask',
              value: 2,
              children: [],
            },
          ],
        },
      ],
    });
  });
});
