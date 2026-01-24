import { Injectable, signal, computed } from '@angular/core';
import { INavData } from '@coreui/angular';
import { UserModule } from '../interfaces/user.interface';

/**
 * Navigation Service
 * Converts user modules (from login) to INavData for CoreUI sidebar
 * Modules are loaded from user data after login, not from a separate API call
 */
@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  // User modules from login response
  private userModules = signal<UserModule[]>([]);

  // Computed nav items (automatically updates when modules change)
  readonly navItems = computed(() => this.convertModulesToNavData(this.userModules()));

  /**
   * Set modules from user login response
   * Called by AuthService after successful login
   */
  setModulesFromUser(modules: UserModule[]): void {
    // Filter only modules that should be shown in menu and sort by order
    const menuModules = modules
      .filter(m => m.showInMenu)
      .sort((a, b) => a.order - b.order);

    console.log('Navigation modules loaded:', menuModules);
    this.userModules.set(menuModules);
  }

  /**
   * Clear navigation (called on logout)
   */
  clearNavigation(): void {
    this.userModules.set([]);
  }

  /**
   * Get current modules
   */
  getModules(): UserModule[] {
    return this.userModules();
  }

  /**
   * Check if navigation is loaded
   */
  isLoaded(): boolean {
    return this.userModules().length > 0;
  }

  /**
   * Convert UserModule[] to INavData[]
   */
  private convertModulesToNavData(modules: UserModule[]): INavData[] {
    return modules.map(module => this.moduleToNavItem(module));
  }

  /**
   * Convert single UserModule to INavData
   */
  private moduleToNavItem(module: UserModule): INavData {
    const navItem: INavData = {
      name: module.name
    };

    // Title/separator
    if (module.isTitle) {
      navItem.title = true;
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

    // Children (recursive)
    if (module.children && module.children.length > 0) {
      const activeChildren = module.children.filter(c => c.showInMenu);
      if (activeChildren.length > 0) {
        navItem.children = activeChildren
          .sort((a, b) => a.order - b.order)
          .map(child => this.moduleToNavItem(child));
      }
    }

    return navItem;
  }
}
