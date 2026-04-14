import {
  Component, OnInit, OnDestroy,
  inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicCatalog } from '../models/catalog.interface';

@Component({
  selector: 'app-catalog-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './catalog-shell.component.html',
  styleUrl: './catalog-shell.component.scss',
})
export class CatalogShellComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private catalogSvc = inject(PublicCatalogService);
  private subs = new Subscription();

  catalog = signal<PublicCatalog | null>(null);
  loading = signal(true);

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
}
