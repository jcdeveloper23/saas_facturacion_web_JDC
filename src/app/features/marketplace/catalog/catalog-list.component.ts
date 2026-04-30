import {
  Component, OnInit, OnDestroy, AfterViewInit,
  inject, signal, computed, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicCatalog, PublicProduct } from '../models/catalog.interface';
import { CatalogSearchService } from '../services/catalog-search.service';
import { CartService } from '../services/cart.service';

type SortKey = 'top_sellers' | 'recent' | 'price_asc' | 'price_desc';
type ViewMode = 'grid' | 'list';

interface Family { id: string; name: string; count: number; }

@Component({
  selector: 'app-catalog-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalog-list.component.html',
  styleUrl: './catalog-list.component.scss',
})
export class CatalogListComponent implements OnInit, OnDestroy, AfterViewInit {
  private route      = inject(ActivatedRoute);
  private router     = inject(Router);
  private catalogSvc = inject(PublicCatalogService);
  private searchSvc  = inject(CatalogSearchService);
  protected cartSvc  = inject(CartService);
  private subs       = new Subscription();

  @ViewChild('catBarScroll') catBarScrollRef!: ElementRef<HTMLDivElement>;

  ngAfterViewInit(): void {
    // Posicionar el scroll en la tanda central al inicio para permitir scroll a ambos lados
    setTimeout(() => {
      const el = this.catBarScrollRef?.nativeElement;
      if (el) el.scrollLeft = el.scrollWidth / 3;
    }, 800);
  }

  catalog     = signal<PublicCatalog | null>(null);
  allProducts = signal<PublicProduct[]>([]);
  loading     = signal(true);

  searchQuery      = this.searchSvc.query;
  selectedFamilyId = signal<string | null>(null);
  sortKey          = signal<SortKey>('top_sellers');
  viewMode         = signal<ViewMode>('grid');
  onlyInStock      = signal(false);

  // ─── Mini carrusel en tarjetas de grid ────────────────────────────────────
  readonly cardImageIdx = signal<Record<string, number>>({});

  // ─── Mobile Sidebar State ────────────────────────────────────────────────
  isSidebarOpen = signal(false);

