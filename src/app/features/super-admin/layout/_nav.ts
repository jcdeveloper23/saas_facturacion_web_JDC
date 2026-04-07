import { INavData } from '@coreui/angular';

export const superAdminNavItems: INavData[] = [
  {
    title: true,
    name: 'Gestión'
  },
  {
    name: 'Empresas',
    url: '/super-admin/companies',
    iconComponent: { name: 'cil-building' }
  },
  {
    name: 'Planes',
    url: '/super-admin/plans',
    iconComponent: { name: 'cil-credit-card' }
  },
  {
    name: 'Catálogo de Plugins',
    url: '/super-admin/catalog',
    iconComponent: { name: 'cil-puzzle' }
  },
  {
    title: true,
    name: 'Datos por Defecto'
  },
  // {
  //   name: 'Config General',
  //   url: '/super-admin/defaults',
  //   iconComponent: { name: 'cil-settings' }
  // },
  {
    name: 'Divisas',
    url: '/super-admin/defaults/currencies',
    iconComponent: { name: 'cil-settings' }
  },
  {
    name: 'Países',
    url: '/super-admin/defaults/countries',
    iconComponent: { name: 'cil-location-pin' }
  },
  {
    name: 'Impuestos',
    url: '/super-admin/defaults/tax-rates',
    iconComponent: { name: 'cil-location-pin' }
  },
  {
    name: 'Métodos de Pago',
    url: '/super-admin/defaults/payment-methods',
    iconComponent: { name: 'cil-location-pin' }
  },
  {
    name: 'Series de Documentos',
    url: '/super-admin/defaults/document-series',
    iconComponent: { name: 'cil-location-pin' }
  },
  {
    name: 'Bodegas',
    url: '/super-admin/defaults/warehouses',
    iconComponent: { name: 'cil-location-pin' }
  }
];
