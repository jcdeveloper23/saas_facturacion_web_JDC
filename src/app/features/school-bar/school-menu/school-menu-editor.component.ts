import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import {
  CardModule, ButtonModule, GridModule, FormModule, BadgeModule,
  AlertModule, ModalModule
} from '@coreui/angular';
import { Timestamp } from '@angular/fire/firestore';

import { SchoolMenuService } from '../services/school-menu.service';
import { SchoolMenu } from '../models';
import { ProductsService } from '../../products/services/products.service';
import { Product } from '../../products/models/product.interface';

@Component({
  selector: 'app-school-menu-editor',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, FormModule, BadgeModule,
    AlertModule, ModalModule
  ],
  templateUrl: './school-menu-editor.component.html'
})
export class SchoolMenuEditorComponent implements OnInit {
  private menuService  = inject(SchoolMenuService);
  private productsSvc  = inject(ProductsService);
  private fb           = inject(FormBuilder);

  menus      = signal<SchoolMenu[]>([]);
  products   = signal<Product[]>([]);
  saving     = signal(false);
  errorMsg   = signal<string | null>(null);
  showModal  = signal(false);
  editMenuId = signal<string | null>(null);

  menuForm = this.fb.group({
    date:        [new Date().toISOString().split('T')[0], Validators.required],
    orderCutoff: ['07:30'],
    notes:       [''],
    items:       this.fb.array([])
  });

  get itemsArray(): FormArray { return this.menuForm.get('items') as FormArray; }

  ngOnInit(): void {
    this.menuService.getMenus().subscribe(m => this.menus.set(m));
    this.productsSvc.getActiveProducts().subscribe(p => this.products.set(p));
  }

  openNewMenu(): void {
    this.editMenuId.set(null);
    this.menuForm.reset({ date: new Date().toISOString().split('T')[0], orderCutoff: '07:30', notes: '' });
    this.itemsArray.clear();
    this.addItem();
    this.showModal.set(true);
  }

  addItem(): void {
    this.itemsArray.push(this.fb.group({
      productId:   ['', Validators.required],
      productSku:  [''],
      name:        ['', Validators.required],
      description: [''],
      category:    ['main', Validators.required],
      price:       [{ value: 0, disabled: false }, [Validators.required, Validators.min(0.01)]],
      available:   [true]
    }));
  }

  removeItem(i: number): void { this.itemsArray.removeAt(i); }

  onProductSelect(i: number, productId: string): void {
    const product = this.products().find(p => p.id === productId);
    if (!product) return;
    const group = this.itemsArray.at(i);
    group.patchValue({
      productSku: product.sku,
      name:       product.name,
      price:      product.salePrice
    });
    // Price is always driven by the product catalog — disable editing
    group.get('price')?.disable();
  }

  isPriceDisabled(i: number): boolean {
    return !!this.itemsArray.at(i).get('productId')?.value;
  }

  async saveMenu(): Promise<void> {
    if (this.menuForm.invalid) return;
    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      const v = this.menuForm.getRawValue() as any;
      const cutoffDate = new Date(`${v.date}T${v.orderCutoff}:00`);
      const items = v.items.map((it: any, idx: number) => ({
        ...it,
        id:          `item_${idx}`,
        imageUrl:    '',
        mineducCategory: it.mineducCategory ?? 'allowed',
        dailyCapacity:   it.dailyCapacity   ?? 50,
        reservedCount:   0,
        soldCount:       0
      }));
      const menuData: Omit<SchoolMenu, 'id' | 'createdAt' | 'updatedAt'> = {
        companyId:      '',    // set by service
        date:           v.date,
        items,
        published:      false,
        orderCutoff:    Timestamp.fromDate(cutoffDate),
        totalItemCount: items.length
      };
      if (this.editMenuId()) {
        await this.menuService.updateMenu(this.editMenuId()!, menuData);
      } else {
        await this.menuService.createMenu(menuData);
      }
      this.showModal.set(false);
    } catch (e: any) {
      this.errorMsg.set(e.message ?? 'Error al guardar el menú.');
    } finally {
      this.saving.set(false);
    }
  }

  async publishMenu(menu: SchoolMenu): Promise<void> {
    if (!confirm(`¿Publicar el menú del ${menu.date}?`)) return;
    await this.menuService.publishMenu(menu.id!, menu.orderCutoff as Timestamp);
  }

  async deleteMenu(id: string): Promise<void> {
    if (!confirm('¿Eliminar este menú?')) return;
    await this.menuService.deleteMenu(id);
  }
}
