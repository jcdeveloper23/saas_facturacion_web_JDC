import { Injectable, signal, computed, inject, effect } from '@angular/core';
import {
  PosCartItem, PosCartState, PosSession, PosTerminal,
  calcCartTotals, calcCartItem
} from '../models/pos.interface';
import { Product } from '../../products/models/product.interface';
import { Person } from '../../personas/models/person.interface';
import { PersonasService } from '../../personas/services/personas.service';
import { AuthService } from '../../../core/services/auth.service';

/**
 * PosSessionService — estado en memoria del POS activo.
 * Mantiene el carrito, el terminal y la sesión abierta actuales.
 * NO persiste en Firestore directamente: eso lo hace PosCashService / PosSalesService.
 */
@Injectable({ providedIn: 'root' })
export class PosSessionService {
  private auth         = inject(AuthService);
  private personasSvc  = inject(PersonasService);

  // ── Cliente por defecto cargado desde Firestore ────────────────────────────
  readonly defaultCustomer = signal<Person | null>(null);

  // ── Company isolation guard ────────────────────────────────────────────────
  // Tracks the last known companyId. When it changes (company switch),
  // all in-memory POS state is wiped immediately to prevent cross-tenant leaks.
  private _lastCompanyId = '';

  constructor() {
    effect(() => {
      const companyId = this.auth.user()?.companyId ?? '';
      // Clear when we HAD a known company and it changed (covers logout + company switch)
      if (this._lastCompanyId && this._lastCompanyId !== companyId) {
        this.activeTerminal.set(null);
        this.activeSession.set(null);
        this.cartItems.set([]);
        this.globalDiscountPct.set(0);
        this.defaultCustomer.set(null);
        this.setDefaultCustomer();
      }
      // Only persist non-empty company ids so logout doesn't reset the reference
      if (companyId) this._lastCompanyId = companyId;
    });
  }

  // ── Terminal y sesión activos ──────────────────────────────────────────────
  readonly activeTerminal = signal<PosTerminal | null>(null);
  readonly activeSession  = signal<PosSession  | null>(null);

  // ── Carrito ────────────────────────────────────────────────────────────────
  readonly cartItems         = signal<PosCartItem[]>([]);
  readonly globalDiscountPct = signal<number>(0);

  // ── Cliente seleccionado ───────────────────────────────────────────────────
  readonly customerId        = signal<string>('');
  readonly customerName      = signal<string>('');
  readonly customerTaxId     = signal<string>('');
  readonly customerTaxIdType = signal<string>('');

  // ── Computed totals ────────────────────────────────────────────────────────
  readonly cartTotals = computed(() => {
    return calcCartTotals(this.cartItems(), this.globalDiscountPct());
  });

  readonly cartCount = computed(() =>
    this.cartItems().reduce((s, i) => s + i.quantity, 0)
  );

  readonly isCartEmpty = computed(() => this.cartItems().length === 0);

  readonly hasActiveSession = computed(() =>
    this.activeSession() !== null && this.activeSession()!.status === 'open'
  );

  // ─── Session management ────────────────────────────────────────────────────

  setTerminalAndSession(terminal: PosTerminal, session: PosSession): void {
    this.activeTerminal.set(terminal);
    this.activeSession.set(session);
  }

  clearSession(): void {
    this.activeTerminal.set(null);
    this.activeSession.set(null);
    this.clearCart();
  }

  // ─── Cart operations ───────────────────────────────────────────────────────

  addProduct(product: Product, quantity = 1): void {
    const vatPct   = product.taxRate ?? 0;
    const existing = this.cartItems().find(i => i.productId === product.id);

    if (existing) {
      this.updateQuantity(product.id, existing.quantity + quantity);
    } else {
      const item: PosCartItem = {
        productId:        product.id,
        productSku:       product.sku,
        productName:      product.name,
        productShortName: product.shortName,
        imageUrl:         product.imageUrl,
        unitPrice:        product.salePrice,
        salePrice:        product.salePrice,
        quantity,
        discountPct:      0,
        vatPct,
        vatCode:          product.taxRateCode,
        noStock:          product.noStock,
        averageCost:      product.averageCost,
        ...calcCartItem({ quantity, salePrice: product.salePrice, discountPct: 0, vatPct })
      };
      this.cartItems.update(items => [...items, item]);
    }
  }

