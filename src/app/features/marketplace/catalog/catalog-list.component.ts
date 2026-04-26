import {
  Component, OnInit, OnDestroy,
  inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicCatalog, PublicProduct } from '../models/catalog.interface';
import { CatalogSearchService } from '../services/catalog-search.service';

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
export class CatalogListComponent implements OnInit, OnDestroy {
  private route      = inject(ActivatedRoute);
  private router     = inject(Router);
  private catalogSvc = inject(PublicCatalogService);
  private searchSvc  = inject(CatalogSearchService);
  private subs       = new Subscription();

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
    const q        = this.searchQuery().toLowerCase().trim();
    const familyId = this.selectedFamilyId();
    const cat      = this.catalog();
    const stockOnly = this.onlyInStock();
    const sort     = this.sortKey();

    let list = this.allProducts().filter(p => {
      if (cat && !cat.showOutOfStock && p.stockAvailable === 0 && !p.noStock) return false;
      if (stockOnly && p.stockAvailable === 0 && !p.noStock) return false;
      if (familyId && p.familyId !== familyId) return false;
      if (q && !p.name.toLowerCase().includes(q) &&
          !(p.notes ?? '').toLowerCase().includes(q)) return false;
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
    const slug = this.route.parent?.snapshot.paramMap.get('slug') ?? '';
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

  private loadLikes(products: PublicProduct[]) {
    // Restaurar likes propios
    try {
      const saved = localStorage.getItem('fs_catalog_likes');
      if (saved) {
        this.likedProducts.set(new Set(JSON.parse(saved)));
      }
    } catch {}

    // Generar contadores pseudoaleatorios estables para cada producto
    const counts: Record<string, number> = {};
    for (const p of products) {
      const charCodeSum = (p.id.charCodeAt(0) || 0) + (p.id.charCodeAt(p.id.length - 1) || 0);
      const base = charCodeSum % 35; // numero maximo de likes falsos 34
      const myLike = this.likedProducts().has(p.id) ? 1 : 0;
      counts[p.id] = base + myLike;
    }
    this.likesCounts.set(counts);
  }

  toggleLike(e: Event, productId: string): void {
    e.stopPropagation();
    
    const currentLiked = new Set(this.likedProducts());
    const isLiked = currentLiked.has(productId);
    
    if (isLiked) {
      currentLiked.delete(productId);
    } else {
      currentLiked.add(productId);
    }
    this.likedProducts.set(currentLiked);
    
    try {
      localStorage.setItem('fs_catalog_likes', JSON.stringify(Array.from(currentLiked)));
    } catch {}
    
    this.likesCounts.update(counts => ({
      ...counts,
      [productId]: Math.max(0, (counts[productId] || 0) + (isLiked ? -1 : 1))
    }));
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
