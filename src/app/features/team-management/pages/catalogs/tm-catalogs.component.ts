import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { CatalogsService }     from '../../services/catalogs.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { TmSpecialty, TmPosition } from '../../models/catalog.interface';

@Component({
  selector: 'app-tm-catalogs',
  standalone: true,
  templateUrl: './tm-catalogs.component.html',
  imports: [
    CommonModule, FormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, FormModule,
    IconModule,
  ],
})
export class TmCatalogsComponent implements OnInit, OnDestroy {
  private svc           = inject(CatalogsService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── State ────────────────────────────────────────────────────────────────────
  loading = signal(true);

  specialties = signal<TmSpecialty[]>([]);
  positions   = signal<TmPosition[]>([]);

  // ── Specialty form ───────────────────────────────────────────────────────────
  newSpecName      = signal('');
  savingSpec       = signal(false);
  editingSpecId    = signal<string | null>(null);
  editingSpecName  = signal('');

  // ── Position form ────────────────────────────────────────────────────────────
  newPosName       = signal('');
  newPosDept       = signal('');
  savingPos        = signal(false);
  editingPosId     = signal<string | null>(null);
  editingPosName   = signal('');
  editingPosDept   = signal('');

  // ── Computed ─────────────────────────────────────────────────────────────────
  positionsByDept = computed(() => {
    const groups = new Map<string, TmPosition[]>();
    for (const p of this.positions()) {
      const dept = p.department?.trim() || 'Sin departamento';
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept)!.push(p);
    }
    return groups;
  });

  deptKeys = computed(() => Array.from(this.positionsByDept().keys()).sort());

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    let done = 0;
    const check = () => { done++; if (done >= 2) this.loading.set(false); };

    this.svc.getSpecialties()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => { this.specialties.set(list); check(); }, error: () => check() });

    this.svc.getPositions()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => { this.positions.set(list); check(); }, error: () => check() });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Specialties ───────────────────────────────────────────────────────────────
  async addSpecialty(): Promise<void> {
    const name = this.newSpecName().trim();
    if (!name) return;
    if (this.specialties().some(s => s.name.toLowerCase() === name.toLowerCase())) {
      this.notifications.error('Ya existe una especialidad con ese nombre');
      return;
    }
    this.savingSpec.set(true);
    try {
      await this.svc.addSpecialty(name);
      this.newSpecName.set('');
    } catch {
      this.notifications.error('Error al agregar la especialidad');
    } finally {
      this.savingSpec.set(false);
    }
  }

  startEditSpec(s: TmSpecialty): void {
    this.editingSpecId.set(s.id);
    this.editingSpecName.set(s.name);
  }

  cancelEditSpec(): void {
    this.editingSpecId.set(null);
    this.editingSpecName.set('');
  }

  async saveEditSpec(id: string): Promise<void> {
    const name = this.editingSpecName().trim();
    if (!name) return;
    try {
      await this.svc.updateSpecialty(id, name);
      this.cancelEditSpec();
    } catch {
      this.notifications.error('Error al actualizar la especialidad');
    }
  }

  async deleteSpecialty(id: string): Promise<void> {
    try {
      await this.svc.deleteSpecialty(id);
    } catch {
      this.notifications.error('Error al eliminar la especialidad');
    }
  }

  onSpecKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') { event.preventDefault(); this.addSpecialty(); }
  }

  onEditSpecKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter') { event.preventDefault(); this.saveEditSpec(id); }
    if (event.key === 'Escape') { this.cancelEditSpec(); }
  }

  // ── Positions ─────────────────────────────────────────────────────────────────
  async addPosition(): Promise<void> {
    const name = this.newPosName().trim();
    const dept = this.newPosDept().trim();
    if (!name) return;
    if (this.positions().some(p => p.name.toLowerCase() === name.toLowerCase())) {
      this.notifications.error('Ya existe un cargo con ese nombre');
      return;
    }
    this.savingPos.set(true);
    try {
      await this.svc.addPosition(name, dept || undefined);
      this.newPosName.set('');
      this.newPosDept.set('');
    } catch {
      this.notifications.error('Error al agregar el cargo');
    } finally {
      this.savingPos.set(false);
    }
  }

  startEditPos(p: TmPosition): void {
    this.editingPosId.set(p.id);
    this.editingPosName.set(p.name);
    this.editingPosDept.set(p.department ?? '');
  }

  cancelEditPos(): void {
    this.editingPosId.set(null);
    this.editingPosName.set('');
    this.editingPosDept.set('');
  }

  async saveEditPos(id: string): Promise<void> {
    const name = this.editingPosName().trim();
    if (!name) return;
    try {
      await this.svc.updatePosition(id, name, this.editingPosDept());
      this.cancelEditPos();
    } catch {
      this.notifications.error('Error al actualizar el cargo');
    }
  }

  async deletePosition(id: string): Promise<void> {
    try {
      await this.svc.deletePosition(id);
    } catch {
      this.notifications.error('Error al eliminar el cargo');
    }
  }

  onPosKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') { event.preventDefault(); this.addPosition(); }
  }

  onEditPosKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter') { event.preventDefault(); this.saveEditPos(id); }
    if (event.key === 'Escape') { this.cancelEditPos(); }
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
  trackByKey(_: number, key: string): string { return key; }
}
