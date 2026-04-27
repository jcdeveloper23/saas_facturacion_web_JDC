import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  ContainerComponent,
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent,
  BadgeComponent, ButtonDirective,
  AlertComponent, SpinnerComponent,
  TableDirective,
  AccordionComponent, AccordionItemComponent, AccordionButtonDirective,
  TemplateIdDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Plan } from '../../models/plan.interface';
import { PluginPackage } from '../../../../core/interfaces/permission.interface';

// ─── Tipos de display (derivados de los datos de Firestore) ───────────────────

export interface GuidePlan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  badge?: string;
  badgeColor?: string;
  description: string;
  audience: string;
  packages: string[];
  highlights: string[];
  invoicesMonth: string;
  users: string;
  companies: string;
  color: string;
}

export interface GuideScenario {
  title: string;
  profile: string;
  need: string;
  solution: string;
  plan: string;
  addons?: string[];
  tip?: string;
}

export interface GuideFaq {
  question: string;
  answer: string;
  category: 'pricing' | 'packages' | 'addons' | 'limits' | 'technical';
}

@Component({
  selector: 'app-plan-guide',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    ContainerComponent,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    RowComponent, ColComponent,
    BadgeComponent, ButtonDirective,
    AlertComponent, SpinnerComponent,
    TableDirective,
    AccordionComponent, AccordionItemComponent, AccordionButtonDirective,
    TemplateIdDirective,
    IconDirective
  ],
  templateUrl: './plan-guide.component.html'
})
export class PlanGuideComponent implements OnInit {
  private svc = inject(SuperAdminService);

  activeTab    = signal<string>('modelo');
  loading      = signal(true);

  plans    = signal<GuidePlan[]>([]);
  packages = signal<PluginPackage[]>([]);

  ngOnInit(): void {
    let plansLoaded = false;
    let pkgsLoaded  = false;

    const checkDone = () => {
      if (plansLoaded && pkgsLoaded) this.loading.set(false);
    };

    this.svc.getPlans().subscribe(list => {
      const sorted = [...list].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
      this.plans.set(sorted.map(p => this.toGuidePlan(p)));
      plansLoaded = true;
      checkDone();
    });

    this.svc.getPluginPackages().subscribe(list => {
      const sorted = [...list].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      this.packages.set(sorted);
      pkgsLoaded = true;
      checkDone();
    });
  }

  // ─── Transformación Plan → GuidePlan ─────────────────────────────────────

  private toGuidePlan(plan: Plan): GuidePlan {
    return {
      id:           plan.id,
      name:         plan.name,
      priceMonthly: plan.priceMonthly,
      priceYearly:  plan.priceYearly,
      description:  plan.description,
      badge:        plan.badge,
      badgeColor:   plan.badgeColor,
      audience:     plan.audience ?? '',
      highlights:   plan.highlights ?? [],
      packages:     plan.includedPackages ?? [],
      invoicesMonth: this.fmtLimit(plan.limits?.sri?.invoicesPerMonth),
      users:         this.fmtLimit(plan.limits?.users?.activeUsersPerCompany),
      companies:     this.fmtLimit(plan.limits?.multiCompany?.companiesPerAccount),
      color:         plan.color ?? 'secondary'
    };
  }

  private fmtLimit(val: number | undefined | null): string {
    if (val == null) return '?';
    if (val === -1)  return '∞';
    if (val === 0)   return 'N/D';
    return val.toLocaleString('es-EC');
  }

  // ─── Helpers de display ───────────────────────────────────────────────────

  packageName(code: string): string {
    const pkg = this.packages().find(p => p.code === code);
    return pkg?.name ?? code.replace('pkg_', '');
  }

  packageColor(code: string): string {
    return this.packages().find(p => p.code === code)?.color ?? 'secondary';
  }

  // ─── Escenarios (contenido editorial, no en BD) ───────────────────────────

