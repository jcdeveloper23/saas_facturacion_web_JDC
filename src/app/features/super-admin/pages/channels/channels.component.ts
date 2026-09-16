import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AlertComponent, BadgeComponent, ButtonCloseDirective, ButtonDirective, CardBodyComponent,
  CardComponent, ColComponent, FormControlDirective, FormLabelDirective, FormTextDirective,
  ModalBodyComponent, ModalComponent, ModalFooterComponent, ModalHeaderComponent,
  ModalTitleDirective, RowComponent, SpinnerComponent, TableDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { NotificationService } from '../../../../core/services/notification.service';
import { CHANNEL_ID_PATTERN, ChannelsService } from '../../services/channels.service';
import { Channel } from '../../models/channel.interface';

interface AdminRow { uid: string; email: string; }

/**
 * Canales — solo super admin de plataforma.
 *
 * Un canal es un producto que vende FacturaEc bajo su marca (Conectate, Mi
 * Buseta). Desde acá se crea, se suspende y se le nombra administrador. Ese
 * administrador entra a /super-admin y ve solo las empresas y planes de su canal.
 * Ver docs/PLAN_CANALES_MULTIMARCA.md.
 */
@Component({
  selector: 'app-channels',
  templateUrl: './channels.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, FormTextDirective, AlertComponent, IconDirective
  ]
})
export class ChannelsComponent implements OnInit, OnDestroy {
  private svc = inject(ChannelsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private subs = new Subscription();

  channels = signal<Channel[]>([]);
  companyCounts = signal<Record<string, number | null>>({});
  loading = signal(true);
  /** Mensaje de por qué no se pudo leer la lista; vacío si cargó bien. */
  loadError = signal('');

  // Modal de alta / edición
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  // Modal de administradores
  adminsChannelId = signal<string | null>(null);
  adminBusy = signal(false);
  adminError = signal('');
  adminsChannel = computed(() => this.channels().find(c => c.id === this.adminsChannelId()) ?? null);

  form = this.fb.group({
    id:           ['', [Validators.required, Validators.pattern(CHANNEL_ID_PATTERN)]],
    name:         ['', [Validators.required, Validators.maxLength(80)]],
    contactEmail: ['', Validators.email],
  });

  adminForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit(): void {
    this.subs.add(this.svc.getChannels().subscribe({
      next: list => {
        this.channels.set([...list].sort((a, b) => a.name.localeCompare(b.name)));
        this.loadError.set('');
        this.loading.set(false);
        this.loadCounts(list);
      },
      error: err => {
        console.error('Error al cargar canales:', err);
        // permission-denied casi siempre significa que las reglas con el bloque
        // `channels` no están desplegadas, o que la sesión no es de super admin.
        this.loadError.set(err?.code === 'permission-denied'
          ? 'Sin permiso para leer canales. Verifica que las reglas de Firestore con el modelo de canales estén desplegadas y que tu usuario sea super admin (cierra sesión y vuelve a entrar si te lo asignaron hace poco).'
          : `No se pudieron cargar los canales: ${err?.message ?? err}`);
        this.notifications.error('Error al cargar canales');
        this.loading.set(false);
      }
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  /** El conteo es informativo: si falla, se muestra un guion y la pantalla sigue. */
  private loadCounts(list: Channel[]): void {
    for (const c of list) {
      if (c.id in this.companyCounts()) continue;
      this.svc.countCompanies(c.id)
        .then(n => this.companyCounts.update(m => ({ ...m, [c.id]: n })))
        .catch(() => this.companyCounts.update(m => ({ ...m, [c.id]: null })));
    }
  }

  admins(c: Channel | null): AdminRow[] {
    if (!c?.admins) return [];
    return Object.entries(c.admins)
      .map(([uid, a]) => ({ uid, email: a.email }))
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  // ─── Alta / edición ────────────────────────────────────────────────────────

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ id: '', name: '', contactEmail: '' });
    this.form.get('id')?.enable();
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(c: Channel): void {
    this.editingId.set(c.id);
    this.form.reset({ id: c.id, name: c.name, contactEmail: c.contactEmail ?? '' });
    this.form.get('id')?.disable(); // el id viaja en claims y empresas: no se cambia
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const v = this.form.getRawValue();
      const data = { name: v.name!.trim(), contactEmail: (v.contactEmail ?? '').trim() };
      const id = this.editingId();
      if (id) {
        await this.svc.updateChannel(id, data);
        this.notifications.success('Canal actualizado');
      } else {
        await this.svc.createChannel(v.id!.trim(), data);
        this.notifications.success('Canal creado');
      }
      this.showModal.set(false);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleStatus(c: Channel): Promise<void> {
    const suspending = c.status === 'active';
    if (suspending) {
      const ok = await this.notifications.confirm({
        title: `¿Suspender el canal "${c.name}"?`,
        text: 'Sus administradores dejan de poder operar de inmediato. Las empresas del canal no se tocan.',
        confirmText: 'Sí, suspender',
        cancelText: 'Cancelar',
        icon: 'warning',
        danger: true
      });
      if (!ok) return;
    }
    try {
      await this.svc.setStatus(c.id, suspending ? 'suspended' : 'active');
      this.notifications.success(suspending ? 'Canal suspendido' : 'Canal reactivado');
    } catch {
      this.notifications.error('Error al cambiar el estado');
    }
  }

  // ─── Administradores ───────────────────────────────────────────────────────

  openAdmins(c: Channel): void {
    this.adminsChannelId.set(c.id);
    this.adminForm.reset({ email: '' });
    this.adminError.set('');
  }

  closeAdmins(): void { this.adminsChannelId.set(null); }

  async grant(): Promise<void> {
    const channelId = this.adminsChannelId();
    if (!channelId) return;
    if (this.adminForm.invalid) { this.adminForm.markAllAsTouched(); return; }
    this.adminBusy.set(true);
    this.adminError.set('');
    try {
      const email = this.adminForm.getRawValue().email!.trim();
      const { created, resetEmailSent } = await this.svc.grantAdmin(channelId, email);
      if (!created) {
        this.notifications.success(`${email} ahora administra el canal. Debe cerrar sesión y volver a entrar.`);
      } else if (resetEmailSent) {
        this.notifications.success(`Usuario creado. Enviamos a ${email} un correo para que defina su contraseña.`);
      } else {
        // El usuario y el rol quedaron; solo falló el correo.
        this.adminError.set(`Usuario creado, pero no se pudo enviar el correo a ${email}. Usa el botón de sobre para reenviarlo.`);
      }
      this.adminForm.reset({ email: '' });
    } catch (err: any) {
      this.adminError.set(err?.message || 'No se pudo asignar el administrador');
    } finally {
      this.adminBusy.set(false);
    }
  }

  async resendSetupEmail(row: AdminRow): Promise<void> {
    this.adminBusy.set(true);
    this.adminError.set('');
    try {
      await this.svc.sendPasswordSetupEmail(row.email);
      this.notifications.success(`Enviamos a ${row.email} el correo para definir su contraseña`);
    } catch (err: any) {
      this.adminError.set(err?.message || 'No se pudo enviar el correo');
    } finally {
      this.adminBusy.set(false);
    }
  }

  async revoke(row: AdminRow): Promise<void> {
    const channelId = this.adminsChannelId();
    if (!channelId) return;
    const ok = await this.notifications.confirm({
      title: `¿Retirar a ${row.email} como administrador?`,
      confirmText: 'Sí, retirar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    this.adminBusy.set(true);
    this.adminError.set('');
    try {
      await this.svc.revokeAdmin(channelId, row.email);
      this.notifications.success(`${row.email} ya no administra el canal`);
    } catch (err: any) {
      this.adminError.set(err?.message || 'No se pudo retirar el administrador');
    } finally {
      this.adminBusy.set(false);
    }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }
}