  addProductByBarcode(barcode: string, products: Product[]): Product | null {
    const found = products.find(p =>
      p.barcode === barcode || p.sku === barcode || p.partNumber === barcode
    );
    if (found) { this.addProduct(found); return found; }
    return null;
  }

  updateQuantity(productId: string, qty: number): void {
    if (qty <= 0) { this.removeItem(productId); return; }
    this.cartItems.update(items =>
      items.map(i => {
        if (i.productId !== productId) return i;
        const calcs = calcCartItem({ ...i, quantity: qty });
        return { ...i, quantity: qty, ...calcs };
      })
    );
  }

  updateItemDiscount(productId: string, discountPct: number): void {
    this.cartItems.update(items =>
      items.map(i => {
        if (i.productId !== productId) return i;
        const calcs = calcCartItem({ ...i, discountPct });
        return { ...i, discountPct, ...calcs };
      })
    );
  }

  updateItemPrice(productId: string, newPrice: number): void {
    this.cartItems.update(items =>
      items.map(i => {
        if (i.productId !== productId) return i;
        const calcs = calcCartItem({ ...i, salePrice: newPrice });
        return { ...i, salePrice: newPrice, ...calcs };
      })
    );
  }

  removeItem(productId: string): void {
    this.cartItems.update(items => items.filter(i => i.productId !== productId));
  }

  clearCart(): void {
    this.cartItems.set([]);
    this.globalDiscountPct.set(0);
    this.setDefaultCustomer();
  }

  setGlobalDiscount(pct: number): void {
    this.globalDiscountPct.set(Math.max(0, Math.min(100, pct)));
  }

  // ─── Customer ──────────────────────────────────────────────────────────────

  setCustomer(id: string, name: string, taxId: string, taxIdType = 'CI'): void {
    this.customerId.set(id);
    this.customerName.set(name);
    this.customerTaxId.set(taxId);
    this.customerTaxIdType.set(taxIdType);
  }

  /** Carga desde Firestore el cliente marcado como isDefault y lo almacena en memoria. */
  async loadDefaultCustomer(): Promise<void> {
    const customer = await this.personasSvc.getDefaultCustomer();
    this.defaultCustomer.set(customer);
    // Si aún no hay cliente seleccionado (inicio de sesión), aplicar de inmediato
    if (!this.activeTerminal()?.defaultCustomerId) {
      this.setDefaultCustomer();
    }
  }

  setDefaultCustomer(): void {
    // Prioridad 1: cliente por defecto configurado en el terminal
    const terminal = this.activeTerminal();
    if (terminal?.defaultCustomerId) {
      this.customerId.set(terminal.defaultCustomerId);
      this.customerName.set(terminal.defaultCustomerName ?? '');
      this.customerTaxId.set(terminal.defaultCustomerTaxId ?? '');
      this.customerTaxIdType.set('');
      return;
    }

    // Prioridad 2: cliente marcado isDefault en Firestore
    const def = this.defaultCustomer();
    if (def) {
      this.customerId.set(def.id);
      this.customerName.set(def.name);
      this.customerTaxId.set(def.taxId);
      this.customerTaxIdType.set(def.taxIdType);
      return;
    }

    // Sin cliente por defecto: limpiar selección
    this.customerId.set('');
    this.customerName.set('');
    this.customerTaxId.set('');
    this.customerTaxIdType.set('');
  }

  // ─── Snapshot for saving ───────────────────────────────────────────────────

  getCartSnapshot(): PosCartState {
    return {
      items:           this.cartItems(),
      customerId:      this.customerId(),
      customerName:    this.customerName(),
      customerTaxId:   this.customerTaxId(),
      customerTaxIdType: this.customerTaxIdType(),
      globalDiscountPct: this.globalDiscountPct(),
      ...this.cartTotals()
    };
  }
}