  families = computed<Family[]>(() => {
    const map = new Map<string, number>();
    for (const p of this.allProducts()) {
      if (p.familyId && p.familyName)
        map.set(p.familyId, (map.get(p.familyId) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => {
        const name = this.allProducts().find(p => p.familyId === id)?.familyName ?? id;
        return { id, name, count };
      })
      .sort((a, b) => b.count - a.count); // Ordenar por popularidad descendente
  });

  selectedFamilyName = computed<string>(() => {
    const id = this.selectedFamilyId();
    return this.families().find(f => f.id === id)?.name ?? '';
  });

  filteredProducts = computed<PublicProduct[]>(() => {
    const qRaw     = this.searchQuery();
    const familyId = this.selectedFamilyId();
    const cat      = this.catalog();
    const stockOnly = this.onlyInStock();
    const sort     = this.sortKey();

    // Normalizar búsqueda: quitar acentos y pasar a minúsculas
    const normalize = (s: string) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const q = normalize(qRaw).trim();
    const qTerms = q.split(/\s+/).filter(t => t.length > 0);

    let list = this.allProducts().filter(p => {
      if (cat && !cat.showOutOfStock && p.stockAvailable === 0 && !p.noStock) return false;
      if (stockOnly && p.stockAvailable === 0 && !p.noStock) return false;
      if (familyId && p.familyId !== familyId) return false;

      if (qTerms.length > 0) {
        const nameNorm = normalize(p.name);
        const notesNorm = normalize(p.notes ?? '');
        // El producto debe coincidir con TODOS los términos buscados
        return qTerms.every(term => nameNorm.includes(term) || notesNorm.includes(term));
      }

      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === 'top_sellers') {
        const counts = this.likesCounts();
        return (counts[b.id] ?? 0) - (counts[a.id] ?? 0);
      }
      if (sort === 'recent')     return b.id.localeCompare(a.id); // Asumiendo que ObjectIds más recientes son mayores lexicográficamente
      if (sort === 'price_asc')  return a.salePrice - b.salePrice;
      if (sort === 'price_desc') return b.salePrice - a.salePrice;
      return 0;
    });
    return list;
  });

  // ─── Top Products (Sidebar) ──────────────────────────────────────────────
  topProducts = computed<PublicProduct[]>(() => {
    const products = [...this.allProducts()];
    const counts = this.likesCounts();
    return products
      .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
      .slice(0, 5); // Tomamos los 5 más "populares"
  });

  topProductIds = computed<Set<string>>(() => {
    return new Set(this.topProducts().map(p => p.id));
  });

  ngOnInit(): void {
    this.catalogSlug = this.route.parent?.snapshot.paramMap.get('slug') ?? '';
    const slug = this.catalogSlug;
    this.subs.add(this.catalogSvc.getCatalogBySlug(slug).subscribe({
      next: data => this.catalog.set(data),
      error: err => console.error('[CatalogList] catalog error:', err)
    }));
    this.subs.add(this.catalogSvc.getPublicProducts(slug).subscribe({
      next: products => {
        this.allProducts.set(products);
        this.loadLikes(products);
        this.loading.set(false);
      },
      error: err => { console.error('[CatalogList] products error:', err); this.loading.set(false); }
    }));
  }

  // ─── Likes logic ─────────────────────────────────────────────────────────

  likedProducts = signal<Set<string>>(new Set());
  likesCounts   = signal<Record<string, number>>({});

  private catalogSlug = '';

  private loadLikes(products: PublicProduct[]) {
    // Restaurar likes propios desde localStorage
    try {
      const saved = localStorage.getItem('fs_catalog_likes');
      if (saved) this.likedProducts.set(new Set(JSON.parse(saved)));
    } catch {}

    // Suscribir al stream real de contadores desde Firestore
    this.subs.add(
      this.catalogSvc.getLikesForCatalog(this.catalogSlug).subscribe({
        next: counts => this.likesCounts.set(counts),
        error: err  => console.error('[CatalogList] likes error:', err)
      })
    );
  }

  toggleLike(e: Event, productId: string): void {
    e.stopPropagation();

    const currentLiked = new Set(this.likedProducts());
    const isLiked = currentLiked.has(productId);
    const delta: 1 | -1 = isLiked ? -1 : 1;

    // Actualizar estado local inmediatamente (optimistic UI)
    if (isLiked) {
      currentLiked.delete(productId);
    } else {
      currentLiked.add(productId);
    }
    this.likedProducts.set(currentLiked);

    try {
      localStorage.setItem('fs_catalog_likes', JSON.stringify(Array.from(currentLiked)));
    } catch {}

    // Persistir en Firestore
    this.catalogSvc.toggleProductLike(this.catalogSlug, productId, delta)
      .catch(err => console.error('[CatalogList] toggleLike error:', err));
  }

  // ─── Add to cart ─────────────────────────────────────────────────────────

  addedFeedback = signal<string | null>(null);

  addToCart(e: Event, product: PublicProduct): void {
    e.stopPropagation();
    if (product.stockAvailable === 0 && !product.noStock) return;
    this.cartSvc.addItem(product, this.catalogSlug);
    this.addedFeedback.set(product.id);
    setTimeout(() => this.addedFeedback.set(null), 1500);
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  openProduct(id: string): void {
    this.isSidebarOpen.set(false);
    this.router.navigate(['p', id], { relativeTo: this.route });
  }

  selectFamily(id: string | null): void {
    this.selectedFamilyId.set(id);
    this.isSidebarOpen.set(false); // Cierra sidebar en móvil al seleccionar
  }

  // ─── Scroll horizontal de la barra de categorías ─────────────────────────

  scrollCatBar(direction: -1 | 1): void {
    const el = this.catBarScrollRef?.nativeElement;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const third = scrollWidth / 3;
    const amount = 280;

    // Lógica de bucle infinito con 3 tandas:
    // Si al movernos saldríamos de la tanda central (segundo tercio),
    // reseteamos la posición al equivalente en el centro instantáneamente.

    if (direction === 1 && (scrollLeft + amount) >= (third * 2)) {
      el.scrollLeft = scrollLeft - third;
    } else if (direction === -1 && (scrollLeft - amount) <= 0) {
      el.scrollLeft = scrollLeft + third;
    }

    el.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedFamilyId.set(null);
    this.onlyInStock.set(false);
    this.isSidebarOpen.set(false);
  }

  // ─── Mini carrusel helpers ─────────────────────────────────────────────────

  getCardImages(p: PublicProduct): string[] {
    if (p.imageUrls?.length) return p.imageUrls.filter(Boolean) as string[];
    if (p.imageUrl) return [p.imageUrl];
    return [];
  }

  getCardIdx(productId: string): number {
    return this.cardImageIdx()[productId] ?? 0;
  }

  nextCardImage(e: Event, p: PublicProduct): void {
    e.stopPropagation();
    const images = this.getCardImages(p);
    if (images.length < 2) return;
    this.cardImageIdx.update(map => ({
      ...map,
      [p.id]: ((map[p.id] ?? 0) + 1) % images.length
    }));
  }

  prevCardImage(e: Event, p: PublicProduct): void {
    e.stopPropagation();
    const images = this.getCardImages(p);
    if (images.length < 2) return;
    this.cardImageIdx.update(map => ({
      ...map,
      [p.id]: ((map[p.id] ?? 0) - 1 + images.length) % images.length
    }));
  }
}
