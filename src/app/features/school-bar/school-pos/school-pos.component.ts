import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, FormModule, AlertModule, SpinnerModule
} from '@coreui/angular';

import { SchoolMenuService } from '../services/school-menu.service';
import { SchoolOrderService, SchoolOrderCreateInput } from '../services/school-order.service';
import { SchoolStudentService, QrScanResult } from '../services/school-student.service';
import { SchoolInstitutionService } from '../services/school-institution.service';
import { ProductsService } from '../../products/services/products.service';
import { SchoolMenu, SchoolStudent, SchoolBarSettings } from '../models';
import { MenuItem } from '../models/school-menu.interface';
import { Product } from '../../products/models/product.interface';
import { MenuItemCategory } from '../models/school-menu.interface';

interface CartItem {
  productId:  string;
  productSku: string;
  name:       string;
  category:   MenuItemCategory;
  price:      number;
  quantity:   number;
  menuItemId?: string;
}

@Component({
  selector: 'app-school-pos',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, FormModule, AlertModule, SpinnerModule
  ],
  templateUrl: './school-pos.component.html'
})
export class SchoolPosComponent implements OnInit {
  private menuService     = inject(SchoolMenuService);
  private orderService    = inject(SchoolOrderService);
  private studentService  = inject(SchoolStudentService);
  private institutionSvc  = inject(SchoolInstitutionService);
  private productsSvc     = inject(ProductsService);

  // ── Catalog & menu ───────────────────────────────────────────────────────────
  products = signal<Product[]>([]);
  menu     = signal<SchoolMenu | null>(null);

  // ── Settings ─────────────────────────────────────────────────────────────────
  settings = signal<SchoolBarSettings | null>(null);

  // ── Student ──────────────────────────────────────────────────────────────────
  studentInput  = signal<string>('');   // ID written/scanned by cashier
  student       = signal<SchoolStudent | null>(null);
  studentLoading = signal(false);
  studentError  = signal<string | null>(null);

  // ── Cart ─────────────────────────────────────────────────────────────────────
  cart = signal<CartItem[]>([]);

  // ── UI state ─────────────────────────────────────────────────────────────────
  errorMsg   = signal<string | null>(null);
  successMsg = signal<string | null>(null);
  processing = signal(false);

  today = new Date().toISOString().split('T')[0];

  total = computed(() =>
    this.cart().reduce((sum, ci) => sum + ci.price * ci.quantity, 0)
  );

  warehouseCode = computed(() =>
    this.settings()?.barConfig?.defaultWarehouseCode ?? 'PRINCIPAL'
  );

  ngOnInit(): void {
    // Primary catalog — all active products, always available
    this.productsSvc.getActiveProducts().subscribe(p => this.products.set(p));
    // Daily menu — optional planning tool
    this.menuService.getPublishedMenuForDate(this.today).subscribe(m => this.menu.set(m));
    // Bar settings for warehouse code
    this.institutionSvc.getSettings().subscribe(s => this.settings.set(s));
  }

  // ── Student lookup ───────────────────────────────────────────────────────────

  async lookupStudent(): Promise<void> {
    const input = this.studentInput().trim();
    if (!input) return;
    this.studentLoading.set(true);
    this.studentError.set(null);
    this.student.set(null);
    try {
      if (this.studentService.isQrToken(input)) {
        // Escaneo QR — validar firma con Cloud Function
        const result: QrScanResult = await this.studentService.scanQr(input);
        this.student.set({
          id:           result.studentId,
          fullName:     result.fullName,
          code:         result.code,
          gradeId:      result.gradeId,
          gradeName:    result.gradeName,
          section:      result.section,
          walletBalance: result.walletBalance,
          state:        true
        } as any);
      } else {
        // ID manual — lectura directa de Firestore
        const s = await this.studentService.getStudentOnce(input);
        if (!s) {
          this.studentError.set('Alumno no encontrado.');
        } else if (!s.state) {
          this.studentError.set('Alumno inactivo.');
        } else {
          this.student.set(s);
        }
      }
    } catch (e: any) {
      this.studentError.set(e?.message ?? 'Error al buscar el alumno.');
    } finally {
      this.studentLoading.set(false);
    }
  }

  // ── Cart from catalog ────────────────────────────────────────────────────────

  addProductToCart(product: Product): void {
    this.updateCart(product.id!, product.sku, product.name, 'otro', product.salePrice);
  }

  addMenuItemToCart(item: MenuItem): void {
    if (!item.available) return;
    this.updateCart(item.productId, item.productSku, item.name, item.category, item.price, item.id);
  }

  private updateCart(
    productId: string, productSku: string, name: string,
    category: MenuItemCategory, price: number, menuItemId?: string
  ): void {
    const current = this.cart();
    const idx = current.findIndex(ci => ci.productId === productId);
    if (idx >= 0) {
      const updated = [...current];
      updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
      this.cart.set(updated);
    } else {
      this.cart.set([...current, { productId, productSku, name, category, price, quantity: 1, menuItemId }]);
    }
  }

  removeFromCart(productId: string): void {
    this.cart.set(this.cart().filter(ci => ci.productId !== productId));
  }

  setQuantity(productId: string, qty: number): void {
    if (qty <= 0) { this.removeFromCart(productId); return; }
    this.cart.set(this.cart().map(ci =>
      ci.productId === productId ? { ...ci, quantity: qty } : ci
    ));
  }

  clearCart(): void {
    this.cart.set([]);
    this.studentInput.set('');
    this.student.set(null);
    this.studentError.set(null);
    this.errorMsg.set(null);
    this.successMsg.set(null);
  }

  // ── Checkout ─────────────────────────────────────────────────────────────────

  async checkout(): Promise<void> {
    const s = this.student();
    if (!s || this.cart().length === 0) return;
    this.processing.set(true);
    this.errorMsg.set(null);
    try {
      const orderInput: SchoolOrderCreateInput = {
        companyId:    '',               // set by service
        menuId:       this.menu()?.id,
        orderType:    'immediate',
        deliveryType: 'bar_pickup',
        status:       'pending',
        studentId:    s.id!,
        studentName:  s.fullName,
        studentCode:  s.code,
        gradeId:      s.gradeId,
        gradeName:    s.gradeName,
        section:      s.section,
        warehouseCode: this.warehouseCode(),
        items:        this.cart().map(ci => ({
          menuItemId:  ci.menuItemId,
          productId:   ci.productId,
          productSku:  ci.productSku,
          name:        ci.name,
          category:    ci.category,
          unitPrice:   ci.price,
          quantity:    ci.quantity,
          lineTotal:   ci.price * ci.quantity
        })),
        paymentMethod: 'wallet',
        scheduledFor:  Timestamp.now()
      };
      await this.orderService.createAdvanceOrder(orderInput);
      this.successMsg.set(`Orden creada para ${s.fullName}. El wallet se descontará automáticamente.`);
      this.clearCart();
    } catch (e: any) {
      this.errorMsg.set(e.message ?? 'Error al procesar la venta.');
    } finally {
      this.processing.set(false);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  walletColor(balance: number): string {
    if (balance <= 0) return 'danger';
    if (balance < 2)  return 'warning';
    return 'success';
  }
}
