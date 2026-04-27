import { Injectable, signal, computed, effect } from '@angular/core';
import { PublicProduct } from '../models/catalog.interface';

export interface CartItem {
  product: PublicProduct;
  catalogSlug: string;
  qty: number;
}

const STORAGE_KEY = 'fs_catalog_cart';

@Injectable({ providedIn: 'root' })
export class CartService {

  items = signal<CartItem[]>(this._restore());

  totalItems = computed(() => this.items().reduce((s, i) => s + i.qty, 0));

  totalPrice = computed(() =>
    this.items().reduce((s, i) => {
      const price = i.product.salePrice * (1 + (i.product.taxRate ?? 0) / 100);
      return s + price * i.qty;
    }, 0)
  );

  constructor() {
    // Persistir en localStorage cada vez que cambia items
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items()));
      } catch { /* storage lleno o bloqueado */ }
    });
  }

  addItem(product: PublicProduct, catalogSlug: string, qty = 1): void {
    this.items.update(current => {
      const idx = current.findIndex(i => i.product.id === product.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + qty };
        return updated;
      }
      return [...current, { product, catalogSlug, qty }];
    });
  }

  removeItem(productId: string): void {
    this.items.update(current => current.filter(i => i.product.id !== productId));
  }

  updateQty(productId: string, qty: number): void {
    if (qty <= 0) { this.removeItem(productId); return; }
    this.items.update(current =>
      current.map(i => i.product.id === productId ? { ...i, qty } : i)
    );
  }

  clear(): void {
    this.items.set([]);
  }

  private _restore(): CartItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}
