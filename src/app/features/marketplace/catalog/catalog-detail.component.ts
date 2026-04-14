import {
  Component, OnInit, OnDestroy,
  inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicCatalog, PublicProduct } from '../models/catalog.interface';

@Component({
  selector: 'app-catalog-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './catalog-detail.component.html',
  styleUrl: './catalog-detail.component.scss',
})
export class CatalogDetailComponent implements OnInit, OnDestroy {
  private route      = inject(ActivatedRoute);
  private router     = inject(Router);
  private catalogSvc = inject(PublicCatalogService);
  private subs       = new Subscription();

  catalog        = signal<PublicCatalog | null>(null);
  allProducts    = signal<PublicProduct[]>([]);
  loading        = signal(true);
  shareFeedback  = signal('');
  activeImageIdx = signal(0);
  slideDir       = signal<'left' | 'right' | null>(null);

  // Touch swipe
  private _touchStartX = 0;

  product = computed<PublicProduct | null>(() => {
    const id = this.route.snapshot.paramMap.get('productId');
    return this.allProducts().find(p => p.id === id) ?? null;
  });

  /** All images for the active product (fallback to single imageUrl) */
  productImages = computed<string[]>(() => {
    const p = this.product();
    if (!p) return [];
    if (p.imageUrls?.length) return p.imageUrls.filter(Boolean) as string[];
    if (p.imageUrl) return [p.imageUrl];
    return [];
  });

  relatedProducts = computed<PublicProduct[]>(() => {
    const p = this.product();
    if (!p?.familyId) return [];
    return this.allProducts()
      .filter(x => x.familyId === p.familyId && x.id !== p.id)
      .slice(0, 6);
  });

  finalPrice = computed<number>(() => {
    const p = this.product();
    if (!p) return 0;
    return p.salePrice * (1 + (p.taxRate ?? 0) / 100);
  });

  taxAmount = computed<number>(() => {
    const p = this.product();
    if (!p) return 0;
    return p.salePrice * (p.taxRate ?? 0) / 100;
  });

  /** URL de WhatsApp con mensaje pre-llenado del producto */
  whatsappUrl = computed<string | null>(() => {
    const cat = this.catalog();
    const p   = this.product();
    if (!cat?.whatsapp || !p) return null;
    const phone = cat.whatsapp.replace(/\D/g, '');
    if (!phone) return null;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const msg = `Hola, me interesa el producto: *${p.name}*\n${url}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  });

  ngOnInit(): void {
    const slug = this.route.parent?.snapshot.paramMap.get('slug') ?? '';
    this.subs.add(this.catalogSvc.getCatalogBySlug(slug).subscribe({
      next: data => this.catalog.set(data),
      error: err => console.error('[CatalogDetail] catalog error:', err)
    }));
    this.subs.add(this.catalogSvc.getPublicProducts(slug).subscribe({
      next: products => { this.allProducts.set(products); this.loading.set(false); },
      error: err => { console.error('[CatalogDetail] products error:', err); this.loading.set(false); }
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  private get slug(): string {
    return this.route.parent?.snapshot.paramMap.get('slug') ?? '';
  }

  goBack(): void {
    this.router.navigate(['/', this.slug]);
  }

  openProduct(id: string): void {
    this.activeImageIdx.set(0);
    this.router.navigate(['/', this.slug, 'p', id]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Carousel controls ────────────────────────────────────────────────────

  prevImage(): void {
    const total = this.productImages().length;
    if (total < 2) return;
    this.slideDir.set('right');
    this.activeImageIdx.update(i => (i - 1 + total) % total);
    this._clearSlideDir();
  }

  nextImage(): void {
    const total = this.productImages().length;
    if (total < 2) return;
    this.slideDir.set('left');
    this.activeImageIdx.update(i => (i + 1) % total);
    this._clearSlideDir();
  }

  goToImage(idx: number): void {
    const dir = idx > this.activeImageIdx() ? 'left' : 'right';
    this.slideDir.set(dir);
    this.activeImageIdx.set(idx);
    this._clearSlideDir();
  }

  private _clearSlideDir(): void {
    setTimeout(() => this.slideDir.set(null), 350);
  }

  onTouchStart(e: TouchEvent): void {
    this._touchStartX = e.changedTouches[0].clientX;
  }

  onTouchEnd(e: TouchEvent): void {
    const delta = e.changedTouches[0].clientX - this._touchStartX;
    if (Math.abs(delta) > 40) {
      delta < 0 ? this.nextImage() : this.prevImage();
    }
  }

  // ─── Share ────────────────────────────────────────────────────────────────

  async share(): Promise<void> {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: this.product()?.name ?? 'Producto', url }); } catch { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        this.shareFeedback.set('Enlace copiado al portapapeles');
        setTimeout(() => this.shareFeedback.set(''), 3000);
      } catch {
        this.shareFeedback.set('No se pudo copiar el enlace');
        setTimeout(() => this.shareFeedback.set(''), 3000);
      }
    }
  }
}
