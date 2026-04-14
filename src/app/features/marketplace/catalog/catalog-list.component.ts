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

type SortKey = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';
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
  private subs       = new Subscription();

  catalog     = signal<PublicCatalog | null>(null);
  allProducts = signal<PublicProduct[]>([]);
  loading     = signal(true);

  searchQuery      = signal('');
  selectedFamilyId = signal<string | null>(null);
  sortKey          = signal<SortKey>('name_asc');
  viewMode         = signal<ViewMode>('grid');
  onlyInStock      = signal(false);

  // ─── Mini carrusel en tarjetas de grid ────────────────────────────────────
  readonly cardImageIdx = signal<Record<string, number>>({});

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
      .sort((a, b) => a.name.localeCompare(b.name));
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
      if (sort === 'name_asc')   return a.name.localeCompare(b.name);
      if (sort === 'name_desc')  return b.name.localeCompare(a.name);
      if (sort === 'price_asc')  return a.salePrice - b.salePrice;
      if (sort === 'price_desc') return b.salePrice - a.salePrice;
      return 0;
    });
    return list;
  });

  ngOnInit(): void {
    const slug = this.route.parent?.snapshot.paramMap.get('slug') ?? '';
    this.subs.add(this.catalogSvc.getCatalogBySlug(slug).subscribe({
      next: data => this.catalog.set(data),
      error: err => console.error('[CatalogList] catalog error:', err)
    }));
    this.subs.add(this.catalogSvc.getPublicProducts(slug).subscribe({
      next: products => { this.allProducts.set(products); this.loading.set(false); },
      error: err => { console.error('[CatalogList] products error:', err); this.loading.set(false); }
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  openProduct(id: string): void {
    this.router.navigate(['p', id], { relativeTo: this.route });
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedFamilyId.set(null);
    this.onlyInStock.set(false);
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
