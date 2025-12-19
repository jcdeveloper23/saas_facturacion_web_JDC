import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { Users, CommissionHistory } from 'app/interfaces/users';
import Swal from 'sweetalert2';

/**
 * Reusable commission editor component
 * Allows viewing and editing driver commission rates with history tracking
 */
@Component({
  selector: 'app-commission-editor',
  templateUrl: './commission-editor.component.html',
  styleUrls: ['./commission-editor.component.css']
})
export class CommissionEditorComponent implements OnInit {

  // Inputs
  @Input() user: Users;
  @Input() adminEmail: string = 'Admin'; // Email del admin que hace el cambio

  // Outputs
  @Output() onSave = new EventEmitter<{ user: Users, rate: number, reason: string }>();
  @Output() onCancel = new EventEmitter<void>();

  // State
  public isEditingCommission: boolean = false;
  public newCommissionRate: number = 20;
  public commissionChangeReason: string = '';
  public readonly DEFAULT_COMMISSION_RATE = 20;

  constructor() { }

  ngOnInit(): void {
    if (this.user) {
      this.newCommissionRate = this.getUserCommissionRate(this.user);
    }
  }

  /**
   * Get user commission rate
   */
  public getUserCommissionRate(user: Users): number {
    if (!user) return this.DEFAULT_COMMISSION_RATE;

    if (user.userCommissionCustomEnabled && user.userCommissionRate !== undefined) {
      return user.userCommissionRate;
    }

    if (user.userCommissionRate !== undefined) {
      return user.userCommissionRate;
    }

    return this.DEFAULT_COMMISSION_RATE;
  }

  /**
   * Start editing commission
   */
  public startEditingCommission(): void {
    this.isEditingCommission = true;
    this.newCommissionRate = this.getUserCommissionRate(this.user);
    this.commissionChangeReason = '';
  }

  /**
   * Cancel editing commission
   */
  public cancelEditingCommission(): void {
    this.isEditingCommission = false;
    this.newCommissionRate = this.getUserCommissionRate(this.user);
    this.commissionChangeReason = '';
    this.onCancel.emit();
  }

  /**
   * Validate commission input
   */
  public isCommissionValid(): boolean {
    if (this.newCommissionRate === null || this.newCommissionRate === undefined) {
      return false;
    }

    if (this.newCommissionRate < 0 || this.newCommissionRate > 100) {
      return false;
    }

    if (this.newCommissionRate === this.getUserCommissionRate(this.user)) {
      return false;
    }

    return true;
  }

  /**
   * Save commission change
   */
  public async saveCommissionChange(): Promise<void> {
    if (!this.isCommissionValid()) {
      return;
    }

    const result = await Swal.fire({
      title: 'Cambiar comisión',
      html: `
        <p>¿Estás seguro de cambiar la comisión del conductor?</p>
        <div style="background: rgba(72, 128, 255, 0.1); padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="margin: 5px 0;"><strong>Comisión actual:</strong> ${this.getUserCommissionRate(this.user)}%</p>
          <p style="margin: 5px 0;"><strong>Nueva comisión:</strong> ${this.newCommissionRate}%</p>
          ${this.commissionChangeReason ? `<p style="margin: 5px 0;"><strong>Motivo:</strong> ${this.commissionChangeReason}</p>` : ''}
        </div>
        <p style="font-size: 13px; color: #9A9A9A;">El cambio se aplicará a partir del próximo viaje</p>
      `,
      icon: 'question',
      showCancelButton: true,
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, cambiar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) {
      return;
    }

    // Emit save event with updated data
    this.onSave.emit({
      user: this.user,
      rate: this.newCommissionRate,
      reason: this.commissionChangeReason || 'Sin motivo especificado'
    });

    // Close edit mode
    this.isEditingCommission = false;
    this.commissionChangeReason = '';
  }
}
