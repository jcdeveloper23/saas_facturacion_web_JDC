import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService } from '../services/cart.service';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cart-drawer.component.html',
  styleUrl: './cart-drawer.component.scss',
})
export class CartDrawerComponent {
  protected cart = inject(CartService);

  close    = output<void>();
  checkout = output<void>();

  decrement(productId: string, currentQty: number): void {
    this.cart.updateQty(productId, currentQty - 1);
  }

  increment(productId: string, currentQty: number): void {
    this.cart.updateQty(productId, currentQty + 1);
  }
}
