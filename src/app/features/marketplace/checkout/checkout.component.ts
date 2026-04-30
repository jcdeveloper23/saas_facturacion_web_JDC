import {
  Component, inject, signal, computed, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CartService } from '../services/cart.service';
import { CatalogOrderService } from '../services/catalog-order.service';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicCatalog } from '../models/catalog.interface';
import { CatalogPaymentMethod, OrderCustomer } from '../models/catalog-order.interface';

import { CheckoutSummaryComponent } from './checkout-summary.component';
import { CheckoutCustomerComponent } from './checkout-customer.component';
import { CheckoutPaymentComponent } from './checkout-payment.component';
import { CheckoutConfirmComponent } from './checkout-confirm.component';

export type CheckoutStep = 'customer' | 'payment' | 'confirm';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CheckoutSummaryComponent,
    CheckoutCustomerComponent,
    CheckoutPaymentComponent,
    CheckoutConfirmComponent,
  ],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
})
export class CheckoutComponent implements OnInit {
  private route     = inject(ActivatedRoute);
  private router    = inject(Router);
  readonly cart     = inject(CartService);
  private orderSvc  = inject(CatalogOrderService);
  private catalogSvc = inject(PublicCatalogService);

  readonly slug    = signal('');
  readonly catalog = signal<PublicCatalog | null>(null);
  readonly step    = signal<CheckoutStep>('customer');

  // Datos acumulados entre pasos
  readonly customerData   = signal<OrderCustomer | null>(null);
  readonly paymentMethod  = signal<CatalogPaymentMethod>('transfer');
  readonly proofFile      = signal<File | null>(null);

  readonly processing = signal(false);
  readonly errorMsg   = signal<string | null>(null);

  readonly steps: { key: CheckoutStep; label: string }[] = [
    { key: 'customer', label: 'Tus datos' },
    { key: 'payment',  label: 'Pago' },
    { key: 'confirm',  label: 'Confirmar' },
  ];

  readonly stepIndex = computed(() =>
    this.steps.findIndex(s => s.key === this.step())
  );

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.slug.set(slug);

    if (this.cart.items().length === 0) {
      this.router.navigate(['/', slug]);
      return;
    }

    this.catalogSvc.getCatalogBySlug(slug).subscribe(data => {
      this.catalog.set(data);
    });
  }

  goToStep(step: CheckoutStep): void {
    // Solo permite retroceder, no saltar hacia adelante
    const targetIdx  = this.steps.findIndex(s => s.key === step);
    const currentIdx = this.stepIndex();
    if (targetIdx <= currentIdx) this.step.set(step);
  }

  // ─── Callbacks de cada paso ──────────────────────────────────────────────

  onCustomerNext(data: OrderCustomer): void {
    this.customerData.set(data);
    this.step.set('payment');
  }

  onPaymentNext(data: { method: CatalogPaymentMethod; file: File | null }): void {
    this.paymentMethod.set(data.method);
    this.proofFile.set(data.file);
    this.step.set('confirm');
  }

  async onConfirm(): Promise<void> {
    this.processing.set(true);
    this.errorMsg.set(null);

    console.log('[Checkout] slug:', this.slug(), '| catalog:', this.catalog(), '| items:', this.cart.items().length);

    try {
      const order = await this.orderSvc.createOrder({
        slug:          this.slug(),
        companyId:     this.catalog()!.companyId,
        customer:      this.customerData()!,
        items:         this.cart.items(),
        paymentMethod: this.paymentMethod(),
      });

      if (this.paymentMethod() === 'transfer' && this.proofFile()) {
        await this.orderSvc.uploadPaymentProof(
          this.slug(), order.id, this.proofFile()!
        );
      }

      this.cart.clear();
      this.router.navigate(['/', this.slug(), 'orden', order.id]);

    } catch (err) {
      console.error('[Checkout] onConfirm error:', err);
      this.errorMsg.set('Ocurrió un error al procesar tu pedido. Intenta de nuevo.');
    } finally {
      this.processing.set(false);
    }
  }
}
