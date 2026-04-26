import {
  Component, OnInit, OnDestroy, inject, signal, computed, HostListener, ElementRef, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  SpinnerModule, BadgeModule, TooltipModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PosSessionService } from '../services/pos-session.service';
import { PosSalesService, CompleteSaleInput } from '../services/pos-sales.service';
import { PosHardwareService } from '../services/pos-hardware.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ProductsService } from '../../products/services/products.service';
import { TenantService }   from '../../../core/services/tenant.service';
import { AuthService }     from '../../../core/services/auth.service';
import {
  PosPayment, PosCartItem, PosSale
} from '../models/pos.interface';
import { Product, Family } from '../../products/models/product.interface';
import { PosPaymentModalComponent } from '../components/pos-payment-modal/pos-payment-modal.component';
import { PosCustomerSearchComponent } from '../components/pos-customer-search/pos-customer-search.component';
import { PosDiscountModalComponent } from '../components/pos-discount-modal/pos-discount-modal.component';

@Component({
  selector: 'app-pos-main',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    SpinnerModule, BadgeModule, TooltipModule, AlertModule,
    IconModule,
    PosPaymentModalComponent,
    PosCustomerSearchComponent,
    PosDiscountModalComponent
  ],
  templateUrl: './pos-main.component.html',
  styleUrl: './pos-main.component.scss'
})
export class PosMainComponent implements OnInit, OnDestroy {
  private destroy$     = new Subject<void>();
  readonly posSession  = inject(PosSessionService);
  private salesService = inject(PosSalesService);
  private hardware     = inject(PosHardwareService);
  private notify       = inject(NotificationService);
  private productsService = inject(ProductsService);
  private tenantService   = inject(TenantService);
  private router          = inject(Router);
  private auth            = inject(AuthService);

  // ── Products catalog ───────────────────────────────────────────────────────
  readonly allProducts     = signal<Product[]>([]);
  readonly allFamilies     = signal<Family[]>([]);
  readonly selectedFamily  = signal<string | null>(null);
  readonly searchQuery     = signal('');
  readonly loadingProducts = signal(true);

  // ── UI state ───────────────────────────────────────────────────────────────
  readonly showPaymentModal   = signal(false);
  readonly showCustomerSearch = signal(false);
  readonly showDiscountModal  = signal(false);
  readonly showCashMovModal   = signal(false);
  readonly processingPayment  = signal(false);
  readonly lastSale           = signal<PosSale | null>(null);
  readonly showTicketPreview  = signal(false);

  // Cash movement form
  cashMovType: 'cash_in' | 'cash_out' = 'cash_in';
  cashMovAmount = 0;
  cashMovReason = '';