  readonly scenarios: GuideScenario[] = [
    {
      title: 'Vendedor ambulante que necesita facturar',
      profile: 'Persona natural, RIMPE, sin empleados',
      need: 'Solo necesita emitir facturas electrónicas al SRI y tener un catálogo para compartir.',
      solution: 'Plan Emprendedor cubre exactamente esto: pkg_sales + pkg_sri + pkg_marketplace.',
      plan: 'Emprendedor — $15/mes',
      tip: 'Si en el futuro necesita retenciones, puede contratar pkg_purchases o migrar a PYME.'
    },
    {
      title: 'Farmacia con inventario',
      profile: 'Empresa pequeña con bodega, agente retenedor',
      need: 'Facturas, retenciones, control de stock de medicamentos y registro de compras a laboratorios.',
      solution: 'Plan PYME incluye pkg_stock + pkg_sri (retenciones) + pkg_purchases.',
      plan: 'PYME — $39/mes',
      tip: 'Si necesitan reportes avanzados de stock, agregar pkg_reports como add-on ($9/mes).'
    },
    {
      title: 'Despacho contable con 3 clientes',
      profile: 'Contador independiente que lleva libros de 3 empresas',
      need: 'Acceder a múltiples empresas desde una sola cuenta, con contabilidad completa.',
      solution: 'Plan Profesional: multiCompanyMode habilitado (hasta 5 empresas), pkg_accounting incluido.',
      plan: 'Profesional — $79/mes',
      tip: 'La clave es multiCompanyMode: true — permite cambiar entre empresas desde el mismo login.'
    },
    {
      title: 'Empresa que quiere contabilidad pero está en PYME',
      profile: 'Empresa en Plan PYME que creció y necesita contabilidad',
      need: 'pkg_accounting requiere pkg_sri (ya lo tienen), pero el plan PYME no incluye contabilidad.',
      solution: 'Activar pkg_accounting como add-on ($29/mes). No hace falta cambiar de plan.',
      plan: 'PYME + Add-on pkg_accounting',
      addons: ['pkg_accounting — $29/mes'],
      tip: 'El super_admin activa el paquete desde /companies/{id}/plugins y registra el precio acordado.'
    },
    {
      title: 'Empresa grande que migra desde plan menor',
      profile: 'Empresa con 40 usuarios, 8.000 facturas/mes',
      need: 'Plan PYME ya no alcanza (límite 5 usuarios, 300 facturas). Necesitan escalar.',
      solution: 'Migrar a Empresarial. Los add-ons activos se preservan automáticamente.',
      plan: 'Empresarial — $149/mes',
      tip: 'Al cambiar de plan los add-ons NO se pierden. Si el nuevo plan ya incluye el paquete add-on, notificar al cliente.'
    },
    {
      title: 'Cliente pide POS pero está en plan Emprendedor',
      profile: 'Tienda pequeña que quiere caja rápida',
      need: 'pkg_pos requiere pkg_sales (ya lo tienen en Emprendedor).',
      solution: 'Activar pkg_pos como add-on. pkg_pos depende de pkg_sales que ya está activo.',
      plan: 'Emprendedor + Add-on pkg_pos',
      addons: ['pkg_pos — $15/mes'],
      tip: 'Siempre verificar el árbol de dependencias antes de activar un add-on.'
    }
  ];

  // ─── FAQ (contenido editorial, no en BD) ─────────────────────────────────

