import { Injectable, inject } from '@angular/core';
import { Firestore, collection, getDocs, limit, query, where } from '@angular/fire/firestore';

import { TenantService } from '../../../core/services/tenant.service';
import { PayrollEmployee, Payslip } from '../models/payroll.models';
import { PayrollAdvance } from '../models/payroll-payments.models';
import { PayrollGroup, PayrollLoan } from '../models/payroll-loans.models';
import { toEmployee, toPayslip } from './payroll.service';
import { toAdvance } from './payroll-payments.service';
import { toGroup, toLoan } from './payroll-loans.service';

/**
 * Reportes de nómina: lecturas únicas (getDocs, sin escuchar), con un solo
 * campo en el where para no pedir índices compuestos. Los filtros de estado
 * se aplican en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class PayrollReportsService {
  private firestore = inject(Firestore);
  private tenant = inject(TenantService);

  private col(c: string) { return collection(this.firestore, `companies/${this.tenant.companyId}/${c}`); }

  private async read<T>(q: any, map: (id: string, d: Record<string, any>) => T): Promise<T[]> {
    const snap = await getDocs(q);
    return snap.docs.map((d: any) => map(d.id, d.data()));
  }

  /** Los roles aprobados de un mes (los reversados y los borradores quedan fuera). */
  async approvedPayslips(period: string): Promise<Payslip[]> {
    const all = await this.read(query(this.col('payslips'), where('period', '==', period), limit(2000)), toPayslip);
    return all.filter((p) => p.status === 'approved');
  }

  /** Los roles aprobados entre dos meses ('AAAA-MM', ambos incluidos). */
  async approvedPayslipsBetween(from: string, to: string): Promise<Payslip[]> {
    const q = query(this.col('payslips'), where('period', '>=', from), where('period', '<=', to), limit(10000));
    return (await this.read(q, toPayslip)).filter((p) => p.status === 'approved');
  }

  /** Anticipos registrados (no anulados) que se descuentan entre dos meses. */
  async advancesBetween(from: string, to: string): Promise<PayrollAdvance[]> {
    const q = query(this.col('payrollAdvances'), where('period', '>=', from), where('period', '<=', to), limit(5000));
    return (await this.read(q, toAdvance)).filter((a) => a.status === 'posted');
  }

  activeLoans(): Promise<PayrollLoan[]> {
    return this.read(query(this.col('payrollLoans'), where('status', '==', 'active'), limit(2000)), toLoan);
  }

  employees(): Promise<PayrollEmployee[]> {
    return this.read(query(this.col('payrollEmployees'), limit(1000)), toEmployee);
  }

  groups(): Promise<PayrollGroup[]> {
    return this.read(query(this.col('payrollGroups'), limit(200)), toGroup);
  }
}
