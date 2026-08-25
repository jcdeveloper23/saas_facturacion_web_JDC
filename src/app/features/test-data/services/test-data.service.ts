import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, getDocs, query, where, limit,
  doc, getDoc, Timestamp
} from '@angular/fire/firestore';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';

import { PersonasService }  from '../../personas/services/personas.service';
import { ProductsService }  from '../../products/services/products.service';
import { FamiliesService }  from '../../products/services/families.service';
import { InvoicesService }  from '../../invoices/services/invoices.service';
import { PurchasesService } from '../../purchases/services/purchases.service';

import { Family, Product } from '../../products/models/product.interface';
import { Person }          from '../../personas/models/person.interface';
import {
  calcLine, calcInvoiceTotals, InvoiceLine
} from '../../invoices/models/invoice.interface';
import { calcPurchaseLine, calcPurchaseTotals } from '../../purchases/models/purchase.interface';

export interface GenerationResult {
  created: number;
  errors:  number;
  messages: string[];
}

// ─── Static data pools ────────────────────────────────────────────────────────

const FAMILY_POOL = [
  { code: 'ELEC',  name: 'Electrónica'           },
  { code: 'ROPA',  name: 'Ropa y Calzado'         },
  { code: 'ALIM',  name: 'Alimentos y Bebidas'    },
  { code: 'FERR',  name: 'Ferretería'             },
  { code: 'FARM',  name: 'Farmacia'               },
  { code: 'PAPE',  name: 'Papelería y Útiles'     },
  { code: 'DEPO',  name: 'Deportes'               },
  { code: 'HOGA',  name: 'Hogar y Decoración'     },
  { code: 'AUTO',  name: 'Automotriz'             },
  { code: 'INFO',  name: 'Informática'            },
  { code: 'MUEB',  name: 'Muebles y Oficina'      },
  { code: 'JUGO',  name: 'Juguetes y Juegos'      },
  { code: 'COSM',  name: 'Cosmética y Belleza'    },
  { code: 'TEXT',  name: 'Textiles e Insumos'     },
  { code: 'JOYE',  name: 'Joyería y Accesorios'   },
  { code: 'CONS',  name: 'Materiales Construcción'},
  { code: 'AGRO',  name: 'Agropecuario'           },
  { code: 'VETE',  name: 'Veterinaria'            },
  { code: 'SERP',  name: 'Servicios Profesionales'},
  { code: 'SERT',  name: 'Servicios Técnicos'     },
  { code: 'LUBT',  name: 'Lubricantes'            },
  { code: 'OPTI',  name: 'Óptica'                 },
  { code: 'MUSI',  name: 'Instrumentos Musicales' },
  { code: 'LIBR',  name: 'Libros y Revistas'      },
  { code: 'SALU',  name: 'Salud y Bienestar'      },
];

