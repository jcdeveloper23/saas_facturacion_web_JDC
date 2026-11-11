import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, CardModule, FormModule, SpinnerModule } from '@coreui/angular';

import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { money } from '../../models/payroll.models';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';

type Unit = 'money' | 'pct' | 'number';

/** Las filas en el orden del plan (§4.3). Un null es un valor que falta: con él no se aprueba. */
const ROWS: [string, string, Unit][] = [
  ['sbu', 'Salario básico unificado', 'money'],
  ['iess.personalPct', 'Aporte personal IESS', 'pct'],
  ['iess.employerPct', 'Aporte patronal IESS', 'pct'],
  ['iess.iecePct', 'IECE', 'pct'],
  ['iess.secapPct', 'SECAP', 'pct'],
  ['reserveFund.pct', 'Fondos de reserva', 'pct'],
  ['thirteenth.divisor', 'Divisor del 13.º', 'number'],
  ['fourteenth.divisor', 'Divisor del 14.º', 'number'],
  ['overtime.hoursDivisor', 'Divisor de la hora', 'number'],
  ['overtime.supplementaryPct', 'Recargo horas suplementarias', 'pct'],
  ['overtime.nightSupplementaryPct', 'Recargo horas de 24h00 a 06h00', 'pct'],
  ['overtime.weekendPct', 'Recargo sábado y domingo', 'pct'],
  ['overtime.nightShiftPct', 'Recargo jornada nocturna', 'pct'],
  ['overtime.maxPerDay', 'Tope de horas suplementarias al día', 'number'],
  ['overtime.maxPerWeek', 'Tope de horas suplementarias a la semana', 'number'],
  ['vacation.baseDays', 'Días de vacaciones', 'number'],
  ['vacation.divisor', 'Divisor de la provisión de vacaciones', 'number'],
  ['advanceCapPct', 'Tope de anticipos', 'pct'],
];

const at = (o: any, path: string) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);

/** Nómina › Parámetros (§7.2): solo lectura, con la fuente de cada valor. Los publica un script de plataforma. */
@Component({
  selector: 'app-payroll-parameters-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertModule, BadgeModule, CardModule, FormModule, SpinnerModule, PayrollTabsComponent],
  template: `
<div class="mb-3">
  <h4 class="mb-0">Parámetros de nómina</h4>
  <small class="text-secondary">Valores legales con los que se calcula cada mes</small>
</div>
<app-payroll-tabs />
@if (loading()) {
  <div class="text-center py-5"><c-spinner color="primary"></c-spinner></div>
} @else if (error()) {
  <c-alert color="warning">{{ error() }}</c-alert>
} @else if (!current()) {
  <c-alert color="info">Todavía no hay parámetros cargados.</c-alert>
} @else {
  @let p = current()!;
  <div class="d-flex align-items-center gap-2 mb-3">
    @if (all().length > 1) {
      <select cSelect style="max-width: 260px" [ngModel]="p.id" (ngModelChange)="selected.set($event)">
        @for (x of all(); track x.id) { <option [value]="x.id">Año {{ x.data['year'] }} · versión {{ x.data['version'] }}</option> }
      </select>
    } @else {
      <strong>Año {{ p.data['year'] }} · versión {{ p.data['version'] }}</strong>
    }
    <c-badge [color]="p.data['status'] === 'published' ? 'success' : 'warning'">
      {{ p.data['status'] === 'published' ? 'Publicado' : 'Borrador' }}
    </c-badge>
  </div>
  @if (missing().length) {
    <c-alert color="warning" class="py-2 small">Faltan {{ missing().length }} valor(es): {{ missing().join(', ') }}. Con un valor faltante la nómina no se puede aprobar.</c-alert>
  }
  <c-card>
    <div class="table-responsive">
      <table class="table mb-0 align-middle small">
        <thead><tr><th>Parámetro</th><th class="text-end">Valor</th><th>Fuente</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.key) {
            <tr>
              <td>{{ r.label }}</td>
              <td class="text-end font-monospace" [class.text-danger]="r.value == null">{{ r.display }}</td>
              <td class="text-secondary">{{ r.source || '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </c-card>
  <c-alert color="info" class="mt-3 small">
    Vigente del {{ p.data['validFrom'] }} al {{ p.data['validTo'] }}. Cada nómina aprobada guarda una copia de los
    parámetros con que se calculó: si cambian, las nóminas anteriores no se tocan.
  </c-alert>
}`,
})
export class ParametersPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollService);
  private sub: Subscription | null = null;

  readonly all = signal<{ id: string; data: Record<string, any> }[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly selected = signal('');

  readonly current = computed(() => this.all().find((x) => x.id === this.selected()) ?? this.all()[0] ?? null);
  readonly rows = computed(() => {
    const p = this.current();
    if (!p) return [];
    const sources = new Map<string, string>(((p.data['sources'] ?? []) as any[]).map((s) => [String(s?.param), String(s?.reference ?? '')]));
    return ROWS.map(([key, label, unit]) => {
      const v = at(p.data, key);
      const value = typeof v === 'number' ? v : null;
      const display = value == null ? 'Falta'
        : unit === 'money' ? money(Math.round(value * 100))
        : `${String(value).replace('.', ',')}${unit === 'pct' ? ' %' : ''}`;
      return { key, label, value, display, source: sources.get(key) ?? '' };
    });
  });
  readonly missing = computed(() => this.rows().filter((r) => r.value == null).map((r) => r.label));

  ngOnInit(): void {
    this.sub = this.svc.parameters().subscribe({
      next: (list) => {
        this.all.set([...list].sort((a, b) =>
          Number(b.data['year']) - Number(a.data['year']) || Number(b.data['version']) - Number(a.data['version'])));
        this.loading.set(false);
      },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
