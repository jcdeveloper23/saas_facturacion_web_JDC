import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule, FormModule, ModalModule, SpinnerModule } from '@coreui/angular';

/**
 * Pide el motivo de una anulación (pago de roles o anticipo). Quien lo abre
 * llama a la callable con `confirmed` y lo cierra al terminar.
 */
@Component({
  selector: 'app-payroll-void-reason-modal',
  standalone: true,
  imports: [FormsModule, ButtonModule, FormModule, ModalModule, SpinnerModule],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && cancelled.emit()" backdrop="static">
  <c-modal-header>
    <h5 cModalTitle>{{ title }}</h5>
    <button type="button" class="btn-close" (click)="cancelled.emit()"></button>
  </c-modal-header>
  <c-modal-body class="small">
    <p>{{ text }}</p>
    <label cLabel>Motivo *</label>
    <textarea cFormControl rows="2" [(ngModel)]="reason" maxlength="300"></textarea>
  </c-modal-body>
  <c-modal-footer>
    <button cButton color="secondary" variant="outline" (click)="cancelled.emit()">Volver</button>
    <button cButton color="danger" (click)="confirmed.emit(reason.trim())" [disabled]="busy || !reason.trim()">
      @if (busy) { <c-spinner size="sm" class="me-1"></c-spinner> } {{ confirmLabel }}
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class VoidReasonModalComponent {
  @Input({ required: true }) title = '';
  @Input() text = '';
  @Input() busy = false;
  @Input() confirmLabel = 'Anular';
  @Output() confirmed = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();
  reason = '';
}
