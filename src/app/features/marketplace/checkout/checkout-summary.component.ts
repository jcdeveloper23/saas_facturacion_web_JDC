import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService, CartItem } from '../services/cart.service';
import { calcOrderTotals } from '../models/catalog-order.interface';

@Component({
  selector: 'app-checkout-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './checkout-summary.component.html',
  styleUrl: './checkout-summary.component.scss',
})
export class CheckoutSummaryComponent {
  readonly cart = inject(CartService);

  readonly totals = computed(() => calcOrderTotals(this.cart.items()));

  /** Retorna la URL de imagen del item o null — evita `string | undefined` en template strict */
  getItemImage(item: CartItem): string | null {
    return item.product.imageUrls?.[0] ?? item.product.imageUrl ?? null;
  }
}
