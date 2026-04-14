import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../icons/icon-subset';

import { StockService }       from './stock.service';
import { StockMovement, StockMovementType } from '../products/models/product.interface';
import { NotificationService } from '../../core/services/notification.service';

type MovementTypeFilter = '' | StockMovementType;

const TYPE_LABELS: Record<StockMovementType, string> = {
  adjustment:       'Ajuste',
  sale:             'Venta',
  purchase:         'Compra',
  transfer_in:      'Transferencia entrada',
  transfer_out:     'Transferencia salida',
  return_sale:      'Devolución venta',
  return_purchase:  'Devolución compra'
};

const TYPE_COLORS: Record<StockMovementType, string> = {
  adjustment:      'warning',
  sale:            'danger',
  purchase:        'success',
  transfer_in:     'info',
  transfer_out:    'secondary',
  return_sale:     'primary',
  return_purchase: 'primary'
};

@Component({
  selector: 'app-stock-movements',
  templateUrl: './stock-movements.component.html',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    InputGroupComponent, InputGroupTextDirective,
    IconDirective
  ]
})
export class StockMovementsComponent implements OnInit, OnDestroy {
  private stockSvc      = inject(StockService);
  private notifications = inject(NotificationService);
  private iconSet       = inject(IconSetService);
  private destroy$      = new Subject<void>();

  movements    = signal<StockMovement[]>([]);
  loading      = signal(true);
  search       = signal('');
  filterType   = signal<MovementTypeFilter>('');

  readonly typeOptions = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

  constructor() { this.iconSet.icons = { ...iconSubset }; }

  filtered = computed(() => {
    const q    = this.search().toLowerCase().trim();
    const type = this.filterType();
    return this.movements()
      .filter(m => !type || m.type === type)
      .filter(m => !q ||
        m.productName.toLowerCase().includes(q) ||
        m.productSku.toLowerCase().includes(q) ||
        (m.reason ?? '').toLowerCase().includes(q)
      );
  });

  ngOnInit(): void {
    this.stockSvc.getAllMovements(300)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: list => { this.movements.set(list); this.loading.set(false); },
        error: () => {
          this.notifications.error('Error al cargar movimientos');
          this.loading.set(false);
        }
      });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  typeLabel(type: StockMovementType): string  { return TYPE_LABELS[type] ?? type; }
  typeColor(type: StockMovementType): string   { return TYPE_COLORS[type] ?? 'secondary'; }

  deltaClass(delta: number): string {
    return delta > 0 ? 'text-success fw-bold' : delta < 0 ? 'text-danger fw-bold' : 'text-muted';
  }

  trackById(_: number, m: StockMovement): string { return m.id; }
}