const PRODUCT_POOL: { name: string; sku: string; type: 'product'|'service'; price: number; cost: number }[] = [
  { name: 'Televisor LED 55"',          sku: 'TV-LED-55',   type: 'product', price: 450.00, cost: 320.00 },
  { name: 'Televisor LED 43"',          sku: 'TV-LED-43',   type: 'product', price: 320.00, cost: 220.00 },
  { name: 'Refrigeradora 250L',         sku: 'REFR-250',    type: 'product', price: 580.00, cost: 410.00 },
  { name: 'Lavadora 12Kg',              sku: 'LAV-12K',     type: 'product', price: 420.00, cost: 290.00 },
  { name: 'Microondas 20L',             sku: 'MICRO-20',    type: 'product', price: 95.00,  cost: 62.00  },
  { name: 'Licuadora Industrial',       sku: 'LIC-IND',     type: 'product', price: 85.00,  cost: 55.00  },
  { name: 'Ventilador de pie',          sku: 'VENT-PIE',    type: 'product', price: 45.00,  cost: 28.00  },
  { name: 'Aire Acondicionado 12000 BTU',sku:'AC-12K',      type: 'product', price: 650.00, cost: 460.00 },
  { name: 'Laptop 15" Core i5',         sku: 'LAP-I5-15',   type: 'product', price: 750.00, cost: 540.00 },
  { name: 'Computador de Escritorio',   sku: 'PC-DESK',     type: 'product', price: 520.00, cost: 370.00 },
  { name: 'Mouse Inalámbrico',          sku: 'MOUSE-INL',   type: 'product', price: 18.00,  cost: 10.00  },
  { name: 'Teclado USB',                sku: 'TECL-USB',    type: 'product', price: 15.00,  cost: 8.00   },
  { name: 'Monitor 24" Full HD',        sku: 'MON-24FHD',   type: 'product', price: 185.00, cost: 130.00 },
  { name: 'Impresora Multifunción',     sku: 'IMP-MULTI',   type: 'product', price: 210.00, cost: 150.00 },
  { name: 'Camiseta Deportiva',         sku: 'CAM-DEP',     type: 'product', price: 18.00,  cost: 9.00   },
  { name: 'Pantalón Jean Hombre',       sku: 'PAN-JEA-H',   type: 'product', price: 35.00,  cost: 20.00  },
  { name: 'Blusa Casual Mujer',         sku: 'BLU-CAS-M',   type: 'product', price: 22.00,  cost: 12.00  },
  { name: 'Zapatos Deportivos',         sku: 'ZAP-DEP',     type: 'product', price: 65.00,  cost: 40.00  },
  { name: 'Sandalias de Playa',         sku: 'SAN-PLA',     type: 'product', price: 15.00,  cost: 7.00   },
  { name: 'Aceite de Cocina 1L',        sku: 'ACE-COC-1L',  type: 'product', price: 3.20,   cost: 2.10   },
  { name: 'Arroz Blanco 5Kg',           sku: 'ARR-BL-5K',   type: 'product', price: 4.50,   cost: 3.00   },
  { name: 'Azúcar Blanca 2Kg',          sku: 'AZU-BL-2K',   type: 'product', price: 2.80,   cost: 1.80   },
  { name: 'Fideos Spaghetti 500g',      sku: 'FID-SPA-500', type: 'product', price: 1.50,   cost: 0.90   },
  { name: 'Atún en Lata 180g',          sku: 'ATU-LAT-180', type: 'product', price: 1.80,   cost: 1.10   },
  { name: 'Leche Entera 1L',            sku: 'LEC-ENT-1L',  type: 'product', price: 1.00,   cost: 0.65   },
  { name: 'Cemento Portland 50Kg',      sku: 'CEM-PORT-50', type: 'product', price: 8.50,   cost: 5.80   },
  { name: 'Pintura Látex Blanca 4L',    sku: 'PIN-LAT-4L',  type: 'product', price: 18.00,  cost: 11.00  },
  { name: 'Tubería PVC 1/2" (6m)',      sku: 'TUB-PVC-6',   type: 'product', price: 4.20,   cost: 2.60   },
  { name: 'Cable Eléctrico 12 AWG (m)', sku: 'CAB-12AWG',   type: 'product', price: 1.20,   cost: 0.75   },
  { name: 'Silla Ejecutiva',            sku: 'SIL-EJEC',    type: 'product', price: 125.00, cost: 85.00  },
  { name: 'Escritorio de Madera',       sku: 'ESC-MAD',     type: 'product', price: 280.00, cost: 195.00 },
  { name: 'Resma de Papel A4',          sku: 'RES-A4',      type: 'product', price: 4.80,   cost: 3.20   },
  { name: 'Bolígrafos x12',            sku: 'BOL-X12',      type: 'product', price: 2.50,   cost: 1.40   },
  { name: 'Cuaderno 100 Hojas',         sku: 'CUA-100H',    type: 'product', price: 1.80,   cost: 1.00   },
  { name: 'Balón de Fútbol No. 5',      sku: 'BAL-FUT-5',   type: 'product', price: 28.00,  cost: 17.00  },
  { name: 'Raqueta de Tenis',           sku: 'RAQ-TEN',     type: 'product', price: 45.00,  cost: 28.00  },
  { name: 'Shampoo 400ml',              sku: 'SHA-400ML',   type: 'product', price: 5.50,   cost: 3.20   },
  { name: 'Crema Hidratante 200ml',     sku: 'CRE-HID-200', type: 'product', price: 8.90,   cost: 5.50   },
  { name: 'Repuesto Pastillas Freno',   sku: 'REP-PAS-FRE', type: 'product', price: 35.00,  cost: 22.00  },
  { name: 'Filtro de Aceite',           sku: 'FIL-ACE',     type: 'product', price: 8.50,   cost: 5.00   },
  { name: 'Aceite Motor 20W50 4L',      sku: 'ACM-20W50-4', type: 'product', price: 22.00,  cost: 14.00  },
  { name: 'Servicio de Mantenimiento',  sku: 'SRV-MANT',    type: 'service', price: 45.00,  cost: 0.00   },
  { name: 'Consultoría Técnica (hora)', sku: 'SRV-CONS-H',  type: 'service', price: 35.00,  cost: 0.00   },
  { name: 'Instalación Eléctrica',      sku: 'SRV-INST-E',  type: 'service', price: 120.00, cost: 0.00   },
  { name: 'Servicio de Diseño Gráfico', sku: 'SRV-DISEG',   type: 'service', price: 80.00,  cost: 0.00   },
  { name: 'Servicio de Capacitación',   sku: 'SRV-CAPAC',   type: 'service', price: 150.00, cost: 0.00   },
  { name: 'Marco para Anteojos',        sku: 'OPT-MARC',    type: 'product', price: 45.00,  cost: 28.00  },
  { name: 'Lentes de Contacto x30',     sku: 'OPT-LCON-30', type: 'product', price: 38.00,  cost: 22.00  },
  { name: 'Multivitamínico 60 Tabs',    sku: 'FAR-MVIT-60', type: 'product', price: 12.50,  cost: 7.80   },
];

