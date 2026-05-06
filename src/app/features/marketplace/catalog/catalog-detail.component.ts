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

  addToCart(e: MouseEvent): void {
    const p = this.product();
    if (!p || (p.stockAvailable === 0 && !p.noStock)) return;
    this.cartSvc.addItem(p, this.slug, this.qty());
    this.addedFeedback.set(true);
    this.flyToCart(e.currentTarget as HTMLElement, p);
    setTimeout(() => { this.addedFeedback.set(false); this.qty.set(1); }, 1800);
  }

  private flyToCart(triggerEl: HTMLElement, product: PublicProduct): void {
    const cartBtn = document.querySelector('.cs-cart-btn') as HTMLElement | null;
    if (!cartBtn) return;

    // Usa la imagen principal de la galería como origen visual
    const imgEl = document.querySelector('.cd-gallery__img') as HTMLElement | null;
    const src   = (imgEl ?? triggerEl).getBoundingClientRect();
    const dst   = cartBtn.getBoundingClientRect();

    const size = 68;
    const sx = src.left + src.width  / 2 - size / 2;
    const sy = src.top  + src.height / 2 - size / 2;
    const ex = dst.left + dst.width  / 2 - size / 2;
    const ey = dst.top  + dst.height / 2 - size / 2;
    const dx = ex - sx;
    const dy = ey - sy;

    const images = this.productImages();
    const duration = 820;

    const outer = document.createElement('div');
    Object.assign(outer.style, {
      position:      'fixed', zIndex: '9999',
      left:          `${sx}px`, top: `${sy}px`,
      width:         `${size}px`, height: `${size}px`,
      pointerEvents: 'none', willChange: 'transform',
    });

    const inner = document.createElement('div');
    Object.assign(inner.style, {
      width: '100%', height: '100%',
      borderRadius: '50%', overflow: 'hidden',
      boxShadow: '0 6px 24px rgba(0,0,0,.45)',
      border: '3px solid #fff', willChange: 'transform,opacity',
      background: images[0]
        ? `url(${images[0]}) center/cover no-repeat`
        : 'var(--catalog-primary, #e47911)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    if (!images[0]) {
      inner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="28" height="28">
        <path d="M1 1.75A.75.75 0 0 1 1.75 1h1.628a1.75 1.75 0 0 1 1.734 1.51L5.18 3a65.25 65.25 0 0 1 13.36 1.412.75.75 0 0 1 .58.875 48.645 48.645 0 0 1-1.618 6.2.75.75 0 0 1-.712.513H6a2.503 2.503 0 0 0-2.292 1.5H17.25a.75.75 0 0 1 0 1.5H2.76a.75.75 0 0 1-.748-.807 4.002 4.002 0 0 1 2.716-3.486L3.626 4.234a.25.25 0 0 0-.248-.234H1.75A.75.75 0 0 1 1 1.75zM6 17.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9.5 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>
      </svg>`;
    }

    outer.appendChild(inner);
    document.body.appendChild(outer);

    outer.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }],
      { duration, easing: 'cubic-bezier(0.42, 0, 0.58, 1)', fill: 'forwards' }
    );

    inner.animate(
      [
        { transform: 'translateY(0) scale(1)',          opacity: '1'   },
        { transform: `translateY(${dy}px) scale(0.38)`, opacity: '0.65' },
      ],
      { duration, easing: 'cubic-bezier(0.0, 0.0, 0.2, 1)', fill: 'forwards' }
    ).finished.then(() => {
      outer.remove();
      this.burstParticles(cartBtn);
      cartBtn.classList.add('cs-cart-bounce');
      cartBtn.addEventListener('animationend', () => cartBtn.classList.remove('cs-cart-bounce'), { once: true });
    });
  }

  private burstParticles(origin: HTMLElement): void {
    const rect = origin.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;

    const colors = [
      'var(--catalog-primary, #e47911)',
      '#fbbf24', '#f472b6', '#34d399',
      '#60a5fa', '#ffffff', '#a78bfa', '#fb923c',
    ];

    const ring = document.createElement('div');
    Object.assign(ring.style, {
      position: 'fixed', zIndex: '9998', pointerEvents: 'none',
      left: `${cx - 22}px`, top: `${cy - 22}px`,
      width: '44px', height: '44px', borderRadius: '50%',
      border: '3px solid var(--catalog-primary, #e47911)',
    });
    document.body.appendChild(ring);
    ring.animate(
      [{ transform: 'scale(1)', opacity: '1' }, { transform: 'scale(3.8)', opacity: '0' }],
      { duration: 500, easing: 'ease-out', fill: 'forwards' }
    ).finished.then(() => ring.remove());

    const glow = document.createElement('div');
    Object.assign(glow.style, {
      position: 'fixed', zIndex: '9997', pointerEvents: 'none',
      left: `${cx - 32}px`, top: `${cy - 32}px`,
      width: '64px', height: '64px', borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,210,50,.95) 0%, transparent 70%)',
    });
    document.body.appendChild(glow);
    glow.animate(
      [{ transform: 'scale(0.3)', opacity: '1' }, { transform: 'scale(3)', opacity: '0' }],
      { duration: 400, easing: 'ease-out', fill: 'forwards' }
    ).finished.then(() => glow.remove());

    const COUNT = 16;
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const dist  = 40 + Math.random() * 30;
      const size  = 5 + Math.random() * 6;
      const color = colors[i % colors.length];
      const kind  = i % 4;

      const p = document.createElement('div');

      if (kind === 2) {
        p.textContent = '★';
        Object.assign(p.style, {
          position: 'fixed', zIndex: '10000', pointerEvents: 'none',
          left: `${cx}px`, top: `${cy}px`,
          fontSize: `${9 + Math.random() * 5}px`,
          color, lineHeight: '1', transformOrigin: '0 0',
        });
      } else {
        Object.assign(p.style, {
          position: 'fixed', zIndex: '10000', pointerEvents: 'none',
          left: `${cx - size / 2}px`, top: `${cy - size / 2}px`,
          width: `${size}px`, height: `${size}px`,
          borderRadius: kind === 1 ? '2px' : '50%',
          background: color,
          transform: kind === 1 ? 'rotate(45deg)' : '',
        });
      }

      document.body.appendChild(p);

      const tx  = Math.cos(angle) * dist;
      const ty  = Math.sin(angle) * dist;
      const rot = kind === 1 ? 'rotate(225deg)' : kind === 2 ? `rotate(${Math.random() > 0.5 ? 360 : -360}deg)` : '';
      const delay = Math.random() * 55;

      p.animate(
        [
          { transform: `translate(0,0) scale(1) ${kind === 1 ? 'rotate(45deg)' : ''}`, opacity: '1' },
          { transform: `translate(${tx}px,${ty}px) scale(0) ${rot}`,                   opacity: '0' },
        ],
        { duration: 480 + Math.random() * 160, easing: 'cubic-bezier(0,0,0.2,1)', fill: 'forwards', delay }
      ).finished.then(() => p.remove());
    }
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
