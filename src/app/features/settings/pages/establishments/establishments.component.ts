import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule,
  ValidationErrors, Validators,
} from '@angular/forms';
import {
  CardComponent, CardBodyComponent,
  TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, FormCheckComponent,
  FormCheckInputDirective, FormCheckLabelDirective,
  AlertComponent, CalloutComponent,
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../../../icons/icon-subset';
import { SettingsService } from '../../services/settings.service';
import { CompanyUsersService } from '../../../../core/services/company-users.service';
import { CompanyUser } from '../../../../core/interfaces/company-user.interface';
import { EmissionPoint, Establishment, EstablishmentFormData } from '../../models/settings.interfaces';
import { NotificationService } from '../../../../core/services/notification.service';

/** Código SRI: 3 dígitos, del 001 al 999. */
const SRI_CODE = /^(?!000)\d{3}$/;

/** Los puntos de emisión de un establecimiento no repiten código. */
function uniquePointCodes(arr: AbstractControl): ValidationErrors | null {
  const codes = (arr as FormArray).controls.map(c => c.get('code')?.value);
  return new Set(codes).size === codes.length ? null : { duplicated: true };
}

/**
 * Establecimientos de la empresa ante el SRI: la matriz y sus sucursales, cada
 * una con sus puntos de emisión.
 *
 * Importa porque cada comprobante sale con el establecimiento de su serie, y la
 * dirección que va en `<dirEstablecimiento>` es la de este registro. El código
 * es el id del documento: no se cambia después de crearlo. Tampoco se borran —
 * hay comprobantes emitidos con ese código—, se desactivan.
 */
@Component({
  selector: 'app-establishments',
  templateUrl: './establishments.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    CardComponent, CardBodyComponent,
    TableDirective, BadgeComponent, ButtonDirective, SpinnerComponent,
    RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
    AlertComponent, IconDirective, CalloutComponent,
  ],
})
export class EstablishmentsComponent implements OnInit {
  private svc = inject(SettingsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);
  private route = inject(ActivatedRoute);
  private companyUsersSvc = inject(CompanyUsersService);

  /**
   * Empresa sobre la que se trabaja. Sin :id en la ruta es la del usuario; con
   * él (/super-admin/companies/:id/establishments), una empresa cualquiera.
   */
  readonly companyId = this.route.snapshot.paramMap.get('id') ?? undefined;

