import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, TableModule, FormModule,
  AlertModule, ModalModule, SpinnerModule
} from '@coreui/angular';

import { SchoolWalletService } from '../services/school-wallet.service';
import { SchoolStudentService } from '../services/school-student.service';
import {
  SchoolRecharge, SchoolTransaction, SchoolStudent,
  RECHARGE_QUICK_AMOUNTS
} from '../models';

@Component({
  selector: 'app-school-wallet-history',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, TableModule, FormModule,
    AlertModule, ModalModule, SpinnerModule
  ],
  templateUrl: './school-wallet-history.component.html'
})
export class SchoolWalletHistoryComponent implements OnInit {
  private walletService  = inject(SchoolWalletService);
  private studentService = inject(SchoolStudentService);
  private fb             = inject(FormBuilder);

  students         = signal<SchoolStudent[]>([]);
  pendingRecharges = signal<SchoolRecharge[]>([]);
  transactions     = signal<SchoolTransaction[]>([]);
  selectedStudent  = signal<SchoolStudent | null>(null);
  showModal        = signal(false);
  saving           = signal(false);
  errorMsg         = signal<string | null>(null);

  readonly quickAmounts = RECHARGE_QUICK_AMOUNTS;

  rechargeForm = this.fb.group({
    amount:     [5, [Validators.required, Validators.min(0.50)]],
    method:     ['transfer', Validators.required],
    paymentRef: [''],
    note:       ['']
  });

  ngOnInit(): void {
    this.walletService.getPendingRecharges().subscribe(r => this.pendingRecharges.set(r));
    this.studentService.getStudents().subscribe(s => this.students.set(s));
  }

  selectStudent(student: SchoolStudent): void {
    this.selectedStudent.set(student);
    this.walletService.getTransactions(student.id!)
      .subscribe(t => this.transactions.set(t));
  }

  openRechargeModal(): void {
    this.rechargeForm.reset({ amount: 5, method: 'transfer', paymentRef: '', note: '' });
    this.showModal.set(true);
    this.errorMsg.set(null);
  }

  setQuickAmount(amount: number): void {
    this.rechargeForm.patchValue({ amount });
  }

  async confirmRecharge(recharge: SchoolRecharge): Promise<void> {
    if (!confirm(`¿Confirmar recarga de $${recharge.amount.toFixed(2)} para ${recharge.studentName}?`)) return;
    await this.walletService.confirmRecharge(recharge.id!);
  }

  async rejectRecharge(id: string): Promise<void> {
    if (!confirm('¿Rechazar esta recarga?')) return;
    await this.walletService.rejectRecharge(id);
  }

  txTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      purchase: 'Compra', recharge: 'Recarga', refund: 'Reembolso', adjustment: 'Ajuste'
    };
    return labels[type] ?? type;
  }

  txColor(type: string): string {
    return type === 'purchase' ? 'danger' : 'success';
  }
}