  readonly faqs: GuideFaq[] = [
    {
      category: 'pricing',
      question: '¿El precio del plan y el precio del paquete son lo mismo?',
      answer: 'No. El precio del PLAN es lo que paga el cliente mensualmente por su suscripción (ej. $39/mes PYME). El precio del PAQUETE es la tarifa de referencia que usa el super_admin cuando activa un add-on fuera del plan. El sistema NO cobra automáticamente — el super_admin factura manualmente al cliente el add-on por su canal habitual.'
    },
    {
      category: 'packages',
      question: '¿Por qué pkg_sales no incluye inventario (stock)?',
      answer: 'Para permitir planes como Emprendedor que tienen facturación SRI pero NO control de inventario. Si pkg_sales incluyera stock, sería imposible dar acceso a facturas sin activar también el módulo de inventario, contradiciendo el feature flag stockModule: false del plan Emprendedor.'
    },
    {
      category: 'addons',
      question: '¿Qué pasa si el cliente migra a un plan que ya incluye su add-on?',
      answer: 'El sistema preserva el add-on técnicamente (sigue activado) pero el super_admin debe revisar el campo addonPackages[] de la empresa y eliminar manualmente el registro del add-on si el nuevo plan ya lo incluye. Esto evita que se siga cobrando el add-on por separado.'
    },
    {
      category: 'addons',
      question: '¿Puedo desactivar un paquete que viene en el plan?',
      answer: 'No. Los paquetes de plan.includedPackages están bloqueados en la UI de CompanyPlugins. Para cambiar el bundle de paquetes del cliente, debes asignarle un plan diferente desde la lista de empresas. Esto garantiza coherencia entre el plan contratado y los módulos activos.'
    },
    {
      category: 'limits',
      question: '¿Qué significa -1 en un límite?',
      answer: 'En el modelo de datos, -1 = ilimitado. La regla de enforcement es: si el límite > 0 y el uso actual >= límite, bloquear. Si el límite es -1, siempre permitido. Si el límite es 0, siempre bloqueado (en ese caso se usa un feature flag en lugar de un contador).'
    },
    {
      category: 'technical',
      question: '¿Cómo funciona la doble condición para módulos de negocio?',
      answer: 'Un módulo requiere DOS condiciones: (1) el feature flag del plan debe ser true (ej. features.stockModule = true) Y (2) el módulo debe estar en company.enabledModules (viene del paquete activo). El featureFlagGuard verifica (1) y el moduleGuard verifica (2). Ambos se aplican en cadena en las rutas de Angular.'
    },
    {
      category: 'technical',
      question: '¿Qué es multiCompanyMode y cómo funciona?',
      answer: 'Es un feature flag del plan que habilita el selector de empresa en el header para que un usuario (típicamente un contador) pueda cambiar entre varias empresas sin cerrar sesión. Al cambiar de empresa, se llama la CF switchActiveCompany que actualiza los custom claims del token y reinicia el contexto del tenant.'
    },
    {
      category: 'pricing',
      question: '¿El precio anual es el total del año o el valor mensual?',
      answer: 'El precio anual es el valor mensual cuando se paga en modalidad anual (se cobra el total de una vez). Ejemplo: Plan Profesional mensual = $79/mes. Plan Profesional anual = $65/mes × 12 = $780/año. El cliente ahorra $168 al año pagando por adelantado.'
    },
    {
      category: 'addons',
      question: '¿Cómo registro el precio acordado de un add-on si hubo descuento?',
      answer: 'Al activar el add-on desde /companies/{id}/plugins, el modal muestra el precio de referencia del paquete pero permite editarlo. El super_admin puede ingresar el precio real acordado y agregar una nota como "cortesía", "piloto 3 meses" o "plan personalizado". Este valor queda registrado en addonPackages[].priceAtActivation.'
    },
    {
      category: 'packages',
      question: '¿Qué dependencias debo revisar antes de activar un add-on?',
      answer: 'La UI de CompanyPlugins muestra automáticamente las dependencias faltantes. Por ejemplo, pkg_accounting requiere pkg_sri, que requiere pkg_sales. Si el cliente no tiene pkg_sri activo, el sistema bloqueará la activación y mostrará un aviso.'
    }
  ];

  readonly faqCategories = [
    { id: 'all',       label: 'Todas' },
    { id: 'pricing',   label: 'Precios' },
    { id: 'packages',  label: 'Paquetes' },
    { id: 'addons',    label: 'Add-ons' },
    { id: 'limits',    label: 'Límites' },
    { id: 'technical', label: 'Técnico' }
  ];

  activeFaqCategory = signal<string>('all');

  filteredFaqs() {
    const cat = this.activeFaqCategory();
    return cat === 'all' ? this.faqs : this.faqs.filter(f => f.category === cat);
  }

  faqCategoryLabel(category: string): string {
    return this.faqCategories.find(c => c.id === category)?.label ?? category;
  }
}
