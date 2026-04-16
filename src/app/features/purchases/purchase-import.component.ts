import {
  Component, OnInit, inject, signal, computed, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { take } from 'rxjs/operators';
import {
  CardModule, ButtonModule, BadgeModule, SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { NotificationService } from '../../core/services/notification.service';
import {
  PurchaseImporterService,
  SriImportRecord,
  SriImportLine,
  ImportSummary,
} from './services/purchase-importer.service';
import { ProductsService } from '../products/services/products.service';
import { Product } from '../products/models/product.interface';

@Component({
  selector:    'app-purchase-import',
  standalone:  true,
  templateUrl: './purchase-import.component.html',
  styleUrl:    './purchase-import.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, BadgeModule, SpinnerModule,
    IconModule,
  ],
})
export class PurchaseImportComponent implements OnInit {

  // ── Dependencies ───────────────────────────────────────────────────────────
  readonly router        = inject(Router);
  private importer       = inject(PurchaseImporterService);
  private productsSvc    = inject(ProductsService);
  private notifications  = inject(NotificationService);

  @ViewChild('fileInput')    fileInputRef!:    ElementRef<HTMLInputElement>;
  @ViewChild('xmlRowInput')  xmlRowInputRef!:  ElementRef<HTMLInputElement>;

  // ── State ──────────────────────────────────────────────────────────────────
  step     = signal<'upload' | 'preview' | 'importing' | 'done'>('upload');
  files    = signal<File[]>([]);
  records  = signal<SriImportRecord[]>([]);
  parsing  = signal(false);
  progress = signal(0);
  current  = signal(0);
  total    = signal(0);
  summary  = signal<ImportSummary | null>(null);
  dragOver = signal(false);

  // ── Product catalog for mapping picker ────────────────────────────────────
  products        = signal<Product[]>([]);
  productSearch   = signal<string>('');

  productResults = computed(() => {
    const term = this.productSearch().toLowerCase().trim();
    if (!term || term.length < 2) return [];
    return this.products().filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.sku ?? '').toLowerCase().includes(term)
    ).slice(0, 8);
  });

  // ── Computed ───────────────────────────────────────────────────────────────
  okCount        = computed(() => this.records().filter(r => r.status === 'ok').length);
  duplicateCount = computed(() => this.records().filter(r => r.status === 'duplicate').length);
  errorCount     = computed(() => this.records().filter(r => r.status === 'error').length);
  hasOk          = computed(() => this.okCount() > 0);
  unmappedTotal  = computed(() =>
    this.records()
      .filter(r => r.status === 'ok')
      .reduce((acc, r) => acc + (r.unmappedCount ?? 0), 0)
  );

  // ── Homologation: active picker target ────────────────────────────────────
  activePicker    = signal<{ rIdx: number; lIdx: number } | null>(null);
  activeXmlRowIdx = signal<number | null>(null);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.productsSvc.getActiveProducts().pipe(take(1)).subscribe({
      next: list => this.products.set(list.sort((a, b) => a.name.localeCompare(b.name, 'es')))
    });
  }

  // ── Homologation ──────────────────────────────────────────────────────────

  openPicker(rIdx: number, lIdx: number): void {
    this.activePicker.set({ rIdx, lIdx });
    this.productSearch.set('');
  }

  closePicker(): void {
    this.activePicker.set(null);
    this.productSearch.set('');
  }

  assignProduct(product: Product): void {
    const picker = this.activePicker();
    if (!picker) return;
    this.records.update(list => {
      const copy   = [...list];
      const rec    = { ...copy[picker.rIdx] };
      const lines  = [...rec.lines];
      lines[picker.lIdx] = {
        ...lines[picker.lIdx],
        mappedProductId:   product.id,
        mappedProductName: product.name,
        mappedProductSku:  product.sku ?? '',
        needsMapping:      false,
      };
      rec.lines         = lines;
      rec.unmappedCount = lines.filter(l => l.needsMapping).length;
      copy[picker.rIdx] = rec;
      return copy;
    });
    this.closePicker();
  }

  clearMapping(rIdx: number, lIdx: number): void {
    this.records.update(list => {
      const copy   = [...list];
      const rec    = { ...copy[rIdx] };
      const lines  = [...rec.lines];
      lines[lIdx] = {
        ...lines[lIdx],
        mappedProductId:   undefined,
        mappedProductName: undefined,
        mappedProductSku:  undefined,
        needsMapping:      true,
      };
      rec.lines         = lines;
      rec.unmappedCount = lines.filter(l => l.needsMapping).length;
      copy[rIdx]        = rec;
      return copy;
    });
  }

  toggleRemember(rIdx: number, lIdx: number): void {
    this.records.update(list => {
      const copy   = [...list];
      const rec    = { ...copy[rIdx] };
      const lines  = [...rec.lines];
      lines[lIdx]  = { ...lines[lIdx], rememberMapping: !lines[lIdx].rememberMapping };
      rec.lines    = lines;
      copy[rIdx]   = rec;
      return copy;
    });
  }

  // ── Per-row XML enrichment ────────────────────────────────────────────────

  openXmlPicker(rIdx: number): void {
    this.activeXmlRowIdx.set(rIdx);
    this.xmlRowInputRef.nativeElement.click();
  }

  onXmlRowFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    const rIdx  = this.activeXmlRowIdx();
    input.value = '';
    this.activeXmlRowIdx.set(null);
    if (file && rIdx !== null) {
      this.enrichWithXmlFile(rIdx, file);
    }
  }

  async enrichWithXmlFile(rIdx: number, file: File): Promise<void> {
    const record = this.records()[rIdx];
    if (!record) return;
    this.parsing.set(true);
    try {
      const enriched = await this.importer.enrichRecordWithXml(record, file);
      this.records.update(list => {
        const copy = [...list];
        copy[rIdx] = enriched;
        return copy;
      });
      this.notifications.success(`XML cargado: ${enriched.lines.length} línea(s) de detalle añadidas`);
    } catch (err: any) {
      this.notifications.error('Error al leer el XML: ' + (err?.message ?? err));
    } finally {
      this.parsing.set(false);
    }
  }

  // ── File selection ─────────────────────────────────────────────────────────

  openFilePicker(): void {
    this.fileInputRef.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  removeFile(name: string, domEvent: Event): void {
    domEvent.stopPropagation();
    this.files.update(list => list.filter(f => f.name !== name));
  }

  // ── Parse ──────────────────────────────────────────────────────────────────

  async parseFiles(): Promise<void> {
    if (!this.files().length) return;
    this.parsing.set(true);
    try {
      const records = await this.importer.parseFiles(this.files());
      this.records.set(records);
      this.step.set('preview');
    } catch (err: any) {
      this.notifications.error('Error al analizar archivos: ' + (err?.message ?? err));
    } finally {
      this.parsing.set(false);
    }
  }

  removeRecord(index: number): void {
    this.records.update(list => list.filter((_, i) => i !== index));
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async confirmImport(): Promise<void> {
    this.total.set(this.okCount());
    this.current.set(0);
    this.progress.set(0);
    this.step.set('importing');

    try {
      const summary = await this.importer.importRecords(this.records(), (cur, tot) => {
        this.current.set(cur);
        this.progress.set(tot > 0 ? Math.round((cur / tot) * 100) : 0);
      });
      this.summary.set(summary);
      this.step.set('done');
    } catch (err: any) {
      this.step.set('preview');
      this.notifications.error('Error durante la importación: ' + (err?.message ?? err));
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  goBack(): void {
    this.step.set('upload');
    this.records.set([]);
  }

  resetAndImportMore(): void {
    this.step.set('upload');
    this.files.set([]);
    this.records.set([]);
    this.summary.set(null);
  }

  goToList(): void {
    this.router.navigate(['/purchases']);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private addFiles(newFiles: File[]): void {
    const accepted = newFiles.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext === 'xml' || ext === 'txt' || ext === 'zip';
    });
    if (!accepted.length) {
      this.notifications.warning('Solo se aceptan archivos TXT (.txt), XML (.xml) o ZIP (.zip)');
      return;
    }
    const existing = new Set(this.files().map(f => f.name));
    const unique   = accepted.filter(f => !existing.has(f.name));
    this.files.update(list => [...list, ...unique]);
  }
}
