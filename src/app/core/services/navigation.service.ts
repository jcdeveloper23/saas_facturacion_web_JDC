import { Injectable, inject, signal, computed } from '@angular/core';
import { INavData } from '@coreui/angular';
import { ModulesService } from './modules.service';
import { PermissionsService } from './permissions.service';
import { Module } from '../interfaces/permission.interface';

/**
 * Navigation Service
 * Converts modules from DB to INavData for CoreUI sidebar
 * Handles permission-based menu filtering
 */
@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private modulesService = inject(ModulesService);
  private permissionsService = inject(PermissionsService);

  // Loaded modules from DB
  private modulesLoaded = signal<Module[]>([]);
  private isLoading = signal(false);

  // Computed nav items
  readonly navItems = computed(() => this.convertModulesToNavData(this.modulesLoaded()));
  readonly filteredNavItems = computed(() => this.filterByPermissions(this.navItems()));

  /**
   * Load modules from backend and convert to navigation
   */
  loadNavigation(): void {
    if (this.isLoading()) return;

    this.isLoading.set(true);
    this.modulesService.getModules(true).subscribe({
      next: (modules) => {
        // Filter only modules that should be shown in menu
        const menuModules = modules.filter(m => m.showInMenu);
        this.modulesLoaded.set(menuModules);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading navigation:', err);
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Convert Module[] to INavData[]
   */
  private convertModulesToNavData(modules: Module[]): INavData[] {
    return modules.map(module => this.moduleToNavItem(module));
  }

  /**
   * Convert single Module to INavData
   */
  private moduleToNavItem(module: Module): INavData {
    const navItem: INavData = {
      name: module.name
    };

    // Title/separator
    if (module.isTitle) {
      navItem.title = true;
      // Titles can also have permission requirement
      if (module.code && module.code !== 'title') {
        navItem.attributes = { permission: `${module.code}.view` };
      }
      return navItem;
    }

    // URL
    if (module.url) {
      navItem.url = module.url;
    }

    // Icon
    if (module.icon) {
      navItem.iconComponent = { name: module.icon };
    }

    // Badge
    if (module.badgeText) {
      navItem.badge = {
        color: module.badgeColor || 'info',
        text: module.badgeText
      };
    }

    // Permission attribute (uses module.code + '.view' as default permission)
    if (module.code) {
      navItem.attributes = { permission: `${module.code}.view` };
    }

    // Children (recursive)
    if (module.children && module.children.length > 0) {
      const activeChildren = module.children.filter(c => c.state && c.showInMenu);
      if (activeChildren.length > 0) {
        navItem.children = activeChildren.map(child => this.moduleToNavItem(child));
      }
    }

    return navItem;
  }

  /**
   * Filter nav items by user permissions
   */
  private filterByPermissions(items: INavData[]): INavData[] {
    return items.filter(item => {
      // Check if item requires permission
      const requiredPermission = item.attributes?.['permission'];
      if (requiredPermission && !this.permissionsService.hasPermission(requiredPermission)) {
        return false;
      }

      // Filter children recursively
      if (item.children && item.children.length > 0) {
        item.children = this.filterByPermissions(item.children);
        // Hide parent if all children are hidden
        if (item.children.length === 0 && !item.title) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get nav items (loads if not loaded)
   */
  getNavItems(): INavData[] {
    if (this.modulesLoaded().length === 0 && !this.isLoading()) {
      this.loadNavigation();
    }
    return this.filteredNavItems();
  }

  /**
   * Refresh navigation (e.g., after module changes)
   */
  refreshNavigation(): void {
    this.modulesLoaded.set([]);
    this.loadNavigation();
  }
}
