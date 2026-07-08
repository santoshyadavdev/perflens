import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UploadComponent } from './upload.component';
import { TraceStoreService } from '../../core/services/trace-store.service';
import { provideRouter } from '@angular/router';

describe('UploadComponent', () => {
  let component: UploadComponent;
  let fixture: ComponentFixture<UploadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the drop zone', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="drop-zone"]')).toBeTruthy();
  });

  it('renders privacy badges', () => {
    const el: HTMLElement = fixture.nativeElement;
    const badges = el.querySelectorAll('[data-testid="privacy-badge"]');
    expect(badges.length).toBe(2);
  });

  it('accepts files via input', () => {
    const navigateSpy = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    const mockFile = new File(['{"traceEvents":[]}'], 'trace.json', { type: 'application/json' });
    component.onFilesSelected([mockFile]);
    expect(component.isProcessing()).toBe(true);
  });

  it('should store raw File for heap-snapshot format without JSON.parse', async () => {
    vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);

    const heapContent = JSON.stringify({
      snapshot: { meta: { node_fields: [] }, node_count: 0, edge_count: 0 },
      nodes: [], edges: [], strings: [],
    });
    const file = new File([heapContent], 'test.heapsnapshot', { type: 'application/json' });

    await component.onFilesSelected([file]);

    const traceStore = TestBed.inject(TraceStoreService);
    const stored = traceStore.files();
    expect(stored.length).toBe(1);
    expect(stored[0].format).toBe('heap-snapshot');
    // content must be the raw File object, not a parsed object
    expect(stored[0].content).toBeInstanceOf(File);
    expect(stored[0].content).toBe(file);
  });
});
