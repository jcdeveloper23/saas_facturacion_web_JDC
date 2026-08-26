import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CardModule,
  GridModule,
  ButtonModule,
  BadgeModule,
  ProgressModule,
  TabsModule,
  NavModule,
  ListGroupModule,
  SpinnerModule,
  AlertModule,
  TableModule,
  FormModule,
  ModalModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';

import { OrganizationsService } from '../../../../core/services/organizations.service';
import { UsersService }         from '../../../../core/services/users.service';
import { NotificationService }  from '../../../../core/services/notification.service';
import {
  Organization,
  OrganizationStats,
  OrganizationLimits,
  OrganizationPlan,
  PLAN_COLORS,
  User
} from '../../../../core/interfaces';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';

@Component({
  selector: 'app-organization-details',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    GridModule,
    ButtonModule,
    BadgeModule,
    ProgressModule,
    TabsModule,
    NavModule,
    ListGroupModule,
    SpinnerModule,
    AlertModule,
    IconModule,
    TableModule,
    FormModule,
    ModalModule,
    ReactiveFormsModule,
    HasPermissionDirective
  ],
  templateUrl: './organization-details.component.html',
  styleUrl: './organization-details.component.scss'
})
export class OrganizationDetailsComponent implements OnInit {
  @Input() organizationId!: number;
  @Output() edit = new EventEmitter<void>();

  private organizationsService = inject(OrganizationsService);
  private usersService         = inject(UsersService);
  private fb                   = inject(FormBuilder);
  private notifications        = inject(NotificationService);

  organization = signal<Organization | null>(null);
  stats = signal<OrganizationStats | null>(null);
  limits = signal<OrganizationLimits | null>(null);
  usersList = signal<User[]>([]);

  isLoading = signal(true);
  isUsersLoading = signal(false);
  error = signal<string | null>(null);
  activeTab = signal('overview');
  showSecret = signal(false);

  // User form
  showUserModal = signal(false);
  isSavingUser = signal(false);
  userForm!: FormGroup;

  ngOnInit(): void {
    this.loadData();
    this.initUserForm();
  }

  initUserForm(): void {
    this.userForm = this.fb.group({
      userFullName: ['', [Validators.required, Validators.minLength(2)]],
      userLastName: ['', [Validators.required, Validators.minLength(2)]],
      userEmail: ['', [Validators.required, Validators.email]],
      userPhone: ['', [Validators.required, Validators.minLength(7)]],
      userPassword: ['Password123!', [Validators.required, Validators.minLength(6)]]
    });
  }

  loadData(): void {
    this.isLoading.set(true);

    // Load organization details
    this.organizationsService.getOrganizationDetails(this.organizationId).subscribe({
      next: (org) => {
        this.organization.set(org);
        this.loadStats();
        this.loadLimits();
      },
      error: (err) => {
        this.error.set('Error al cargar la organización');
        this.isLoading.set(false);
      }
    });
  }

  private loadStats(): void {
    this.organizationsService.getStats(this.organizationId).subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  private loadLimits(): void {
    this.organizationsService.getOrganizationLimits(this.organizationId).subscribe({
      next: (limits) => this.limits.set(limits)
    });
  }

  toggleSecret(): void {
    this.showSecret.update(s => !s);
  }

  setTab(tab: string): void {
    this.activeTab.set(tab);
    if (tab === 'users') {
      this.loadUsers();
    }
  }

  loadUsers(): void {
    this.isUsersLoading.set(true);
    this.usersService.getByOrganization(this.organizationId).subscribe({
      next: (users) => {
        this.usersList.set(users || []);
        this.isUsersLoading.set(false);
      },
      error: () => this.isUsersLoading.set(false)
    });
  }

  openUserModal(): void {
    this.userForm.reset({
      userPassword: 'Password123!'
    });
    this.showUserModal.set(true);
  }

  saveUser(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSavingUser.set(true);
    const userData = {
      ...this.userForm.value,
      organization_id: this.organizationId,
      state: true
    };

    this.usersService.create(userData).subscribe({
      next: () => {
        this.isSavingUser.set(false);
        this.showUserModal.set(false);
        this.loadUsers();
      },
      error: (err) => {
        this.isSavingUser.set(false);
        alert('Error al crear usuario: ' + (err.message || 'Intente de nuevo'));
      }
    });
  }

  onEdit(): void {
    this.edit.emit();
  }

  copyApiKey(): void {
    const org = this.organization();
    if (org?.api_key) {
      navigator.clipboard.writeText(org.api_key);
    }
  }

  async rotateApiKey(): Promise<void> {
    const ok = await this.notifications.confirm({
      title: '¿Regenerar la API Key?',
      text: 'La key anterior dejará de funcionar.',
      confirmText: 'Sí, regenerar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    this.organizationsService.rotateApiKey(this.organizationId).subscribe({
      next: (org) => {
        this.organization.set(org);
      },
      error: (err) => {
        this.error.set('Error al regenerar API Key');
      }
    });
  }

  // Helpers
  getPlanBadgeColor(plan: OrganizationPlan): string {
    return PLAN_COLORS[plan] || 'secondary';
  }

  getPlanLabel(plan: OrganizationPlan): string {
    const labels: Record<OrganizationPlan, string> = {
      free: 'Gratuito',
      starter: 'Starter',
      business: 'Business',
      enterprise: 'Enterprise'
    };
    return labels[plan] || plan;
  }

  getUsageColor(percent: number): string {
    if (percent >= 90) return 'danger';
    if (percent >= 70) return 'warning';
    return 'success';
  }

  formatDate(date: string | undefined): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  maskApiKey(key: string | undefined): string {
    if (!key) return '-';
    return key.substring(0, 12) + '...' + key.substring(key.length - 4);
  }
}
