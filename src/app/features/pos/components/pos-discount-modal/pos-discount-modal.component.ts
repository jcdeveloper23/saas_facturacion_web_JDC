import { Component, Input, Output, EventEmitter, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconModule } from '@coreui/icons-angular';

@Component({
  selector: 'app-pos-discount-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IconModule],
  templateUrl: './pos-discount-modal.component.html',
  styleUrl: './pos-discount-modal.component.scss'
})
export class PosDiscountModalComponent implements OnInit {
  @Input() currentDiscount = 0;
  @Output() applied = new EventEmitter<number>();
  @Output() cancelled = new EventEmitter<void>();

  readonly quickDiscounts = [5, 10, 15, 20, 25, 50];
  discountValue = 0;

  ngOnInit(): void { this.discountValue = this.currentDiscount; }

  apply(): void {
    const pct = Math.max(0, Math.min(100, this.discountValue));
    this.applied.emit(pct);
  }

  setQuick(pct: number): void { this.discountValue = pct; }
  remove(): void { this.applied.emit(0); }
}
