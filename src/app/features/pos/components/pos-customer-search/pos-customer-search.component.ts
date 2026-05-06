import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { SpinnerModule, ModalModule, FormModule } from '@coreui/angular';

import { PersonasService } from '../../../personas/services/personas.service';
import { Person } from '../../../personas/models/person.interface';

@Component({
  selector: 'app-pos-customer-search',
  standalone: true,
  imports: [CommonModule, FormsModule, SpinnerModule, ModalModule, FormModule],
  templateUrl: './pos-customer-search.component.html',
  styleUrl: './pos-customer-search.component.scss'
})
export class PosCustomerSearchComponent implements OnInit, OnChanges, OnDestroy {
  @Input() visible = false;
  @Input() currentCustomerName = '';
  @Output() selected = new EventEmitter<{ id: string; name: string; taxId: string; taxIdType: string }>();
  @Output() cancelled = new EventEmitter<void>();

  private destroy$        = new Subject<void>();
  private personasService = inject(PersonasService);

  searchQuery  = '';
  readonly results  = signal<Person[]>([]);
  readonly loading  = signal(false);
  private searchSubject = new Subject<string>();

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(q => this.runSearch(q));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      // Reset y cargar recientes cada vez que el modal se abre
      this.searchQuery = '';
      this.results.set([]);
      this.runSearch('');
    }
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  onSearch(q: string): void { this.searchQuery = q; this.searchSubject.next(q); }

  private runSearch(q: string): void {
    this.loading.set(true);
    this.personasService.getPersonas('customer')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: list => {
          if (q.trim()) {
            const ql = q.toLowerCase();
            this.results.set(list.filter(p =>
              p.name.toLowerCase().includes(ql) ||
              p.legalName.toLowerCase().includes(ql) ||
              p.taxId.includes(ql)
            ).slice(0, 20));
          } else {
            this.results.set(list.slice(0, 20));
          }
          this.loading.set(false);
        },
        error: () => { this.loading.set(false); }
      });
  }

  selectPerson(p: Person): void {
    this.selected.emit({
      id:        p.id,
      name:      p.name,
      taxId:     p.taxId,
      taxIdType: p.taxIdType
    });
  }

  selectConsumidorFinal(): void {
    this.selected.emit({
      id:        'consumidor_final',
      name:      'Consumidor Final',
      taxId:     '9999999999999',
      taxIdType: 'CI'
    });
  }

  onVisibleChange(visible: boolean): void {
    if (!visible) this.cancelled.emit();
  }
}
