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
    }
  },
  {
    name: 'Dispositivos',
    url: '/devices',
    iconComponent: { name: 'cil-mobile' }
  },
  {
    name: 'Geocercas',
    url: '/geofences',
    iconComponent: { name: 'cil-map' }
  },
  {
    name: 'Alertas',
    url: '/alerts',
    iconComponent: { name: 'cil-bell' }
  },
  {
    name: 'Historial de Rutas',
    url: '/routes',
    iconComponent: { name: 'cil-compass' }
  },
  // Administration Section
  {
    title: true,
    name: 'Administración'
  },
  {
    name: 'Usuarios',
    url: '/users',
    iconComponent: { name: 'cil-people' }
  },
  {
    name: 'Organizaciones',
    url: '/organizations',
    iconComponent: { name: 'cil-building' }
  },
  // CoreUI Demo Section (can be removed later)
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
    name: 'Theme',
    url: '/theme',
    iconComponent: { name: 'cil-drop' },
    children: [
      {
        name: 'Colors',
        url: '/theme/colors',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Typography',
        url: '/theme/typography',
        icon: 'nav-icon-bullet'
      }
    ]
  },
  {
    name: 'Components',
    url: '/base',
    iconComponent: { name: 'cil-puzzle' },
    children: [
      {
        name: 'Accordion',
        url: '/base/accordion',
        icon: 'nav-icon-bullet'
      },
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
        name: 'Tabs',
        url: '/base/tabs',
        icon: 'nav-icon-bullet'
      }
    ]
  },
  {
    name: 'Forms',
    url: '/forms',
    iconComponent: { name: 'cil-notes' },
    children: [
      {
        name: 'Form Control',
        url: '/forms/form-control',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Validation',
        url: '/forms/validation',
        icon: 'nav-icon-bullet'
      }
    ]
  },
  {
    name: 'Charts',
    iconComponent: { name: 'cil-chart-pie' },
    url: '/charts'
  },
  {
    name: 'Notifications',
    url: '/notifications',
    iconComponent: { name: 'cil-bell' },
    children: [
      {
        name: 'Alerts',
        url: '/notifications/alerts',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Modal',
        url: '/notifications/modal',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Toast',
        url: '/notifications/toasts',
        icon: 'nav-icon-bullet'
      }
    ]
  }
];
