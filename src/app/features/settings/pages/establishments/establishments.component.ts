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
    this.svc.getEstablishments(this.companyId).subscribe({
      next: list => { this.establishments.set(list); this.loading.set(false); },
      error: err => {
        console.error('Error al cargar establecimientos:', err);
        this.notifications.error('Error al cargar establecimientos');
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
