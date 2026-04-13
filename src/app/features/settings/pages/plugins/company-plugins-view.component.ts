import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { take } from 'rxjs/operators';

import { TenantService } from '../../../../core/services/tenant.service';
import { PluginPackagesService } from '../../../../core/services/plugin-packages.service';
import { PluginPackage } from '../../../../core/interfaces/permission.interface';

@Component({
  selector: 'app-company-plugins-view',
  standalone: true,
  imports: [
    CommonModule,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, AlertModule, IconModule
  ],
  templateUrl: './company-plugins-view.component.html'
})
export class CompanyPluginsViewComponent implements OnInit {
  private tenantService   = inject(TenantService);
  private packagesService = inject(PluginPackagesService);

  allPackages = signal<PluginPackage[]>([]);
  isLoading   = signal(true);

  activePackageCodes = computed(() => this.tenantService.activePackages());

  activePackages = computed(() =>
    this.allPackages().filter(p => this.activePackageCodes().includes(p.code))
  );

  availablePackages = computed(() =>
    this.allPackages().filter(p =>
      !this.activePackageCodes().includes(p.code) && p.state && !p.isSystem
    )
  );

  ngOnInit(): void {
    this.packagesService.getPackages(true).pipe(take(1)).subscribe({
      next: pkgs => {
        this.allPackages.set(pkgs);
        this.isLoading.set(false);
      },
      error: err => {
        console.error('[CompanyPluginsView] Error:', err);
        this.isLoading.set(false);
      }
    });
  }
}
