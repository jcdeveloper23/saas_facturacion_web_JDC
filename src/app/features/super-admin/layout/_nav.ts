import { INavData } from '@coreui/angular';

export const superAdminNavItems: INavData[] = [

  // ─── Gestión ──────────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Gestión'
  },
  {
    name: 'Empresas',
    url: '/super-admin/companies',
    iconComponent: { name: 'cil-building' }
  },
  // Solo super admin: el layout lo oculta al channel_admin
  {
    name: 'Canales',
    url: '/super-admin/channels',
    iconComponent: { name: 'cil-sitemap' }
  },
  {
    name: 'Planes',
    url: '/super-admin/plans',
    iconComponent: { name: 'cil-credit-card' }
  },
  {
    name: 'Guía Comercial',
    url: '/super-admin/plans/guide',
    iconComponent: { name: 'cil-book' }
  },
  {
    name: 'Módulos',
    url: '/super-admin/catalog',
    iconComponent: { name: 'cil-puzzle' }
  },
  {
    name: 'Paquetes de Plugins',
    url: '/super-admin/plugin-packages',
    iconComponent: { name: 'cil-layers' }
  },

  // ─── Usuarios y Acceso ────────────────────────────────────────────────────
  {
    title: true,
    name: 'Acceso'
  },
  {
    name: 'Perfiles y Roles',
    url: '/super-admin/profiles',
    iconComponent: { name: 'cil-lock-locked' }
  },

  // ─── Configuración de Plataforma ──────────────────────────────────────────
  {
    title: true,
    name: 'Plataforma'
  },
  {
    name: 'Datos Plataforma',
    url: '/super-admin/__datos-plataforma',
    iconComponent: { name: 'cil-settings' },
    children: [
      { name: 'Config General',       url: '/super-admin/defaults'                 },
      { name: 'Divisas',              url: '/super-admin/defaults/currencies'      },
      { name: 'Países',               url: '/super-admin/defaults/countries'       },
      { name: 'Impuestos',            url: '/super-admin/defaults/tax-rates'       },
      { name: 'Métodos de Pago',      url: '/super-admin/defaults/payment-methods' },
      { name: 'Series de Documentos', url: '/super-admin/defaults/document-series' },
      { name: 'Bodegas',              url: '/super-admin/defaults/warehouses'      }
    ]
  },
  {
    name: 'Fact. Electrónica',
    url: '/super-admin/__fact-electronica',
    iconComponent: { name: 'cil-description' },
    children: [
      { name: 'Config SRI',  url: '/super-admin/defaults/sri-config'  },
      { name: 'Config SMTP', url: '/super-admin/defaults/smtp-config' }
    ]
  }
];
