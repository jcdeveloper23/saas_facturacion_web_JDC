import {
  Component, inject, signal, computed, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  CardModule, ButtonModule, BadgeModule, SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { NotificationService } from '../../core/services/notification.service';
import {
  PurchaseImporterService,
  SriImportRecord,
  ImportSummary,
} from './services/purchase-importer.service';

@Component({
  selector:    'app-purchase-import',
  standalone:  true,
  templateUrl: './purchase-import.component.html',
  styleUrl:    './purchase-import.component.scss',
  imports: [
    CommonModule,
    CardModule, ButtonModule, BadgeModule, SpinnerModule,
    IconModule,
  ],
})
export class PurchaseImportComponent {

  // ── Dependencies ───────────────────────────────────────────────────────────
  readonly router        = inject(Router);
  private importer       = inject(PurchaseImporterService);
  private notifications  = inject(NotificationService);

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

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

  // ── Computed ───────────────────────────────────────────────────────────────
  okCount        = computed(() => this.records().filter(r => r.status === 'ok').length);
  duplicateCount = computed(() => this.records().filter(r => r.status === 'duplicate').length);
  errorCount     = computed(() => this.records().filter(r => r.status === 'error').length);
  hasOk          = computed(() => this.okCount() > 0);

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
      return ext === 'xml' || ext === 'txt';
    });
    if (!accepted.length) {
      this.notifications.warning('Solo se aceptan archivos TXT (.txt) y XML (.xml)');
      return;
    }
    const existing = new Set(this.files().map(f => f.name));
    const unique   = accepted.filter(f => !existing.has(f.name));
    this.files.update(list => [...list, ...unique]);
  }
}
