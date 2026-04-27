import {
  Component, OnInit, OnDestroy,
  inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicCatalog } from '../models/catalog.interface';
import { CatalogSearchService } from '../services/catalog-search.service';
import { CartService } from '../services/cart.service';
import { CartDrawerComponent } from './cart-drawer.component';

@Component({
  selector: 'app-catalog-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, CartDrawerComponent],
  templateUrl: './catalog-shell.component.html',
  styleUrl: './catalog-shell.component.scss',
})
export class CatalogShellComponent implements OnInit, OnDestroy {
  private route      = inject(ActivatedRoute);
  private catalogSvc = inject(PublicCatalogService);
  private searchSvc  = inject(CatalogSearchService);
  protected cart     = inject(CartService);
  private subs       = new Subscription();

  catalog       = signal<PublicCatalog | null>(null);
  loading       = signal(true);
  cartOpen      = signal(false);

  headerSearch  = this.searchSvc.query;

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.subs.add(
      this.catalogSvc.getCatalogBySlug(slug).subscribe({
        next: data => {
          this.catalog.set(data);
          this.loading.set(false);
          if (data?.primaryColor) {
            document.documentElement.style.setProperty('--catalog-primary', data.primaryColor);
          }
        },
        error: () => this.loading.set(false)
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    document.documentElement.style.removeProperty('--catalog-primary');
  }

  openHelp(): void {
    alert('Centro de ayuda en construcción.');
  }

  openCart(): void {
    this.cartOpen.set(true);
  }
}
