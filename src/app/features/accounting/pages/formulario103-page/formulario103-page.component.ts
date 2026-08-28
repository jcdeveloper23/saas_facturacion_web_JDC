import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import {
  CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule, TooltipModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { RetentionsService } from '../../../retentions/services/retentions.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Retention } from '../../../retentions/models/retention.interface';
import { Form103Data } from '../../models/sri-forms.interface';

type DeclaracionTipo = 'original' | 'sustitutiva';

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

  // ── Estado del formulario de selección ───────────────────────────────────
  selectedYear        = signal(this.currentYear);
  selectedMonth       = signal(new Date().getMonth() + 1);
  declaracionTipo     = signal<DeclaracionTipo>('original');
  formNumeroSustituye = signal('');

  // ── Estado de generación ─────────────────────────────────────────────────
  generating = signal(false);
  generated  = signal(false);
  form103    = signal<Form103Data | null>(null);

  // ── Campos editables de pronósticos deportivos ───────────────────────────
  editable3483 = signal(0); // comisiones pronósticos
  editable3484 = signal(0); // premios pronósticos (resta)

  // ── Computed ──────────────────────────────────────────────────────────────
  selectedMonthLabel = computed(() =>
    this.months.find(m => m.value === this.selectedMonth())?.label ?? ''
  );

  // Recalcula casilleros de pronósticos cuando el usuario edita 3483/3484
  pronosticosActualizados = computed(() => {
    const f = this.form103();
    if (!f) return null;
    const c3483 = Math.max(0, this.editable3483());
    const c3484 = Math.max(0, this.editable3484());
    // 3480 = base desde comprobantes + comisiones - premios (no puede ser negativo)
    const c3480 = r2(Math.max(0, f.c3480Raw + c3483 - c3484));
    const c3980 = r2(c3480 * 0.15); // 15% de la base
    const inconsistente = (c3483 + c3484) > f.c3480Raw && f.c3480Raw > 0
      || c3483 - c3484 > f.c3480Raw;
    return { c3483, c3484, c3480, c3980, inconsistente };
  });

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  async generate(): Promise<void> {
    if (this.declaracionTipo() === 'sustitutiva' && !this.formNumeroSustituye().trim()) {
      this.notifications.error('Para una declaración sustitutiva, debe ingresar el N° de formulario que sustituye.');
      return;
    }

    this.generating.set(true);
    this.generated.set(false);
    this.form103.set(null);
    this.editable3483.set(0);
    this.editable3484.set(0);

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
              // Casilleros existentes (valor retenido)
              c303: 0, c304: 0, c307: 0, c308: 0, c309: 0, c310: 0, c312: 0,
              c314: 0, c319: 0, c322: 0, c323: 0, c344: 0, exterior: 0,
              // Nuevos pares base/retenido (abril 2024)
              c3030: 0, c3530: 0,
              c3121: 0, c3621: 0,
              c3430: 0, c3450: 0,
              c3140: 0, c3640: 0,
              c3230: 0,
              c3481: 0, c3981: 0,
              c3370: 0, c3870: 0,
              // Pronósticos deportivos
              c3483: 0, c3484: 0,
              c3480: 0, c3980: 0, c3480Raw: 0,
              // Total y meta
              total: 0,
              declaracionTipo: this.declaracionTipo(),
              formNumeroSustituye: this.formNumeroSustituye().trim() || undefined,
              mes:  month,
              anio: year,
            };

            for (const r of monthly) {
              for (const tax of r.taxes ?? []) {
                if (tax.taxCode !== '1') continue; // Formulario 103 = solo retenciones IR
                const base   = tax.taxableBase    ?? 0;
                const amount = tax.retainedAmount ?? 0;

                switch (tax.pctCode) {
                  // ── Casilleros existentes (solo valor retenido) ─────────
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

                  // ── Nuevos pares base/retenido (abril 2024) ─────────────
                  case '3030': acc.c3030 += base; acc.c3530 += amount; break;
                  case '3121': acc.c3121 += base; acc.c3621 += amount; break;
                  case '3430': acc.c3430 += base; acc.c3450 += amount; break;
                  case '3140': acc.c3140 += base; acc.c3640 += amount; break;
                  case '3230': acc.c3230 += base; break; // tarifa 0%, sin retención
                  case '3481': acc.c3481 += base; acc.c3981 += amount; break;
                  case '3370': acc.c3370 += base; acc.c3870 += amount; break;

                  // ── Pronósticos deportivos ──────────────────────────────
                  case '3480': acc.c3480Raw += base; acc.c3980 += amount; break;

                  // Código no catalogado → se agrupa como "otras"
                  default: acc.c344 += amount; break;
                }
              }
            }

            // c3480 inicial = c3480Raw (editables 3483/3484 se aplican en computed)
            acc.c3480 = acc.c3480Raw;

            const r2n = (n: number) => Math.round(n * 100) / 100;
            // Redondear todos los acumuladores numéricos
            const numKeys: (keyof Form103Data)[] = [
              'c303','c304','c307','c308','c309','c310','c312','c314','c319','c322','c323','c344','exterior',
              'c3030','c3530','c3121','c3621','c3430','c3450','c3140','c3640','c3230',
              'c3481','c3981','c3370','c3870','c3483','c3484','c3480','c3980','c3480Raw',
            ];
            for (const k of numKeys) {
              (acc as any)[k] = r2n((acc as any)[k] ?? 0);
            }

            acc.total = r2n(
              acc.c303 + acc.c304 + acc.c307 + acc.c308 + acc.c309 + acc.c310 +
              acc.c312 + acc.c314 + acc.c319 + acc.c322 + acc.c323 + acc.c344 +
              acc.exterior +
              acc.c3530 + acc.c3621 + acc.c3450 + acc.c3640 +
              acc.c3981 + acc.c3870 + acc.c3980
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

  // ── Handlers de campos editables ──────────────────────────────────────────
  onEditable3483Change(val: string): void {
    this.editable3483.set(Math.max(0, parseFloat(val) || 0));
  }

  onEditable3484Change(val: string): void {
    this.editable3484.set(Math.max(0, parseFloat(val) || 0));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  printReport(): void { window.print(); }
  fmt(n: number | null | undefined): string { return (n ?? 0).toFixed(2); }
}

function r2(n: number): number { return Math.round(n * 100) / 100; }
