import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take } from 'rxjs';
import {
  CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule, TooltipModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { RetentionsService } from '../../../retentions/services/retentions.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Retention } from '../../../retentions/models/retention.interface';
import { Form103Data } from '../../models/sri-forms.interface';

@Component({
  selector: 'app-formulario103-page',
  standalone: true,
  templateUrl: './formulario103-page.component.html',
  styleUrl:    './formulario103-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule, TooltipModule, IconModule
  ]
})
export class Formulario103PageComponent implements OnInit, OnDestroy {
  private svc            = inject(RetentionsService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  // ── Selectors ─────────────────────────────────────────────────────────────
  readonly currentYear = new Date().getFullYear();
  readonly years       = Array.from({ length: 4 }, (_, i) => this.currentYear - i);
  readonly months      = [
    { value: 1,  label: 'Enero' },      { value: 2,  label: 'Febrero' },
    { value: 3,  label: 'Marzo' },      { value: 4,  label: 'Abril' },
    { value: 5,  label: 'Mayo' },       { value: 6,  label: 'Junio' },
    { value: 7,  label: 'Julio' },      { value: 8,  label: 'Agosto' },
    { value: 9,  label: 'Septiembre' }, { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },  { value: 12, label: 'Diciembre' }
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  selectedYear  = signal(this.currentYear);
  selectedMonth = signal(new Date().getMonth() + 1);
  generating    = signal(false);
  generated     = signal(false);
  form103       = signal<Form103Data | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────
  selectedMonthLabel = computed(() =>
    this.months.find(m => m.value === this.selectedMonth())?.label ?? ''
  );

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  // Agrega retenciones emitidas (comprobantes a proveedores) del mes por
  // código de retención (pctCode), mapeado a los casilleros oficiales del
  // Formulario 103 verificados contra el instructivo del SRI y la Resolución
  // NAC-DGERCGC26-00000009 — ver comentario en Form103Data (sri-forms.interface.ts)
  // para el detalle de qué queda fuera de alcance.
  async generate(): Promise<void> {
    this.generating.set(true);
    this.generated.set(false);
    this.form103.set(null);

    try {
      const year  = this.selectedYear();
      const month = this.selectedMonth();

      const retentionsObs = this.svc.getRetentions({ year: String(year), status: 'issued' });

      await new Promise<void>((resolve, reject) => {
        const sub = retentionsObs.subscribe({
          next: (retentions: Retention[]) => {
            const monthly = retentions.filter(r => {
              if (r.isVoid) return false;
              const d = r.date?.toDate ? r.date.toDate() : new Date(r.date as any);
              return d.getFullYear() === year && d.getMonth() + 1 === month;
            });

            const acc: Form103Data = {
              c303: 0, c304: 0, c307: 0, c308: 0, c309: 0, c310: 0, c312: 0,
              c314: 0, c319: 0, c322: 0, c323: 0, c344: 0, exterior: 0, total: 0
            };

            for (const r of monthly) {
              for (const tax of r.taxes ?? []) {
                if (tax.taxCode !== '1') continue; // Formulario 103 = solo retenciones de IR
                const amount = tax.retainedAmount ?? 0;
                switch (tax.pctCode) {
                  case '303': acc.c303 += amount; break;
                  case '304': acc.c304 += amount; break;
                  case '307': acc.c307 += amount; break;
                  case '308': acc.c308 += amount; break;
                  case '309': acc.c309 += amount; break;
                  case '310': acc.c310 += amount; break;
                  case '312': acc.c312 += amount; break;
                  case '314': acc.c314 += amount; break;
                  case '319': acc.c319 += amount; break;
                  case '322': acc.c322 += amount; break;
                  case '323': acc.c323 += amount; break;
                  case '340': acc.exterior += amount; break;
                  case '343': acc.c344 += amount; break;
                  default: acc.c344 += amount; // código no catalogado — se agrupa como "otras"
                }
              }
            }

            const r2 = (n: number) => Math.round(n * 100) / 100;
            (Object.keys(acc) as (keyof Form103Data)[]).forEach(k => { acc[k] = r2(acc[k]); });
            acc.total = r2(
              acc.c303 + acc.c304 + acc.c307 + acc.c308 + acc.c309 + acc.c310 +
              acc.c312 + acc.c314 + acc.c319 + acc.c322 + acc.c323 + acc.c344 + acc.exterior
            );

            this.form103.set(acc);
            this.generated.set(true);
            sub.unsubscribe();
            resolve();
          },
          error: (err: any) => { sub.unsubscribe(); reject(err); }
        });
      });
    } catch (err: any) {
      this.notifications.error('Error generando Formulario 103: ' + (err?.message ?? err));
    } finally {
      this.generating.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  printReport(): void { window.print(); }
  fmt(n: number): string { return (n ?? 0).toFixed(2); }
}
