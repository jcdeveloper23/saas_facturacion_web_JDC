import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent,
  ButtonDirective,
  SpinnerComponent,
  AlertComponent,
  BadgeComponent,
  FormLabelDirective,
  FormControlDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';

import { ProfitConfigService } from '../services/profit-config.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ProfitConfig, ProfitPartner } from '../models/benefit.interface';

@Component({
  selector: 'app-benefits-config',
  templateUrl: './benefits-config.component.html',
  styleUrl: './benefits-config.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardComponent,
    CardBodyComponent,
    CardHeaderComponent,
    RowComponent,
    ColComponent,
    ButtonDirective,
    SpinnerComponent,
    AlertComponent,
    BadgeComponent,
    FormLabelDirective,
    FormControlDirective,
    IconDirective
  ]
})
export class BenefitsConfigComponent implements OnInit, OnDestroy {
  private configService = inject(ProfitConfigService);
  private notifications = inject(NotificationService);

  private subs = new Subscription();

  // ─── Signals ───────────────────────────────────────────────────────────────

  loading   = signal(true);
  saving    = signal(false);
  config    = signal<ProfitConfig | null>(null);
  partners  = signal<ProfitPartner[]>([]);
  configName = signal('Configuracion de socios');

  // ─── Computed ──────────────────────────────────────────────────────────────

  readonly totalPct = computed(() =>
    Math.round(this.partners().reduce((s, p) => s + (p.percentage ?? 0), 0) * 100) / 100
  );

  readonly isValid = computed(() =>
    this.totalPct() === 100 &&
    this.partners().length > 0 &&
    this.partners().every(p => p.name.trim().length > 0 && p.percentage > 0)
  );

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.subs.add(
      this.configService.getActiveConfig().subscribe({
        next: cfg => {
          this.loading.set(false);
          this.config.set(cfg);
          if (cfg) {
            this.configName.set(cfg.name);
            this.partners.set(cfg.partners.map(p => ({ ...p })));
          }
        },
        error: err => {
          this.loading.set(false);
          console.error('[BenefitsConfig] error:', err);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  // ─── Partner management ────────────────────────────────────────────────────

  addPartner(): void {
    const newPartner: ProfitPartner = {
      id:         crypto.randomUUID(),
      name:       '',
      taxId:      '',
      email:      '',
      percentage: 0
    };
    this.partners.update(list => [...list, newPartner]);
  }

  removePartner(id: string): void {
    this.partners.update(list => list.filter(p => p.id !== id));
  }

  updatePartner(id: string, field: keyof ProfitPartner, value: string | number): void {
    this.partners.update(list =>
      list.map(p => p.id === id ? { ...p, [field]: value } : p)
    );
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    if (!this.isValid()) {
      this.notifications.warning('Los porcentajes deben sumar exactamente 100%');
      return;
    }

    this.saving.set(true);
    try {
      const cfg = this.config();
      const payload: Partial<ProfitConfig> = {
        ...(cfg?.id ? { id: cfg.id } : {}),
        name:            this.configName(),
        isActive:        true,
        partners:        this.partners(),
        totalPercentage: 100
      };
      await this.configService.saveConfig(payload);
      this.notifications.success('Configuracion guardada correctamente');
    } catch (err: any) {
      this.notifications.error(err?.message ?? 'Error al guardar configuracion');
    } finally {
      this.saving.set(false);
    }
  }

  trackById(_: number, p: ProfitPartner): string { return p.id; }
}