const CUSTOMER_FIRST_NAMES = [
  'Carlos', 'María', 'José', 'Ana', 'Luis', 'Carmen', 'Jorge', 'Patricia',
  'Diego', 'Lucía', 'Roberto', 'Gabriela', 'Fernando', 'Verónica', 'Andrés',
  'Daniela', 'Eduardo', 'Alejandra', 'Miguel', 'Sofía', 'Pablo', 'Valeria',
  'Sebastián', 'Isabella', 'Mateo', 'Camila', 'Santiago', 'Valentina',
];

const CUSTOMER_LAST_NAMES = [
  'García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Sánchez',
  'Torres', 'Flores', 'Rivera', 'Morales', 'Vargas', 'Jiménez', 'Castillo',
  'Moreno', 'Romero', 'Gutiérrez', 'Cruz', 'Reyes', 'Herrera', 'Medina',
  'Ramírez', 'Suárez', 'Ortega', 'Cabrera', 'Guerrero', 'Mendoza', 'Ruiz',
];

const SUPPLIER_NAMES = [
  'Distribuidora Nacional',   'Importadora del Pacífico',  'Comercial Andina',
  'Almacenes El Sol',         'Proveedor Central',         'Industrias del Norte',
  'Textiles del Sur',         'Ferretería Industrial',     'Alimentos Naturales',
  'Tecnología y Sistemas',    'Equipos y Servicios',       'Mayorista Ecuatoriano',
  'Distribuciones América',   'Suministros y Materiales',  'Abastecedora General',
  'Comercial del Oriente',    'Provisiones Internacionales','Inversiones y Negocios',
  'Representaciones Unidas',  'Abacería Central',
];