  establishments = signal<Establishment[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingCode = signal<string | null>(null);
  errorMessage = signal('');

  // ── Usuarios de cada punto de emisión ───────────────────────────────────
  // La relación es de muchos a muchos: un punto lo usan varios cajeros y un
  // cajero puede tener varios puntos. Se guarda del lado del usuario
  // (company-users/{uid}.emissionPoints); aquí se edita desde el punto.
  users          = signal<CompanyUser[]>([]);
  showUsersModal = signal(false);
  savingUsers    = signal(false);
  editingPoint   = signal<{ key: string; label: string } | null>(null);
  /** uid → asignado, mientras el modal está abierto. */
  userSelection  = signal<Record<string, boolean>>({});

  /** Solo en la propia empresa: las reglas no dejan al super admin escribir sus usuarios. */
  readonly canAssignUsers = !this.route.snapshot.paramMap.get('id');

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  form = this.fb.group({
    code:    ['', [Validators.required, Validators.pattern(SRI_CODE)]],
    name:    ['', Validators.required],
    address: ['', Validators.required],
    city:    [''],
    phone:   [''],
    isMain:  [false],
    isActive: [true],
    emissionPoints: this.fb.array<FormGroup>([], [Validators.minLength(1), uniquePointCodes]),
  });

  get points(): FormArray<FormGroup> {
    return this.form.get('emissionPoints') as FormArray<FormGroup>;
  }

  ngOnInit(): void {
    if (this.canAssignUsers) {
      this.companyUsersSvc.getCompanyUsers().subscribe({
        next: list => this.users.set(list),
        error: err => console.error('Error al cargar usuarios:', err),
      });
    }
    this.svc.getEstablishments(this.companyId).subscribe({
      next: list => { this.establishments.set(list); this.loading.set(false); },
      error: err => {
        // Con el código a la vista: 'permission-denied' es de reglas (o de una
        // página abierta antes de desplegarlas: la escucha en vivo se corta al
        // primer error y no se recupera sola; hay que recargar).
        console.error('Error al cargar establecimientos:', err);
        const code = (err as { code?: string })?.code;
        this.notifications.error(
          code === 'permission-denied'
            ? 'Sin permiso para ver los establecimientos de esta empresa. Si acabas de desplegar las reglas, recarga la página.'
            : `Error al cargar establecimientos${code ? ` (${code})` : ''}`
        );
        this.loading.set(false);
      },
    });
  }

  private pointGroup(p?: Partial<EmissionPoint>): FormGroup {
    return this.fb.group({
      code:     [p?.code ?? '', [Validators.required, Validators.pattern(SRI_CODE)]],
      name:     [p?.name ?? '', Validators.required],
      isActive: [p?.isActive ?? true],
    });
  }

  /** El siguiente código libre: 002 si ya existe la 001. */
  private nextCode(codes: string[]): string {
    for (let n = 1; n <= 999; n++) {
      const c = String(n).padStart(3, '0');
      if (!codes.includes(c)) return c;
    }
    return '';
  }

  openNew(): void {
    this.editingCode.set(null);
    this.points.clear();
    this.points.push(this.pointGroup({ code: '001', name: 'Principal' }));
    this.form.reset({
      code: this.nextCode(this.establishments().map(e => e.code)),
      isMain: this.establishments().length === 0,
      isActive: true,
    });
    this.form.get('code')?.enable();
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(e: Establishment): void {
    this.editingCode.set(e.code);
    this.points.clear();
    for (const p of e.emissionPoints ?? []) this.points.push(this.pointGroup(p));
    if (this.points.length === 0) this.points.push(this.pointGroup({ code: '001', name: 'Principal' }));
    this.form.patchValue({
      code: e.code, name: e.name, address: e.address ?? '', city: e.city ?? '',
      phone: e.phone ?? '', isMain: e.isMain, isActive: e.isActive,
    });
    // El código es el id del documento: no se cambia.
    this.form.get('code')?.disable();
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  addPoint(): void {
    this.points.push(this.pointGroup({
      code: this.nextCode(this.points.controls.map(c => c.get('code')?.value)),
      name: '',
    }));
  }

  removePoint(i: number): void {
    if (this.points.length > 1) this.points.removeAt(i);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const data = this.form.getRawValue() as EstablishmentFormData;
      const code = this.editingCode();
      if (code) {
        await this.svc.updateEstablishment(code, data, this.companyId);
        this.notifications.success('Establecimiento actualizado');
      } else {
        await this.svc.createEstablishment(data, this.companyId);
        this.notifications.success('Establecimiento creado');
      }
      this.showModal.set(false);
    } catch (err: unknown) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(e: Establishment): Promise<void> {
    if (e.isMain && e.isActive) {
      this.notifications.warning('La matriz no se puede desactivar');
      return;
    }
    try {
      await this.svc.updateEstablishment(e.code, { isActive: !e.isActive }, this.companyId);
      this.notifications.success('Estado actualizado');
    } catch {
      this.notifications.error('Error al actualizar el estado');
    }
  }

  // ── Usuarios de un punto ─────────────────────────────────────────────────

  /** A quién se le pueden asignar puntos: el admin emite desde todos. */
  assignableUsers(): CompanyUser[] {
    return this.users().filter(u => u.platformRole !== 'admin' && u.isActive !== false);
  }

  usersForPoint(establishmentCode: string, pointCode: string): CompanyUser[] {
    const key = `${establishmentCode}-${pointCode}`;
    return this.assignableUsers().filter(u => (u.emissionPoints ?? []).includes(key));
  }

  openUsers(e: Establishment, p: EmissionPoint): void {
    const key = `${e.code}-${p.code}`;
    this.editingPoint.set({ key, label: `${key} · ${p.name} — ${e.name}` });
    this.userSelection.set(Object.fromEntries(
      this.assignableUsers().map(u => [u.uid, (u.emissionPoints ?? []).includes(key)])));
    this.showUsersModal.set(true);
  }

  isUserSelected(uid: string): boolean {
    return !!this.userSelection()[uid];
  }

  toggleUser(uid: string): void {
    this.userSelection.set({ ...this.userSelection(), [uid]: !this.userSelection()[uid] });
  }

  async saveUsers(): Promise<void> {
    const point = this.editingPoint();
    if (!point) return;
    this.savingUsers.set(true);
    try {
      for (const user of this.assignableUsers()) {
        const had = (user.emissionPoints ?? []).includes(point.key);
        const has = this.isUserSelected(user.uid);
        if (had === has) continue;
        const next = has
          ? [...(user.emissionPoints ?? []), point.key].sort()
          : (user.emissionPoints ?? []).filter(k => k !== point.key);
        // El punto por defecto tiene que seguir entre los asignados.
        const current = user.defaultEmissionPoint ?? '';
        const nextDefault = next.length === 0 ? '' : (next.includes(current) ? current : next[0]);
        await this.companyUsersSvc.upsertCompanyUser(user.uid, {
          emissionPoints: next,
          defaultEmissionPoint: nextDefault,
        });
      }
      this.notifications.success('Usuarios del punto de emisión actualizados');
      this.showUsersModal.set(false);
    } catch (err: unknown) {
      this.notifications.error(err instanceof Error ? err.message : 'Error al guardar los usuarios');
    } finally {
      this.savingUsers.set(false);
    }
  }

  activePoints(e: Establishment): string {
    return (e.emissionPoints ?? []).filter(p => p.isActive !== false).map(p => p.code).join(', ') || '—';
  }

  hasError(f: string): boolean {
    const c = this.form.get(f);
    return !!(c?.invalid && c?.touched);
  }

  pointHasError(i: number, f: string): boolean {
    const c = this.points.at(i).get(f);
    return !!(c?.invalid && c?.touched);
  }

  trackByCode(_: number, item: Establishment): string { return item.code; }
}
