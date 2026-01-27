import { INavData } from '@coreui/angular';

export const navItems: INavData[] = [
  // GPS Tracking Section
  {
    title: true,
    name: 'GPS Tracking'
  },
  {
    name: 'Monitor GPS',
    url: '/monitor',
    iconComponent: { name: 'cil-location-pin' },
    badge: {
      color: 'success',
      text: 'LIVE'
    },
    attributes: { permission: 'monitor.view' }
  },
  {
    name: 'Dispositivos',
    url: '/devices',
    iconComponent: { name: 'cil-mobile' },
    attributes: { permission: 'devices.view' }
  },
  {
    name: 'Geocercas',
    url: '/geofences',
    iconComponent: { name: 'cil-map' },
    attributes: { permission: 'geofences.view' }
  },
  {
    name: 'Alertas',
    url: '/alerts',
    iconComponent: { name: 'cil-bell' },
    attributes: { permission: 'alerts.view' }
  },
  {
    name: 'Historial de Rutas',
    url: '/routes',
    iconComponent: { name: 'cil-compass' },
    attributes: { permission: 'routes.view' }
  },
  // Administration Section
  {
    title: true,
    name: 'Administración'
  },
  {
    name: 'Usuarios',
    url: '/users',
    iconComponent: { name: 'cil-people' },
    attributes: { permission: 'users.view' }
  },
  {
    name: 'Perfiles y Roles',
    url: '/profiles',
    iconComponent: { name: 'cil-badge' },
    attributes: { permission: 'profiles.view' }
  },
  {
    name: 'Gestión de Permisos',
    url: '/permissions',
    iconComponent: { name: 'cil-lock-locked' }, // using a lock icon
    attributes: { permission: 'permissions.view' }
  },
  {
    name: 'Organizaciones',
    url: '/organizations',
    iconComponent: { name: 'cil-building' },
    attributes: { permission: 'organizations.view' }
  },
  {
    name: 'Planes',
    url: '/plans',
    iconComponent: { name: 'cil-layers' },
    attributes: { permission: 'plans.view' }
  },
  // System Section (for super admins)
  {
    title: true,
    name: 'Sistema',
    attributes: { permission: 'settings.view' }
  },
  {
    name: 'Configuración',
    url: '/settings',
    iconComponent: { name: 'cil-settings' },
    attributes: { permission: 'settings.view' }
  },
  // Demo Section (can be removed later)
  {
    title: true,
    name: 'Demo CoreUI'
  },
  {
    name: 'Dashboard',
    url: '/dashboard',
    iconComponent: { name: 'cil-speedometer' }
  },
  {
    name: 'Componentes',
    url: '/base',
    iconComponent: { name: 'cil-puzzle' },
    children: [
      {
        name: 'Cards',
        url: '/base/cards',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Tables',
        url: '/base/tables',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Forms',
        url: '/forms/validation',
        icon: 'nav-icon-bullet'
      }
    ]
  }
];

/**
 * Helper function to filter nav items by permissions
 * Use this in the sidebar component
 */
export function filterNavByPermissions(
  items: INavData[],
  hasPermission: (permission: string) => boolean
): INavData[] {
  return items.filter(item => {
    // Check if item requires permission
    const requiredPermission = item.attributes?.['permission'];
    if (requiredPermission && !hasPermission(requiredPermission)) {
      return false;
    }

    // Filter children recursively
    if (item.children) {
      item.children = filterNavByPermissions(item.children, hasPermission);
      // Hide parent if all children are hidden
      if (item.children.length === 0) {
        return false;
      }
    }

    return true;
  });
}
