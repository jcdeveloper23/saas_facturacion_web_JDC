import { Component, inject, input, output, computed } from '@angular/core';
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

  /** Número de WhatsApp del catálogo (con código de país) */
  whatsapp = input<string | undefined>();

  close = output<void>();

  whatsappOrderUrl = computed<string | null>(() => {
    const phone = (this.whatsapp() ?? '').replace(/\D/g, '');
    if (!phone || this.cart.items().length === 0) return null;

    const lines = this.cart.items().map(i => {
      const price = i.product.salePrice * (1 + (i.product.taxRate ?? 0) / 100);
      return `• ${i.qty}x ${i.product.name} — $${price.toFixed(2)} c/u`;
    });

    const total = this.cart.totalPrice().toFixed(2);
    const msg = `Hola, quiero realizar el siguiente pedido:\n\n${lines.join('\n')}\n\n*Total: $${total}*`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  });

  decrement(productId: string, currentQty: number): void {
    this.cart.updateQty(productId, currentQty - 1);
  }

  increment(productId: string, currentQty: number): void {
    this.cart.updateQty(productId, currentQty + 1);
  }
}
