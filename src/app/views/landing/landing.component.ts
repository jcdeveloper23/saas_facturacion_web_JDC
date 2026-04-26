import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  HostListener,
  inject,
  PLATFORM_ID,
  ViewEncapsulation
} from '@angular/core';
import { isPlatformBrowser, NgClass, NgFor, NgIf } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { IconDirective } from '@coreui/icons-angular';

interface Module {
  icon: string;
  title: string;
  description: string;
  badge?: string;
  color: string;
}

interface Stat {
  value: number;
  display: string;
  suffix: string;
  label: string;
  icon: string;
  current: number;
}

interface Testimonial {
  name: string;
  role: string;
  company: string;
  avatar: string;
  text: string;
  rating: number;
}

interface PricingPlan {
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  highlighted: boolean;
  badge?: string;
  ctaText: string;
  contactSales?: boolean;
}

interface FaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [NgClass, NgFor, NgIf, RouterLink, FormsModule, IconDirective],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  // Desactiva el scoping de Angular para que .lp pueda aislar de CoreUI global
  encapsulation: ViewEncapsulation.None
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private meta = inject(Meta);
  private titleService = inject(Title);

  // ─── Navbar state ───────────────────────────────────────────────
  scrolled = false;
  mobileMenuOpen = false;
  activeSection = '';

  // ─── Stats counter ──────────────────────────────────────────────
  statsAnimated = false;
  private statsObserver?: IntersectionObserver;
  private animationFrames: number[] = [];

  // ─── Scroll fade-in ─────────────────────────────────────────────
  private fadeObserver?: IntersectionObserver;

  // ─── Section observer ───────────────────────────────────────────
  private sectionObserver?: IntersectionObserver;

  // ─── Video demo modal ───────────────────────────────────────────
  videoDemoOpen = false;

  // ─── Contact form ───────────────────────────────────────────────
  contactForm = { name: '', email: '', phone: '', company: '', message: '' };
  formSubmitted = false;
  formSubmitting = false;
  formError = false;
  openFaqIndices = new Set<number>();

  // ─── Data ───────────────────────────────────────────────────────
  readonly modules: Module[] = [
    { icon: 'cilDescription',   title: 'Facturación Electrónica',  description: 'Facturas, notas de crédito/débito, retenciones, guías de remisión y liquidaciones. Totalmente homologado con el SRI.', badge: 'SRI Homologado', color: 'blue' },
    { icon: 'cilChartPie',      title: 'Contabilidad NIIF',         description: 'Plan de cuentas, asientos contables, balance general, estado de resultados, libro mayor y cierre contable.', color: 'purple' },
    { icon: 'cilLayers',        title: 'Inventarios Multi-Bodega',  description: 'Kardex FIFO/LIFO/Promedio, variantes, lotes, alertas de stock, trazabilidad y transferencias entre bodegas.', color: 'green' },
    { icon: 'cilCart',          title: 'Compras',                   description: 'Órdenes de compra, recepción de mercadería, facturas de proveedor, anticipos e importaciones.', color: 'orange' },
    { icon: 'cilBriefcase',     title: 'Ventas',                    description: 'Cotizaciones, pedidos, facturación directa, gestión de cobranzas y comisiones de vendedores.', color: 'teal' },
    { icon: 'cilPeople',        title: 'Nómina y RRHH',             description: 'Roles de pago, décimos, fondos de reserva, IESS, RDEP, vacaciones y gestión de empleados.', color: 'pink' },
    { icon: 'cilScreenDesktop', title: 'Punto de Venta POS',        description: 'Interfaz táctil, múltiples cajas, cierre de caja diario, integrado con inventario en tiempo real.', color: 'indigo' },
    { icon: 'cilBuilding',      title: 'Multi-Empresa',             description: 'Empresas ilimitadas desde una cuenta, roles y permisos granulares, auditoría completa y consolidación.', badge: 'Exclusivo', color: 'red' }
  ];

  readonly stats: Stat[] = [
    { value: 2500,    display: '0', suffix: '+',  label: 'Empresas activas',   icon: 'cilBuilding',    current: 0 },
    { value: 1200000, display: '0', suffix: '+',  label: 'Facturas emitidas',  icon: 'cilFile',        current: 0 },
    { value: 99.9,    display: '0', suffix: '%',  label: 'Uptime garantizado', icon: 'cilBolt',        current: 0 },
    { value: 24,      display: '0', suffix: '/7', label: 'Soporte técnico',    icon: 'cilSpeedometer', current: 0 }
  ];

  readonly testimonials: Testimonial[] = [
    {
      name: 'María Fernanda Torres',
      role: 'Gerente Financiera',
      company: 'Importadora Torres & Hijos',
      avatar: 'MT',
      text: 'FacturaSec transformó nuestra gestión contable. El módulo de facturación electrónica nos ahorra 3 horas diarias. La integración con el SRI es perfecta y nunca hemos tenido problemas de homologación.',
      rating: 5
    },
    {
      name: 'Carlos Andrés Vega',
      role: 'CEO',
      company: 'Distribuidora Vega Hnos.',
      avatar: 'CV',
      text: 'Manejamos 5 empresas desde una sola cuenta. El módulo multi-empresa es increíble, podemos consolidar reportes en segundos. El soporte técnico responde en minutos, no en días.',
      rating: 5
    },
    {
      name: 'Ana Lucía Morales',
      role: 'Contadora',
      company: 'Consultora ML & Asociados',
      avatar: 'AM',
      text: 'Como contadora, lo que más valoro es la precisión en los cálculos NIIF y la facilidad de generar el RDEP. El módulo de nómina es el más completo que he usado en Ecuador.',
      rating: 5
    },
    {
      name: 'Roberto Castillo',
      role: 'Dueño',
      company: 'Ferretería El Progreso',
      avatar: 'RC',
      text: 'Antes tardaba media hora en hacer una factura con mi sistema anterior. Con FacturaSec la hago en 2 minutos y el cliente recibe el XML automáticamente. La migración fue fácil y el equipo me ayudó en todo.',
      rating: 4
    },
    {
      name: 'Gabriela Sánchez',
      role: 'Directora Administrativa',
      company: 'Clínica Sánchez & Asociados',
      avatar: 'GS',
      text: 'Implementamos FacturaSec en nuestra clínica y el cambio fue inmediato. Las liquidaciones de compra y retenciones ahora se generan sin errores. El precio es muy justo considerando todo lo que incluye.',
      rating: 5
    },
    {
      name: 'Diego Montoya',
      role: 'Gerente General',
      company: 'Grupo Montoya Textiles',
      avatar: 'DM',
      text: 'Llevamos 8 meses con FacturaSec y no hemos tenido ni un solo problema con el SRI. El módulo de inventario multi-bodega nos permite controlar nuestras 3 bodegas en tiempo real. Lo recomiendo.',
      rating: 5
    }
  ];

  readonly pricingPlans: PricingPlan[] = [
    {
      name: 'Starter',
      price: 29,
      period: '/mes',
      description: 'Para pequeños negocios que inician',
      features: [
        '1 empresa',
        'Facturación electrónica SRI',
        'Hasta 200 facturas/mes',
        'Inventario básico',
        '2 usuarios',
        'Soporte por email'
      ],
      highlighted: false,
      ctaText: 'Comenzar gratis'
    },
    {
      name: 'Business',
      price: 79,
      period: '/mes',
      description: 'Para empresas en crecimiento',
      features: [
        '3 empresas',
        'Facturación electrónica ilimitada',
        'Contabilidad NIIF completa',
        'Inventario multi-bodega',
        'Módulo de compras y ventas',
        '10 usuarios',
        'Soporte prioritario 24/7',
        'Reportes avanzados'
      ],
      highlighted: true,
      badge: 'Más popular',
      ctaText: 'Comenzar gratis'
    },
    {
      name: 'Enterprise',
      price: 199,
      period: '/mes',
      description: 'Para grupos empresariales',
      features: [
        'Empresas ilimitadas',
        'Todos los módulos incluidos',
        'Nómina y RRHH',
        'POS multi-caja',
        'Usuarios ilimitados',
        'Soporte dedicado',
        'Onboarding personalizado',
        'API + integraciones',
        'SLA garantizado 99.9%'
      ],
      highlighted: false,
      ctaText: 'Contactar ventas',
      contactSales: true
    }
  ];

  readonly faqItems: FaqItem[] = [
    {
      question: '¿FacturaSec está homologado con el SRI?',
      answer: 'Sí, FacturaSec está completamente homologado con el Servicio de Rentas Internas del Ecuador. Soporta todos los comprobantes electrónicos: facturas, notas de crédito, notas de débito, retenciones, guías de remisión y liquidaciones de compra, cumpliendo con la ficha técnica del SRI versión 2.21.'
    },
    {
      question: '¿Puedo probar FacturaSec antes de pagar?',
      answer: 'Absolutamente. Ofrecemos 30 días de prueba gratuita con acceso completo a todos los módulos del plan Business. No se requiere tarjeta de crédito. Al finalizar el período de prueba, puedes elegir el plan que mejor se adapte a tu empresa.'
    },
    {
      question: '¿Cómo funciona el módulo multi-empresa?',
      answer: 'Desde una sola cuenta puedes gestionar múltiples empresas (RUCs diferentes) con datos completamente aislados. Cada empresa tiene su propio inventario, contabilidad, usuarios y configuración. Puedes cambiar entre empresas en un clic y generar reportes consolidados.'
    },
    {
      question: '¿Los datos están seguros en la nube?',
      answer: 'Sí. Utilizamos infraestructura de Google Firebase con cifrado en tránsito (TLS 1.3) y en reposo. Los backups se realizan automáticamente cada 24 horas. Nuestros centros de datos están en Brasil (región más cercana a Ecuador) con redundancia geográfica.'
    },
    {
      question: '¿Qué pasa si necesito migrar mis datos desde otro sistema?',
      answer: 'Ofrecemos un servicio gratuito de migración de datos para planes Business y Enterprise. Nuestro equipo técnico se encarga de importar tu catálogo de productos, clientes, proveedores y saldos iniciales desde Excel, XML o tu sistema anterior.'
    },
    {
      question: '¿Puedo cancelar mi suscripción en cualquier momento?',
      answer: 'Sí, puedes cancelar en cualquier momento sin penalidades. Al cancelar, mantenes acceso hasta el fin del período pagado y puedes exportar todos tus datos en formatos estándar (Excel, XML, PDF) antes de que expire tu cuenta.'
    }
  ];

  readonly howSteps = [
    { icon: 'cilDescription', title: 'Crea tu cuenta',           desc: 'Regístrate gratis en menos de 2 minutos. Sin tarjeta de crédito. Acceso completo por 30 días.' },
    { icon: 'cilBuilding',    title: 'Configura tu empresa',     desc: 'Ingresa tu RUC, carga tu certificado .p12 del SRI y personaliza tu perfil de empresa.' },
    { icon: 'cilMediaPlay',   title: 'Emite tu primera factura', desc: 'Crea y autoriza tu primera factura electrónica. El SRI la recibirá automáticamente en segundos.' }
  ];

  readonly planComparison = [
    { feature: 'Empresas',               starter: '1',          business: '3',              enterprise: 'Ilimitadas' },
    { feature: 'Usuarios',               starter: '2',          business: '10',             enterprise: 'Ilimitados' },
    { feature: 'Facturación electrónica',starter: '200/mes',    business: 'Ilimitada',      enterprise: 'Ilimitada' },
    { feature: 'Contabilidad NIIF',       starter: '—',          business: '✓',              enterprise: '✓' },
    { feature: 'Inventario multi-bodega', starter: 'Básico',     business: '✓',              enterprise: '✓' },
    { feature: 'Módulo compras/ventas',   starter: '—',          business: '✓',              enterprise: '✓' },
    { feature: 'Nómina y RRHH',          starter: '—',          business: '—',              enterprise: '✓' },
    { feature: 'POS multi-caja',         starter: '—',          business: '—',              enterprise: '✓' },
    { feature: 'API + integraciones',    starter: '—',          business: '—',              enterprise: '✓' },
    { feature: 'Soporte',                starter: 'Email',       business: 'Prioritario 24/7',enterprise: 'Dedicado + SLA' },
    { feature: 'Onboarding',             starter: 'Self-service',business: 'Guiado',         enterprise: 'Personalizado' },
  ];

  readonly navLinks = [
    { label: 'Módulos', id: 'modules' },
    { label: 'Precios', id: 'pricing' },
    { label: 'Testimonios', id: 'testimonials' },
    { label: 'FAQ', id: 'faq' },
    { label: 'Contacto', id: 'contact' }
  ];

  // ─── Lifecycle ──────────────────────────────────────────────────
  ngOnInit(): void {
    this.titleService.setTitle('FacturaSec — ERP de Facturación Electrónica para Ecuador');
    this.meta.addTags([
      { name: 'description', content: 'Facturación electrónica, inventarios, contabilidad y nómina en una sola plataforma. Homologado SRI Ecuador. Prueba gratis 30 días.' },
      { property: 'og:title', content: 'FacturaSec — ERP Inteligente Ecuador' },
      { property: 'og:description', content: 'El ERP más completo para empresas ecuatorianas. SRI homologado, multi-empresa, 100% en la nube.' },
      { property: 'og:image', content: 'https://facturasec.com/assets/og-image.png' },
      { property: 'og:url', content: 'https://facturasec.com' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'FacturaSec — ERP Inteligente Ecuador' },
      { name: 'twitter:description', content: 'Facturación electrónica, inventarios y contabilidad NIIF. Homologado SRI Ecuador.' },
    ]);
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.initFadeInObserver();
    this.initStatsObserver();
    this.initSectionObserver();
  }

  ngOnDestroy(): void {
    this.fadeObserver?.disconnect();
    this.statsObserver?.disconnect();
    this.sectionObserver?.disconnect();
    this.animationFrames.forEach(id => cancelAnimationFrame(id));
  }

  // ─── Scroll handler ─────────────────────────────────────────────
  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.scrolled = window.scrollY > 60;
  }

  // ─── Navigation ─────────────────────────────────────────────────
  scrollToSection(id: string): void {
    this.mobileMenuOpen = false;
    const el = document.getElementById(id);
    if (el) {
      const offset = 80;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  // ─── FAQ ────────────────────────────────────────────────────────
  toggleFaq(index: number): void {
    if (this.openFaqIndices.has(index)) {
      this.openFaqIndices.delete(index);
    } else {
      this.openFaqIndices.add(index);
    }
  }

  isFaqOpen(index: number): boolean {
    return this.openFaqIndices.has(index);
  }

  // ─── Contact form ───────────────────────────────────────────────
  onSubmitContact(form: NgForm): void {
    if (form.invalid) { form.form.markAllAsTouched(); return; }
    if (this.formSubmitting) return;
    this.formSubmitting = true;
    this.formError = false;

    const payload = {
      service_id: 'YOUR_SERVICE_ID',
      template_id: 'YOUR_TEMPLATE_ID',
      user_id: 'YOUR_PUBLIC_KEY',
      template_params: {
        from_name: this.contactForm.name,
        from_email: this.contactForm.email,
        phone: this.contactForm.phone,
        company: this.contactForm.company,
        message: this.contactForm.message,
      }
    };

    fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(() => {
      this.formSubmitting = false;
      this.formSubmitted = true;
    })
    .catch(() => {
      this.formSubmitting = false;
      this.formError = true;
    });
  }

  // ─── IntersectionObserver: fade-in ──────────────────────────────
  private initFadeInObserver(): void {
    const options: IntersectionObserverInit = {
      threshold: 0.12,
      rootMargin: '0px 0px -60px 0px'
    };
    this.fadeObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          this.fadeObserver?.unobserve(entry.target);
        }
      });
    }, options);

    document.querySelectorAll('.fade-in').forEach(el => {
      this.fadeObserver?.observe(el);
    });
  }

  // ─── IntersectionObserver: stats counter ────────────────────────
  private initStatsObserver(): void {
    const statsSection = document.getElementById('stats-section');
    if (!statsSection) return;

    this.statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.statsAnimated) {
          this.statsAnimated = true;
          this.animateCounters();
          this.statsObserver?.disconnect();
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -50px 0px' });

    this.statsObserver.observe(statsSection);
  }

  private animateCounters(): void {
    this.stats.forEach((stat, index) => {
      const duration = 2000;
      const startTime = performance.now();
      const targetValue = stat.value;

      const tick = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = this.easeOutCubic(progress);
        const current = Math.floor(eased * targetValue);
        stat.current = current;

        if (stat.suffix === '%') {
          stat.display = (eased * targetValue).toFixed(1);
        } else if (targetValue >= 1000000) {
          stat.display = (current / 1000000).toFixed(1) + 'M';
        } else if (targetValue >= 1000) {
          stat.display = (current / 1000).toFixed(0) + 'K';
        } else {
          stat.display = current.toString();
        }

        if (progress < 1) {
          const id = requestAnimationFrame(tick);
          this.animationFrames.push(id);
        } else {
          if (stat.suffix === '%') {
            stat.display = targetValue.toString();
          } else if (targetValue >= 1000000) {
            stat.display = (targetValue / 1000000).toFixed(1) + 'M';
          } else if (targetValue >= 1000) {
            stat.display = (targetValue / 1000).toFixed(0) + 'K';
          } else {
            stat.display = targetValue.toString();
          }
        }
      };

      setTimeout(() => {
        const id = requestAnimationFrame(tick);
        this.animationFrames.push(id);
      }, index * 150);
    });
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  // ─── IntersectionObserver: active section ───────────────────────
  private initSectionObserver(): void {
    const ids = ['modules', 'pricing', 'testimonials', 'faq', 'contact'];
    this.sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.activeSection = entry.target.id;
        }
      });
    }, { threshold: 0.35 });

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) this.sectionObserver?.observe(el);
    });
  }

  // ─── Video demo modal ───────────────────────────────────────────
  openVideoDemo(): void { this.videoDemoOpen = true; document.body.style.overflow = 'hidden'; }
  closeVideoDemo(): void { this.videoDemoOpen = false; document.body.style.overflow = ''; }

  // ─── Utility ────────────────────────────────────────────────────
  getStarArray(rating: number): number[] {
    return Array(rating).fill(0);
  }
}
