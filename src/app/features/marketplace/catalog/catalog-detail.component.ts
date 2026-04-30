import {
  Component, OnInit, OnDestroy,
  inject, signal, computed, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicCatalog, PublicProduct } from '../models/catalog.interface';
import { CartService } from '../services/cart.service';

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
  private cartSvc    = inject(CartService);
  private subs       = new Subscription();

  @ViewChild('relatedScroll') relatedScroll?: ElementRef<HTMLDivElement>;

  catalog        = signal<PublicCatalog | null>(null);
  allProducts    = signal<PublicProduct[]>([]);
  loading        = signal(true);
  shareFeedback  = signal('');
  activeImageIdx = signal(0);
  slideDir       = signal<'left' | 'right' | null>(null);

  qty            = signal(1);
  addedFeedback  = signal(false);

  productId      = signal<string | null>(null);
  likesCounts    = signal<Record<string, number>>({});

  // Touch swipe
  private _touchStartX = 0;

  product = computed<PublicProduct | null>(() => {
    const id = this.productId();
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
    const current = this.product();
    if (!current) return [];

    const all = this.allProducts();
    const likes = this.likesCounts();

    // 1. Productos de la misma categoría (excluyendo el actual)
    const sameFamily = all.filter(p => p.familyId === current.familyId && p.id !== current.id);

    // 2. Rellenamos con todos los demás productos del catálogo
    const others = all.filter(p => p.familyId !== current.familyId && p.id !== current.id);
    
    // Ordenar por popularidad (likes) los de otras categorías
    others.sort((a, b) => (likes[b.id] ?? 0) - (likes[a.id] ?? 0));

    return [...sameFamily, ...others];
  });

  relatedTitle = computed<string>(() => {
    const current = this.product();
    const related = this.relatedProducts();
    if (!current || related.length === 0) return '';
    
    const allSameFamily = related.every(p => p.familyId === current.familyId);
    return allSameFamily 
      ? `Más en ${current.familyName}` 
      : 'También te puede interesar';
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

  // ─── Cart ─────────────────────────────────────────────────────────────────

  decrementQty(): void { this.qty.update(q => Math.max(1, q - 1)); }
  incrementQty(): void { this.qty.update(q => q + 1); }

  addToCart(): void {
    const p = this.product();
    if (!p || (p.stockAvailable === 0 && !p.noStock)) return;
    this.cartSvc.addItem(p, this.slug, this.qty());
    this.addedFeedback.set(true);
    setTimeout(() => { this.addedFeedback.set(false); this.qty.set(1); }, 1800);
  }

  scrollRelated(dir: number): void {
    if (!this.relatedScroll) return;
    const el = this.relatedScroll.nativeElement;
    const scrollAmount = 320; // Aproximadamente 2 tarjetas
    el.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
  }

  ngOnInit(): void {
    this.subs.add(this.route.paramMap.subscribe(params => {
      this.productId.set(params.get('productId'));
      this.activeImageIdx.set(0); // Reiniciar galería al cambiar de producto
    }));

    const slug = this.route.parent?.snapshot.paramMap.get('slug') ?? '';
    this.subs.add(this.catalogSvc.getCatalogBySlug(slug).subscribe({
      next: data => this.catalog.set(data),
      error: err => console.error('[CatalogDetail] catalog error:', err)
    }));

    // Cargar popularidad para el relleno de relacionados
    this.subs.add(this.catalogSvc.getLikesForCatalog(slug).subscribe({
      next: counts => this.likesCounts.set(counts),
      error: err => console.error('[CatalogDetail] likes error:', err)
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
