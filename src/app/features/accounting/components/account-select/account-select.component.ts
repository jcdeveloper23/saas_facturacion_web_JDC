import {
  Component, Input, Output, EventEmitter, signal, computed,
  forwardRef, HostListener, ElementRef, inject, ViewChild
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Account } from '../../models/account.interface';

function normalize(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

@Component({
  selector: 'app-account-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './account-select.component.html',
  styleUrl: './account-select.component.scss',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AccountSelectComponent), multi: true }]
})
export class AccountSelectComponent implements ControlValueAccessor {
  @Input() accounts: Account[] = [];
  @Input() placeholder = '— Seleccionar cuenta —';
  @Input() codeOnly = false;
  @Input() invalid = false;
  @Output() accountSelected = new EventEmitter<Account | null>();

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('dropdownEl')  dropdownRef?:   ElementRef<HTMLDivElement>;

  private elRef = inject(ElementRef);

  value       = signal('');
  searchTerm  = signal('');
  isOpen      = signal(false);
  highlighted = signal(0);
  isDisabled  = signal(false);

  private _onChange:  (v: string) => void = () => {};
  private _onTouched: () => void = () => {};

  filteredAccounts = computed(() => {
    const t = normalize(this.searchTerm());
    if (!t) return this.accounts;
    return this.accounts.filter(a => normalize(a.code).includes(t) || normalize(a.name).includes(t));
  });

  displayValue = computed(() => {
    const code = this.value();
    if (!code) return '';
    const acc = this.accounts.find(a => a.code === code);
    if (!acc) return code;
    return this.codeOnly ? acc.code : `${acc.code} — ${acc.name}`;
  });

  writeValue(code: string): void { this.value.set(code ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(d: boolean): void { this.isDisabled.set(d); }

  open(): void {
    if (this.isDisabled()) return;
    this.searchTerm.set('');
    this.isOpen.set(true);
    setTimeout(() => {
      const idx = this.filteredAccounts().findIndex(a => a.code === this.value());
      this.highlighted.set(idx >= 0 ? idx : 0);
      this.searchInputRef?.nativeElement.focus();
      this.scrollToHighlighted();
    });
  }

  close(): void {
    this.isOpen.set(false);
    this._onTouched();
  }

  select(acc: Account): void {
    this.value.set(acc.code);
    this._onChange(acc.code);
    this.accountSelected.emit(acc);
    this.close();
  }

  onInput(term: string): void {
    this.searchTerm.set(term);
    this.highlighted.set(0);
  }

  onSearchKeydown(e: KeyboardEvent): void {
    const list = this.filteredAccounts();
    switch (e.key) {
      case 'ArrowDown':
        this.highlighted.update(i => Math.min(i + 1, list.length - 1));
        e.preventDefault(); this.scrollToHighlighted(); break;
      case 'ArrowUp':
        this.highlighted.update(i => Math.max(i - 1, 0));
        e.preventDefault(); this.scrollToHighlighted(); break;
      case 'Enter':
        if (list[this.highlighted()]) this.select(list[this.highlighted()]);
        e.preventDefault(); break;
      case 'Escape':
        this.close(); e.preventDefault(); break;
    }
  }

  onTriggerKey(e: KeyboardEvent): void {
    if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { this.open(); e.preventDefault(); }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (this.isOpen() && !this.elRef.nativeElement.contains(e.target as Node)) this.close();
  }

  private scrollToHighlighted(): void {
    setTimeout(() => {
      this.dropdownRef?.nativeElement
        .querySelector<HTMLElement>('.acc-option.highlighted')
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  trackByCode(_: number, acc: Account): string { return acc.code; }
}
