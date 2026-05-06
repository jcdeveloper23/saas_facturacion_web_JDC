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

interface CategoryLeaf { id: string; name: string; count: number; }
interface CategoryNode extends CategoryLeaf { children: CategoryLeaf[]; }

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

  // ─── Expand/collapse de categorías padre en el sidebar ───────────────────
  expandedNodeIds = signal<Set<string>>(new Set());

  // Árbol jerárquico de categorías usando catalog.familyTree para resolver jerarquías
  categoryTree = computed<CategoryNode[]>(() => {
    const familyTree = this.catalog()?.familyTree ?? {};
    const nodes = new Map<string, CategoryNode>();

    for (const p of this.allProducts()) {
      if (!p.familyId || !p.familyName) continue;

      const parentInfo = familyTree[p.familyId];

      if (parentInfo) {
        // Producto en subfamilia — agrupar bajo el padre
        if (!nodes.has(parentInfo.parentId)) {
          nodes.set(parentInfo.parentId, { id: parentInfo.parentId, name: parentInfo.parentName, count: 0, children: [] });
        }
        const parent = nodes.get(parentInfo.parentId)!;
        parent.count++;
        let child = parent.children.find(c => c.id === p.familyId);
        if (!child) {
          child = { id: p.familyId, name: p.familyName, count: 0 };
          parent.children.push(child);
        }
        child.count++;
      } else {
        // Familia raíz (sin padre en el árbol)
        if (!nodes.has(p.familyId)) {
          nodes.set(p.familyId, { id: p.familyId, name: p.familyName, count: 0, children: [] });
        }
        nodes.get(p.familyId)!.count++;
      }
    }

    // Ordenar hijos por popularidad dentro de cada padre
    const result = Array.from(nodes.values());
    for (const node of result) {
      node.children.sort((a, b) => b.count - a.count);
    }
    return result.sort((a, b) => b.count - a.count);
  });

  // IDs de familias que actúan como padre (tienen subfamilias)
  parentFamilyIds = computed<Set<string>>(() =>
    new Set(this.categoryTree().filter(n => n.children.length > 0).map(n => n.id))
  );

  // Lista plana para la barra de pills: padres primero, luego sus hijos
  flatCategories = computed<CategoryLeaf[]>(() =>
    this.categoryTree().flatMap(node => [
      { id: node.id, name: node.name, count: node.count },
      ...node.children
    ])
  );

  selectedFamilyName = computed<string>(() => {
    const id = this.selectedFamilyId();
    if (!id) return '';
    for (const node of this.categoryTree()) {
      if (node.id === id) return node.name;
      const child = node.children.find(c => c.id === id);
      if (child) return child.name;
    }
    return '';
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
      if (familyId) {
        if (this.parentFamilyIds().has(familyId)) {
          // Padre seleccionado: incluir productos de hijos (cuyo padre = familyId) + directos
          const familyTree = this.catalog()?.familyTree ?? {};
          const productParentId = p.familyId ? (familyTree[p.familyId]?.parentId ?? null) : null;
          if (productParentId !== familyId && p.familyId !== familyId) return false;
        } else {
          // Subfamilia seleccionada: solo coincidencia exacta
          if (p.familyId !== familyId) return false;
        }
      }

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
    this.flyToCart(e.currentTarget as HTMLElement, product);
    setTimeout(() => this.addedFeedback.set(null), 1500);
  }

  private flyToCart(triggerEl: HTMLElement, product: PublicProduct): void {
    const cartBtn = document.querySelector('.cs-cart-btn') as HTMLElement | null;
    if (!cartBtn) return;

    const card  = triggerEl.closest('.cl-card, .cl-list-item') as HTMLElement | null;
    const imgEl = card?.querySelector('.cl-card__img, .cl-list-item__img') as HTMLElement | null;
    const src   = (imgEl ?? card ?? triggerEl).getBoundingClientRect();
    const dst   = cartBtn.getBoundingClientRect();

    const size = 68;
    const sx = src.left + src.width  / 2 - size / 2;
    const sy = src.top  + src.height / 2 - size / 2;
    const ex = dst.left + dst.width  / 2 - size / 2;
    const ey = dst.top  + dst.height / 2 - size / 2;
    const dx = ex - sx;
    const dy = ey - sy;

    const images = this.getCardImages(product);
    const duration = 820;

    // Técnica dos divs: X e Y con easings distintos → arco parabólico natural
    // sin cálculo de punto de control (evita que el arco se salga de pantalla)
    const outer = document.createElement('div');
    Object.assign(outer.style, {
      position:      'fixed',
      zIndex:        '9999',
      left:          `${sx}px`,
      top:           `${sy}px`,
      width:         `${size}px`,
      height:        `${size}px`,
      pointerEvents: 'none',
      willChange:    'transform',
    });

    const inner = document.createElement('div');
    Object.assign(inner.style, {
      width:          '100%',
      height:         '100%',
      borderRadius:   '50%',
      overflow:       'hidden',
      boxShadow:      '0 6px 24px rgba(0,0,0,.45)',
      border:         '3px solid #fff',
      willChange:     'transform,opacity',
      background:     images[0]
        ? `url(${images[0]}) center/cover no-repeat`
        : 'var(--catalog-primary, #e47911)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    });

    if (!images[0]) {
      inner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="28" height="28">
        <path d="M1 1.75A.75.75 0 0 1 1.75 1h1.628a1.75 1.75 0 0 1 1.734 1.51L5.18 3a65.25 65.25 0 0 1 13.36 1.412.75.75 0 0 1 .58.875 48.645 48.645 0 0 1-1.618 6.2.75.75 0 0 1-.712.513H6a2.503 2.503 0 0 0-2.292 1.5H17.25a.75.75 0 0 1 0 1.5H2.76a.75.75 0 0 1-.748-.807 4.002 4.002 0 0 1 2.716-3.486L3.626 4.234a.25.25 0 0 0-.248-.234H1.75A.75.75 0 0 1 1 1.75zM6 17.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9.5 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>
      </svg>`;
    }

    outer.appendChild(inner);
    document.body.appendChild(outer);

    // X: ease-in-out — movimiento horizontal suave y balanceado
    outer.animate(
      [
        { transform: 'translateX(0)' },
        { transform: `translateX(${dx}px)` },
      ],
      { duration, easing: 'cubic-bezier(0.42, 0, 0.58, 1)', fill: 'forwards' }
    );

    // Y: ease-out — sale rápido hacia arriba y desacelera al llegar
    // El contraste entre ease-in-out(X) y ease-out(Y) crea el arco parabólico
    inner.animate(
      [
        { transform: 'translateY(0) scale(1)',           opacity: '1'   },
        { transform: `translateY(${dy}px) scale(0.38)`,  opacity: '0.65' },
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

    // ── Ring flash ────────────────────────────────────────────
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

    // ── Glow dorado ───────────────────────────────────────────
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

    // ── Partículas ────────────────────────────────────────────
    const COUNT = 16;
    for (let i = 0; i < COUNT; i++) {
      const angle   = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const dist    = 40 + Math.random() * 30;
      const size    = 5 + Math.random() * 6;
      const color   = colors[i % colors.length];
      const kind    = i % 4; // 0=círculo, 1=cuadrado, 2=estrella, 3=círculo

      const p = document.createElement('div');

      if (kind === 2) {
        // Estrella unicode
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
      const rot = kind === 1
        ? 'rotate(225deg)'
        : kind === 2
          ? `rotate(${Math.random() > 0.5 ? 360 : -360}deg)`
          : '';
      const delay = Math.random() * 55;

      p.animate(
        [
          { transform: `translate(0,0) scale(1) ${kind === 1 ? 'rotate(45deg)' : ''}`, opacity: '1'  },
          { transform: `translate(${tx}px,${ty}px) scale(0) ${rot}`,                   opacity: '0' },
        ],
        { duration: 480 + Math.random() * 160, easing: 'cubic-bezier(0,0,0.2,1)', fill: 'forwards', delay }
      ).finished.then(() => p.remove());
    }
  }

  // ─── Stagger delay helper ─────────────────────────────────────────────────

  staggerDelay(index: number): string {
    return `${Math.min(index * 45, 360)}ms`;
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

  isChildSelected(node: CategoryNode): boolean {
    const selected = this.selectedFamilyId();
    return selected !== null && node.children.some(c => c.id === selected);
  }

  /** Un nodo está expandido si fue abierto manualmente O si tiene un hijo activo */
  isNodeExpanded(nodeId: string): boolean {
    if (this.expandedNodeIds().has(nodeId)) return true;
    const selected = this.selectedFamilyId();
    if (!selected) return false;
    return this.categoryTree().find(n => n.id === nodeId)?.children.some(c => c.id === selected) ?? false;
  }

  /** Click en un padre: expande/colapsa y selecciona/deselecciona */
  toggleParent(node: CategoryNode): void {
    const isOpen = this.isNodeExpanded(node.id);
    this.expandedNodeIds.update(set => {
      const next = new Set(set);
      if (isOpen) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
    // Al abrir → filtra por este padre; al cerrar → vuelve a Todos
    this.selectedFamilyId.set(isOpen ? null : node.id);
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
