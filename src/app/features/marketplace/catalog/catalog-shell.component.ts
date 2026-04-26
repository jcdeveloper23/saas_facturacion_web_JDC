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

@Component({
  selector: 'app-catalog-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet],
  templateUrl: './catalog-shell.component.html',
  styleUrl: './catalog-shell.component.scss',
})
export class CatalogShellComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private catalogSvc = inject(PublicCatalogService);
  private searchSvc = inject(CatalogSearchService);
  private subs = new Subscription();

  catalog = signal<PublicCatalog | null>(null);
  loading = signal(true);
  
  // Usamos el signal de búsqueda centralizado
  headerSearch = this.searchSvc.query;

  // Estado temporal del carrito para UI Demo
  cartItemCount = signal(3);

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
    alert('Abriendo carrito de compras...');
  }
}