  // ── Filtered products ──────────────────────────────────────────────────────
  readonly filteredProducts = computed(() => {
    let list = this.allProducts().filter(p => p.isSold && p.isActive && !p.isBlocked);
    const family = this.selectedFamily();
    if (family) list = list.filter(p => p.familyId === family);
    const q = this.searchQuery().toLowerCase().trim();
    if (q) list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').includes(q) ||
      (p.shortName ?? '').toLowerCase().includes(q)
    );
    return list;
  });

  // Cart shortcuts
  readonly cart    = this.posSession.cartItems;
  readonly totals  = this.posSession.cartTotals;
  readonly isEmpty = this.posSession.isCartEmpty;

  ngOnInit(): void {
    if (!this.posSession.hasActiveSession()) {
      this.router.navigate(['/pos']);
      return;
    }
    this.loadCatalog();
    this.hardware.enableBarcodeScanner();

    this.hardware.barcodeScanned$
      .pipe(takeUntil(this.destroy$))
      .subscribe(code => this.handleBarcode(code));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.hardware.disableBarcodeScanner();
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeyboard(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case 'F1':  e.preventDefault(); this.openPayment();        break;
      case 'F2':  e.preventDefault(); this.showCustomerSearch.set(true); break;
      case 'F3':  e.preventDefault(); this.focusSearch();        break;
      case 'F4':  e.preventDefault(); this.showDiscountModal.set(true); break;
      case 'Escape': this.clearCart(); break;
      case 'Delete':
        if (e.shiftKey) this.clearCart();
        break;
    }
  }

  // ─── Catalog ───────────────────────────────────────────────────────────────

  private loadCatalog(): void {
    this.productsService.getProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: products => {
          this.allProducts.set(products);
          this.loadingProducts.set(false);
          // Extraer familias únicas
          const familyMap = new Map<string, Family>();
          products.forEach(p => {
            if (p.familyId && p.familyName) {
              familyMap.set(p.familyId, {
                id: p.familyId,
                code: p.familyCode ?? '',
                name: p.familyName,
                isActive: true
              } as Family);
            }
          });
          this.allFamilies.set([...familyMap.values()].sort((a, b) => a.name.localeCompare(b.name)));
        },
        error: () => {
          this.loadingProducts.set(false);
          this.notify.error('Error', 'No se pudo cargar el catálogo de productos');
        }
      });
  }

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  focusSearch(): void { this.searchInput?.nativeElement.focus(); }

  // ─── Barcode ───────────────────────────────────────────────────────────────

  handleBarcode(code: string): void {
    const found = this.posSession.addProductByBarcode(code, this.allProducts());
    if (found) {
      this.notify.success('', `${found.shortName ?? found.name} agregado`);
    } else {
      this.notify.warning('Código no encontrado', code);
    }
  }

  // ─── Cart actions ──────────────────────────────────────────────────────────

  addToCart(product: Product): void {
    this.posSession.addProduct(product);
  }

  increaseQty(productId: string): void {
    const item = this.cart().find(i => i.productId === productId);
    if (item) this.posSession.updateQuantity(productId, item.quantity + 1);
  }

  decreaseQty(productId: string): void {
    const item = this.cart().find(i => i.productId === productId);
    if (item) this.posSession.updateQuantity(productId, item.quantity - 1);
  }

  removeItem(productId: string): void {
    this.posSession.removeItem(productId);
  }

  clearCart(): void {
    this.posSession.clearCart();
    this.notify.info('Ticket borrado', '');
  }

  // ─── Customer ──────────────────────────────────────────────────────────────

  onCustomerSelected(data: { id: string; name: string; taxId: string; taxIdType: string }): void {
    this.posSession.setCustomer(data.id, data.name, data.taxId, data.taxIdType);
    this.showCustomerSearch.set(false);
  }

  resetCustomer(): void { this.posSession.setDefaultCustomer(); }

  // ─── Discount ─────────────────────────────────────────────────────────────

  onDiscountApplied(pct: number): void {
    this.posSession.setGlobalDiscount(pct);
    this.showDiscountModal.set(false);
  }

  // ─── Payment ───────────────────────────────────────────────────────────────

  openPayment(): void {
    if (this.isEmpty()) {
      this.notify.warning('Carrito vacío', 'Agrega productos antes de cobrar');
      return;
    }
    this.showPaymentModal.set(true);
  }

  async onPaymentConfirmed(payments: PosPayment[]): Promise<void> {
    this.showPaymentModal.set(false);
    this.processingPayment.set(true);

    try {
      const session  = this.posSession.activeSession()!;
      const terminal = this.posSession.activeTerminal()!;
      const cart     = this.posSession.getCartSnapshot();
      const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
      const cashPayment = payments.find(p => p.method === 'cash');
      const change = cashPayment ? Math.max(0, totalPaid - cart.total) : 0;

      const input: CompleteSaleInput = {
        cartState:    cart,
        payments,
        totalPaid,
        change,
        sessionId:    session.id,
        terminalId:   terminal.id,
        terminalName: terminal.name,
        seriesCode:   terminal.seriesCode ?? '',
        generateInvoice: false
      };

      const sale = await this.salesService.completeSale(input);
      this.lastSale.set(sale);

      // Imprimir ticket
      await this.printTicket(sale, terminal.name);

      // Abrir cajón si hay pago en efectivo
      if (cashPayment && terminal.cashDrawerEnabled) {
        await this.hardware.openCashDrawer(terminal);
      }

      this.posSession.clearCart();
      this.notify.success('Venta completada', `Ticket #${sale.ticketNumber} · $${sale.total.toFixed(2)}`);
      this.showTicketPreview.set(true);

    } catch (err: any) {
      this.notify.error('Error procesando venta', err.message ?? 'Error desconocido');
    } finally {
      this.processingPayment.set(false);
    }
  }

  closeTicketPreview(): void { this.showTicketPreview.set(false); this.lastSale.set(null); }

  // ─── Ticket ────────────────────────────────────────────────────────────────

  private async printTicket(sale: PosSale, terminalName: string): Promise<void> {
    const company = this.tenantService.company;
    if (!company) return;

    const ticketHtml = this.hardware.buildTicketHtml({
      companyName:  company.name,
      companyTaxId: company.taxId,
      terminalName,
      ticketNumber: sale.ticketNumber,
      date:         sale.createdAt.toDate(),
      cashier:      sale.userName,
      customer:     sale.customerName,
      lines:        sale.lines.map(l => ({
        name:  l.productShortName ?? l.productName,
        qty:   l.quantity,
        price: l.salePrice,
        total: l.lineTotal
      })),
      subtotal:  sale.subtotal,
      vatAmount: sale.vatAmount,
      total:     sale.total,
      payments:  sale.payments.map(p => ({ label: p.methodLabel, amount: p.amount })),
      change:    sale.change,
    });

    const terminal = this.posSession.activeTerminal();
    await this.hardware.printTicket(ticketHtml, terminal ?? undefined);
  }

  // ─── Cash movement ────────────────────────────────────────────────────────

  // (injected separately, managed via modal in the template)

  // ─── Navigation ───────────────────────────────────────────────────────────

  async goToClose(): Promise<void> {
    await this.router.navigate(['/pos/close']);
  }

  goToHistory(): void { this.router.navigate(['/pos/history']); }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  trackByProductId(_: number, p: Product): string { return p.id; }
  trackByItemId(_: number, i: PosCartItem): string { return i.productId; }

  get sessionInfo() { return this.posSession.activeSession(); }
  get terminalInfo() { return this.posSession.activeTerminal(); }
  get currentUser()  { return this.auth.user(); }
}