const PROVINCES = [
  { code: '01', name: 'Azuay',        city: 'Cuenca'       },
  { code: '02', name: 'Bolívar',      city: 'Guaranda'     },
  { code: '06', name: 'Chimborazo',   city: 'Riobamba'     },
  { code: '07', name: 'El Oro',       city: 'Machala'      },
  { code: '08', name: 'Esmeraldas',   city: 'Esmeraldas'   },
  { code: '09', name: 'Guayas',       city: 'Guayaquil'    },
  { code: '10', name: 'Imbabura',     city: 'Ibarra'       },
  { code: '11', name: 'Loja',         city: 'Loja'         },
  { code: '13', name: 'Manabí',       city: 'Portoviejo'   },
  { code: '17', name: 'Pichincha',    city: 'Quito'        },
  { code: '18', name: 'Tungurahua',   city: 'Ambato'       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random date within the last `months` months. */
function randomPastDate(months = 6): Date {
  const now  = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - months);
  const ms = from.getTime() + Math.random() * (now.getTime() - from.getTime());
  return new Date(ms);
}

/** Generate a fictional 10-digit cédula (no check-digit validation). */
function genCedula(): string {
  const prov = randInt(1, 24).toString().padStart(2, '0');
  const mid  = randInt(0, 5).toString();
  const rest = Array.from({ length: 6 }, () => randInt(0, 9)).join('');
  const veri = randInt(0, 9).toString();
  return `${prov}${mid}${rest}${veri}`;
}

/** Generate a fictional company RUC (cédula + 001). */
function genRuc(): string {
  const prov = randInt(1, 24).toString().padStart(2, '0');
  const rest = Array.from({ length: 7 }, () => randInt(0, 9)).join('');
  return `${prov}9${rest}001`;
}

function shuffled<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TestDataService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private personasSvc  = inject(PersonasService);
  private productsSvc  = inject(ProductsService);
  private familiesSvc  = inject(FamiliesService);
  private invoicesSvc  = inject(InvoicesService);
  private purchasesSvc = inject(PurchasesService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get userId():    string { return this.authService.user()?.uid ?? 'test-data'; }

  // ─── Catalog reads ────────────────────────────────────────────────────────

  async getStats(): Promise<{
    families: number; products: number; customers: number;
    suppliers: number; invoices: number; purchases: number;
  }> {
    const [families, products, customers, suppliers, invoices, purchases] = await Promise.all([
      this.countCol('families'),
      this.countCol('products'),
      this.countColWhere('personas', 'roles', 'array-contains', 'customer'),
      this.countColWhere('personas', 'roles', 'array-contains', 'supplier'),
      this.countCol('invoices'),
      this.countCol('purchases'),
    ]);
    return { families, products, customers, suppliers, invoices, purchases };
  }

  private async countCol(col: string): Promise<number> {
    const ref  = collection(this.firestore, `companies/${this.companyId}/${col}`);
    const snap = await getDocs(query(ref));
    return snap.size;
  }

  private async countColWhere(col: string, field: string, op: any, val: any): Promise<number> {
    const ref  = collection(this.firestore, `companies/${this.companyId}/${col}`);
    const snap = await getDocs(query(ref, where(field, op, val)));
    return snap.size;
  }

  private async loadFamilies(): Promise<Family[]> {
    const ref  = collection(this.firestore, `companies/${this.companyId}/families`);
    const snap = await getDocs(query(ref, where('isActive', '==', true)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Family));
  }

  private async loadProducts(): Promise<Product[]> {
    const ref  = collection(this.firestore, `companies/${this.companyId}/products`);
    const snap = await getDocs(query(ref, where('isActive', '==', true), limit(200)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  }

  private async loadPersonas(role: 'customer' | 'supplier'): Promise<Person[]> {
    const ref  = collection(this.firestore, `companies/${this.companyId}/personas`);
    const snap = await getDocs(query(ref, where('roles', 'array-contains', role), limit(200)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Person));
  }

  private async loadExistingSkus(): Promise<Set<string>> {
    const ref  = collection(this.firestore, `companies/${this.companyId}/products`);
    const snap = await getDocs(query(ref));
    return new Set(snap.docs.map(d => (d.data() as any).sku as string));
  }

  private async loadExistingFamilyCodes(): Promise<Set<string>> {
    const ref  = collection(this.firestore, `companies/${this.companyId}/families`);
    const snap = await getDocs(query(ref));
    return new Set(snap.docs.map(d => (d.data() as any).code as string));
  }

  // ─── Generators ──────────────────────────────────────────────────────────

  async generateFamilies(n: number): Promise<GenerationResult> {
    const existing = await this.loadExistingFamilyCodes();
    const available = FAMILY_POOL.filter(f => !existing.has(f.code));

    const toCreate = available.slice(0, n);
    const messages: string[] = [];
    let created = 0;
    let errors  = 0;

    for (const f of toCreate) {
      try {
        await this.familiesSvc.create({
          code:     f.code,
          name:     f.name,
          isActive: true,
        });
        messages.push(`Familia "${f.name}" creada`);
        created++;
      } catch (e: any) {
        errors++;
        messages.push(`Error creando familia "${f.name}": ${e?.message ?? e}`);
      }
    }

    if (toCreate.length === 0) {
      messages.push('No hay más familias en el catálogo para agregar (máx 25).');
    }

    return { created, errors, messages };
  }

  async generateProducts(n: number): Promise<GenerationResult> {
    const [existingSkus, families] = await Promise.all([
      this.loadExistingSkus(),
      this.loadFamilies(),
    ]);

    const available = PRODUCT_POOL.filter(p => !existingSkus.has(p.sku));
    const toCreate  = shuffled(available).slice(0, n);

    const messages: string[] = [];
    let created = 0;
    let errors  = 0;

    for (const p of toCreate) {
      const family = families.length ? pick(families) : null;
      try {
        await this.productsSvc.createProduct({
          sku:           p.sku,
          name:          p.name,
          type:          p.type,
          salePrice:     p.price,
          costPrice:     p.cost,
          taxRateCode:   'VAT15',
          taxRateName:   'IVA 15%',
          taxRate:       15,
          familyId:      family?.id,
          familyCode:    family?.code,
          familyName:    family?.name,
          isSold:        true,
          isPurchased:   p.type === 'product',
          isPublic:      false,
          isBlocked:     false,
          isActive:      true,
          trackStock:    p.type === 'product',
          noStock:       p.type === 'service',
          stockMin:      0,
          stockMax:      0,
          hasVariants:   false,
          traceable:     false,
        });
        messages.push(`Artículo "${p.name}" (${p.sku}) creado`);
        created++;
      } catch (e: any) {
        errors++;
        messages.push(`Error creando artículo "${p.name}": ${e?.message ?? e}`);
      }
    }

    if (toCreate.length === 0) {
      messages.push('No hay más artículos en el catálogo para agregar (máx 49).');
    }

    return { created, errors, messages };
  }

  async generateCustomers(n: number): Promise<GenerationResult> {
    const messages: string[] = [];
    let created = 0;
    let errors  = 0;

    for (let i = 0; i < n; i++) {
      const firstName = pick(CUSTOMER_FIRST_NAMES);
      const lastName1 = pick(CUSTOMER_LAST_NAMES);
      const lastName2 = pick(CUSTOMER_LAST_NAMES);
      const isCompany = Math.random() < 0.3;  // 30% son empresas
      const prov      = pick(PROVINCES);

      const name      = isCompany
        ? `${pick(SUPPLIER_NAMES)} ${pick(['Cia. Ltda.', 'S.A.', 'Corp.'])}`
        : `${firstName} ${lastName1} ${lastName2}`;
      const taxId     = isCompany ? genRuc() : genCedula();
      const taxIdType = isCompany ? 'RUC' as const : 'CI' as const;

      try {
        await this.personasSvc.createPerson({
          roles:       ['customer'],
          taxId,
          taxIdType,
          isCompany,
          name,
          legalName:   name,
          email:       `${firstName.toLowerCase()}.${lastName1.toLowerCase()}@email.ec`,
          phone1:      `0${randInt(9,9)}${randInt(1000000, 9999999)}`,
          isActive:    true,
          addresses: [{
            id:         crypto.randomUUID(),
            label:      'Principal',
            country:    'ECU',
            province:   prov.name,
            city:       prov.city,
            address:    `Av. Principal ${randInt(100, 9999)} y Calle ${randInt(1, 50)}`,
            isShipping: true,
            isBilling:  true,
          }],
          bankAccounts: [],
          customerData: {
            currency:        'USD',
            paymentTermCode: 'CONT',
            vatRegime:       'General',
          },
        });
        messages.push(`Cliente "${name}" creado`);
        created++;
      } catch (e: any) {
        errors++;
        messages.push(`Error creando cliente: ${e?.message ?? e}`);
      }
    }

    return { created, errors, messages };
  }

  async generateSuppliers(n: number): Promise<GenerationResult> {
    const messages: string[] = [];
    let created = 0;
    let errors  = 0;

    for (let i = 0; i < n; i++) {
      const baseName  = pick(SUPPLIER_NAMES);
      const suffix    = pick(['Cia. Ltda.', 'S.A.', 'Corp.', 'S.A.S.']);
      const name      = `${baseName} ${suffix}`;
      const prov      = pick(PROVINCES);

      try {
        await this.personasSvc.createPerson({
          roles:       ['supplier'],
          taxId:       genRuc(),
          taxIdType:   'RUC',
          isCompany:   true,
          name,
          legalName:   name,
          email:       `ventas@${baseName.toLowerCase().replace(/\s+/g, '').substring(0, 10)}.ec`,
          phone1:      `0${randInt(2,7)}-${randInt(2000000, 9999999)}`,
          isActive:    true,
          addresses: [{
            id:         crypto.randomUUID(),
            label:      'Principal',
            country:    'ECU',
            province:   prov.name,
            city:       prov.city,
            address:    `Km ${randInt(1, 20)} Vía Principal`,
            isShipping: false,
            isBilling:  true,
          }],
          bankAccounts: [],
          supplierData: {
            currency:        'USD',
            paymentTermCode: 'CONT',
            vatRegime:       'General',
            irRetentionPct:  pick([0, 1, 2]),
            vatRetentionPct: pick([0, 30, 70, 100]),
          },
        });
        messages.push(`Proveedor "${name}" creado`);
        created++;
      } catch (e: any) {
        errors++;
        messages.push(`Error creando proveedor: ${e?.message ?? e}`);
      }
    }

    return { created, errors, messages };
  }

  async generateInvoices(n: number): Promise<GenerationResult> {
    const [customers, products] = await Promise.all([
      this.loadPersonas('customer'),
      this.loadProducts(),
    ]);

    const messages: string[] = [];
    let created = 0;
    let errors  = 0;

    if (customers.length === 0) {
      return { created: 0, errors: 1, messages: ['No hay clientes. Genera clientes primero.'] };
    }
    if (products.length === 0) {
      return { created: 0, errors: 1, messages: ['No hay artículos. Genera artículos primero.'] };
    }

    for (let i = 0; i < n; i++) {
      const customer   = pick(customers);
      const date       = randomPastDate(6);
      const fiscalYear = date.getFullYear().toString();
      const tsDate     = Timestamp.fromDate(date);
      const dueDate    = new Date(date);
      dueDate.setDate(dueDate.getDate() + 0);

      // Build 1-4 invoice lines
      const numLines   = randInt(1, 4);
      const lineProds  = shuffled(products).slice(0, numLines);
      const lines: InvoiceLine[] = lineProds.map((p, idx) => {
        const qty        = randInt(1, 5);
        const unitPrice  = p.salePrice;
        const vatPct     = p.taxRate ?? 15;
        const base       = calcLine({ quantity: qty, unitPrice, discountPct: 0, vatPct });
        return {
          id:          crypto.randomUUID(),
          productId:   p.id,
          productSku:  p.sku,
          description: p.name,
          quantity:    qty,
          unitPrice,
          discountPct: 0,
          vatPct,
          subtotal:    base.subtotal,
          vatAmount:   base.vatAmount,
          total:       base.total,
          unit:        'UNIDAD',
          averageCost: p.averageCost ?? p.costPrice ?? 0,
        };
      });

      try {
        await this.invoicesSvc.createInvoice({
          seriesCode:          'A',
          seriesEstablishment: '001',
          seriesEmissionPoint: '001',
          fiscalYear,
          date:    tsDate,
          dueDate: Timestamp.fromDate(dueDate),
          customerId:         customer.id,
          customerCode:       customer.customerData?.code ?? '',
          customerName:       customer.name,
          customerTaxId:      customer.taxId,
          customerTaxIdType:  customer.taxIdType,
          customerAddress:    customer.addresses?.[0]?.address,
          customerCity:       customer.addresses?.[0]?.city,
          customerEmail:      customer.email,
          warehouseCode:      '001',
          paymentTermCode:    'CONT',
          currency:           'USD',
          exchangeRate:       1,
          globalDiscountPct:  0,
          lines,
          status:             'issued',
          isPaid:             false,
          isVoid:             false,
          isCreditNote:       false,
          sriStatus:          'not_required',
          paymentMethods: [{ code: '01', name: 'Efectivo', amount: 0 }],
        });
        messages.push(`Factura venta (cliente: ${customer.name}, ${lines.length} líneas) creada`);
        created++;
      } catch (e: any) {
        errors++;
        messages.push(`Error creando factura: ${e?.message ?? e}`);
      }
    }

    return { created, errors, messages };
  }

  async generatePurchases(n: number): Promise<GenerationResult> {
    const [suppliers, products] = await Promise.all([
      this.loadPersonas('supplier'),
      this.loadProducts(),
    ]);

    const messages: string[] = [];
    let created = 0;
    let errors  = 0;

    if (suppliers.length === 0) {
      return { created: 0, errors: 1, messages: ['No hay proveedores. Genera proveedores primero.'] };
    }
    if (products.length === 0) {
      return { created: 0, errors: 1, messages: ['No hay artículos. Genera artículos primero.'] };
    }

    for (let i = 0; i < n; i++) {
      const supplier = pick(suppliers);
      const date     = randomPastDate(6);
      const year     = date.getFullYear();
      const tsDate   = Timestamp.fromDate(date);

      const ir  = supplier.supplierData?.irRetentionPct  ?? 0;
      const vat = supplier.supplierData?.vatRetentionPct ?? 0;

      // Build 1-3 purchase lines
      const numLines  = randInt(1, 3);
      const lineProds = shuffled(products.filter(p => p.type === 'product')).slice(0, numLines);
      if (lineProds.length === 0) lineProds.push(...shuffled(products).slice(0, 1));

      const lines = lineProds.map(p => {
        const qty       = randInt(2, 20);
        const unitCost  = p.costPrice;
        const taxRate   = p.taxRate ?? 15;
        const computed  = calcPurchaseLine(qty, unitCost, 0, taxRate);
        return {
          id:          crypto.randomUUID(),
          productId:   p.id,
          productSku:  p.sku,
          productName: p.name,
          qty,
          unitCost,
          discount:    0,
          taxRate,
          subtotal:    computed.subtotal,
          taxAmount:   computed.taxAmount,
          total:       computed.total,
        };
      });

      const totals = calcPurchaseTotals(lines, ir, vat);

      // Generate fictional supplier invoice number
      const supplierInvoiceNum = `${randInt(1, 9)}-${randInt(100, 999)}-${randInt(1000000, 9999999)}`;

      try {
        await this.purchasesSvc.create({
          serie:                 'C',
          year,
          supplierInvoiceNumber: supplierInvoiceNum,
          supplierInvoiceDate:   tsDate,
          supplierId:            supplier.id,
          supplierName:          supplier.name,
          supplierRuc:           supplier.taxId,
          supplierTaxIdType:     supplier.taxIdType.toLowerCase(),
          sriDocumentType:       '01',
          sriSustentoCode:       '01',
          paymentMethodCode:     '01',
          irRetentionPct:        ir,
          vatRetentionPct:       vat,
          warehouseCode:         '001',
          warehouseName:         'Principal',
          date:                  tsDate,
          notes:                 '',
          lines,
          ...totals,
          status:                'received',
        });
        messages.push(`Compra (proveedor: ${supplier.name}, ${lines.length} líneas) creada`);
        created++;
      } catch (e: any) {
        errors++;
        messages.push(`Error creando compra: ${e?.message ?? e}`);
      }
    }

    return { created, errors, messages };
  }
}
