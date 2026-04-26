# 📋 Plan de Mejoras — Landing Page FacturaSec

> **Versión:** 1.0  
> **Fecha:** Abril 2025  
> **Archivos objetivo:**
> - `src/app/views/landing/landing.component.html`
> - `src/app/views/landing/landing.component.ts`
> - `src/app/views/landing/landing.component.scss`

---

## Resumen ejecutivo

El landing tiene una base visual sólida con buena estructura de secciones (Hero → Stats → Módulos → Features → Precios → Testimonios → FAQ → Contacto → Footer) y animaciones funcionales. Sin embargo, existen problemas críticos que afectan la **captación de leads**, la **credibilidad** y la **experiencia de usuario** que deben corregirse antes de una campaña de marketing real.

---

## 🔴 FASE 0 — Correcciones Críticas Encontradas en Revisión (25 Abril 2025)

> Problemas adicionales detectados en revisión del 25 de Abril. Ejecutar junto con Fase 1.

---

### 0.1 "Prueba gratis" y "Registrarse" apuntan a `/login` en vez de `/register`

**Problema:** Un usuario nuevo que hace clic en "Prueba gratis" (navbar, hero, mobile panel) o "Registrarse" (footer) llega al login, no al registro. Impacto directo en conversión.

**Archivos afectados (`landing.component.html`):**
```html
<!-- línea 19 — navbar desktop -->
<a routerLink="/register" class="btn-solid">Prueba gratis</a>

<!-- línea 38 — mobile panel -->
<a routerLink="/register" class="solid" (click)="mobileMenuOpen=false">Prueba gratis — 30 días</a>

<!-- línea 66 — hero CTA -->
<a routerLink="/register" class="btn-hero-cta">🚀 Comenzar gratis — sin tarjeta</a>

<!-- línea 402 — footer -->
<li><a routerLink="/register">Registrarse</a></li>
```

**Estimación:** 10 minutos

---

### 0.2 Agregar campo "Teléfono/WhatsApp" al formulario de contacto

**Problema:** `contactForm` solo tiene nombre, email, empresa, mensaje. Para el mercado ecuatoriano el seguimiento de ventas se hace por WhatsApp; sin teléfono no se puede contactar al lead.

**Cambios en `landing.component.ts`:**
```typescript
contactForm = { name: '', email: '', phone: '', company: '', message: '' };
```

**Nuevo campo en `landing.component.html` (después del campo email):**
```html
<div class="fg">
  <label>Teléfono / WhatsApp</label>
  <input type="tel" placeholder="+593 99 XXX XXXX"
         [(ngModel)]="contactForm.phone" name="phone" />
</div>
```

**Estimación:** 20 minutos

---

### 0.3 Agregar validación visual al formulario de contacto

**Problema:** El formulario usa `#cf="ngForm"` pero nunca muestra errores. El usuario puede enviar campos vacíos sin feedback. Al integrar el backend real (1.1), se enviarían datos incompletos.

**Cambios clave:**
- Agregar `#nameField="ngModel"` y `#emailField="ngModel"` con `[class.invalid]`
- Mostrar `<span class="fg-error">` cuando campo inválido y tocado
- `onSubmitContact(form: NgForm)` debe llamar `form.form.markAllAsTouched()` si inválido y retornar

**Estilos en `landing.component.scss`:**
```scss
.fg {
  input.invalid, textarea.invalid { border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.09); }
  .fg-error { display: block; font-size: 0.76rem; color: #ef4444; margin-top: 4px; }
}
```

**Estimación:** 45 minutos

---

### 0.4 Corregir breakpoint del grid de precios en tablets

**Problema:** A `max-width: 1100px` el grid pasa a `1fr` con `max-width: 400px`. En iPads y tablets las cards se ven muy estrechas.

**Cambio en `landing.component.scss`:**
```scss
// ANTES
@media (max-width: 1100px) {
  .pricing-grid { grid-template-columns: 1fr; max-width: 400px; margin: 0 auto; }
}

// DESPUÉS
@media (max-width: 1100px) {
  .pricing-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
}
```

**Estimación:** 10 minutos

---

## 🔴 FASE 1 — Alta Prioridad (Conversión & Credibilidad)

> Estas mejoras deben ejecutarse **antes** de cualquier campaña de marketing o lanzamiento público.

---

### 1.1 Conectar formulario de contacto a un backend real

**Problema:** `onSubmitContact()` solo simula un delay de 1500ms. Los leads se pierden completamente.

**Solución propuesta:** Integrar con Firebase Functions + Nodemailer o EmailJS (sin backend propio).

**Cambios en `landing.component.ts`:**
```typescript
// Opción A: EmailJS (sin backend)
import emailjs from '@emailjs/browser';

onSubmitContact(): void {
  if (this.formSubmitting) return;
  this.formSubmitting = true;

  emailjs.send('SERVICE_ID', 'TEMPLATE_ID', {
    from_name: this.contactForm.name,
    from_email: this.contactForm.email,
    company: this.contactForm.company,
    message: this.contactForm.message,
  }, 'PUBLIC_KEY')
  .then(() => {
    this.formSubmitting = false;
    this.formSubmitted = true;
  })
  .catch(() => {
    this.formSubmitting = false;
    // mostrar mensaje de error
  });
}
```

**Dependencias:**
```bash
npm install @emailjs/browser
```

**Estimación:** 2–3 horas

---

### 1.2 Corregir CTA del plan Enterprise

**Problema:** El botón "Contactar ventas" del plan Enterprise apunta a `/login` en lugar de al formulario de contacto.

**Cambios en `landing.component.html` (línea 275):**
```html
<!-- ANTES -->
<a routerLink="/login" class="pc-cta" [class.pc-cta-white]="plan.highlighted">
  {{ plan.ctaText }}
</a>

<!-- DESPUÉS -->
<a *ngIf="!plan.contactSales" routerLink="/login" class="pc-cta" [class.pc-cta-white]="plan.highlighted">
  {{ plan.ctaText }}
</a>
<button *ngIf="plan.contactSales" class="pc-cta" [class.pc-cta-white]="plan.highlighted"
        (click)="scrollToSection('contact')">
  {{ plan.ctaText }}
</button>
```

**Cambios en `landing.component.ts` (interfaz `PricingPlan`):**
```typescript
interface PricingPlan {
  // ... campos existentes
  contactSales?: boolean;  // ← AGREGAR
}

// En el plan Enterprise:
{
  name: 'Enterprise',
  contactSales: true,   // ← AGREGAR
  ctaText: 'Contactar ventas',
  // ...
}
```

**Estimación:** 30 minutos

---

### 1.3 Agregar botón flotante de WhatsApp

**Problema:** Para el mercado ecuatoriano, WhatsApp es el canal de ventas principal. No existe ningún medio de contacto inmediato.

**Nuevo elemento en `landing.component.html` (antes del cierre de `</div><!-- /.lp -->`):**
```html
<!-- ═══ WHATSAPP FLOTANTE ══════════════════════════════════════════════ -->
<a class="whatsapp-fab"
   href="https://wa.me/593XXXXXXXXX?text=Hola%2C%20quiero%20información%20sobre%20FacturaSec"
   target="_blank"
   rel="noopener noreferrer"
   aria-label="Contactar por WhatsApp">
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967c-.273-.099-.471-.148-.67.15c-.197.297-.767.966-.94 1.164c-.173.199-.347.223-.644.075c-.297-.15-1.255-.463-2.39-1.475c-.883-.788-1.48-1.761-1.653-2.059c-.173-.297-.018-.458.13-.606c.134-.133.298-.347.446-.52c.149-.174.198-.298.298-.497c.099-.198.05-.371-.025-.52c-.075-.149-.669-1.612-.916-2.207c-.242-.579-.487-.5-.669-.51c-.173-.008-.371-.01-.57-.01c-.198 0-.52.074-.792.372c-.272.297-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074c.149.198 2.096 3.2 5.077 4.487c.709.306 1.262.489 1.694.625c.712.227 1.36.195 1.871.118c.571-.085 1.758-.719 2.006-1.413c.248-.694.248-1.289.173-1.413c-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214l-3.741.982l.998-3.648l-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884c2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
</a>
```

**Nuevo estilo en `landing.component.scss`:**
```scss
.whatsapp-fab {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 900;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: #25D366;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(37, 211, 102, 0.45);
  transition: all 0.28s;

  svg { width: 28px; height: 28px; }

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 8px 30px rgba(37, 211, 102, 0.6);
  }
}
```

**Estimación:** 1 hora

---

### 1.4 Corregir links de redes sociales y legales

**Problema:** Todos los `href="#"` en redes sociales y links legales dañan la credibilidad.

**Cambios en `landing.component.html`:**
```html
<!-- Redes sociales — reemplazar con URLs reales o eliminar hasta tenerlos -->
<a href="https://linkedin.com/company/facturasec" target="_blank" rel="noopener" aria-label="LinkedIn">in</a>
<a href="https://twitter.com/facturasec" target="_blank" rel="noopener" aria-label="Twitter/X">𝕏</a>
<a href="https://facebook.com/facturasec" target="_blank" rel="noopener" aria-label="Facebook">f</a>

<!-- Links legales — crear rutas o apuntar a PDFs -->
<li><a routerLink="/legal/terminos">Términos de uso</a></li>
<li><a routerLink="/legal/privacidad">Privacidad</a></li>
<li><a routerLink="/legal/aviso">Aviso legal</a></li>
```

**Estimación:** 30 minutos (+ tiempo de crear páginas legales)

---

### 1.5 Agregar teléfono/WhatsApp en sección de contacto y footer

**Cambios en `landing.component.html` (sección `contact-items`):**
```html
<div class="ci">
  <span>📱</span>
  <div>
    <strong>WhatsApp / Teléfono</strong>
    <small>+593 99 XXX XXXX · Lun–Vie 8:00–18:00</small>
  </div>
</div>
```

**Footer (columna Contacto):**
```html
<li><a href="tel:+593XXXXXXXXX">+593 99 XXX XXXX</a></li>
```

**Estimación:** 30 minutos

---

## 🟡 FASE 2 — Media Prioridad (UX & Retención)

> Implementar dentro de las primeras 2 semanas post-lanzamiento.

---

### 2.1 Añadir sección "Cómo funciona" (3 pasos)

**Problema:** No hay una sección que explique el flujo de incorporación. El visitante no sabe qué pasa después de hacer clic en "Comenzar gratis".

**Nueva sección en `landing.component.html` (después de `lp-modules`, antes de `lp-feature`):**
```html
<!-- ═══ CÓMO FUNCIONA ════════════════════════════════════════════════ -->
<section class="lp-how" id="how-it-works">
  <div class="lp-container">
    <div class="sec-head fade-in">
      <span class="sec-tag">Proceso simple</span>
      <h2>Empieza en 3 pasos</h2>
      <p>Sin instalaciones, sin contratos. Configura tu empresa y emite tu primera factura hoy.</p>
    </div>
    <div class="how-steps">
      <div class="how-step fade-in" *ngFor="let step of howSteps; let i = index">
        <div class="how-num">{{ i + 1 }}</div>
        <div class="how-icon">{{ step.icon }}</div>
        <h3>{{ step.title }}</h3>
        <p>{{ step.desc }}</p>
      </div>
    </div>
  </div>
</section>
```

**Datos en `landing.component.ts`:**
```typescript
readonly howSteps = [
  {
    icon: '📝',
    title: 'Crea tu cuenta',
    desc: 'Regístrate gratis en menos de 2 minutos. Sin tarjeta de crédito. Acceso completo por 30 días.'
  },
  {
    icon: '🏢',
    title: 'Configura tu empresa',
    desc: 'Ingresa tu RUC, carga tu certificado .p12 del SRI y personaliza tu perfil de empresa.'
  },
  {
    icon: '🚀',
    title: 'Emite tu primera factura',
    desc: 'Crea y autoriza tu primera factura electrónica. El SRI la recibirá automáticamente en segundos.'
  }
];
```

**Estimación:** 3 horas

---

### 2.2 Añadir más testimonios y mejorar su diseño

**Problema:** Solo 3 testimonios, todos de 5 estrellas y sin verificación. No genera confianza suficiente.

**Mejoras:**
- Añadir 3 testimonios adicionales (6 en total)
- Incluir cargo, sector y ciudad
- Agregar fecha del testimonio
- Cambiar `testi-av` de iniciales a gradientes únicos por persona
- Añadir variedad de rating (al menos uno de 4/5)

**Estimación:** 2 horas

---

### 2.3 Implementar Active Section en navbar

**Problema:** Al hacer scroll, el usuario no sabe en qué sección está. Los links del navbar no tienen indicador activo.

**Cambios en `landing.component.ts`:**
```typescript
activeSection = '';
private sectionObserver?: IntersectionObserver;

// En ngAfterViewInit:
this.initSectionObserver();

private initSectionObserver(): void {
  const sections = ['modules', 'pricing', 'testimonials', 'faq', 'contact'];
  this.sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        this.activeSection = entry.target.id;
      }
    });
  }, { threshold: 0.4 });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) this.sectionObserver?.observe(el);
  });
}
```

**Cambios en `landing.component.html` (navLinks):**
```html
<button (click)="scrollToSection(link.id)" [class.active]="activeSection === link.id">
  {{ link.label }}
</button>
```

**Estimación:** 2 horas

---

### 2.4 Añadir video demo embed

**Problema:** El mockup del hero es CSS puro. Los usuarios no pueden ver el producto real en acción.

**Nueva sección o modal:**
```html
<!-- Botón en hero -->
<button class="btn-hero-ghost" (click)="openVideoDemo()">▶ Ver demo en vivo</button>

<!-- Modal de video -->
<div class="video-modal" [class.open]="videoDemoOpen" (click)="closeVideoDemo()">
  <div class="video-wrap" (click)="$event.stopPropagation()">
    <button class="video-close" (click)="closeVideoDemo()">✕</button>
    <iframe *ngIf="videoDemoOpen"
            src="https://www.youtube.com/embed/VIDEO_ID?autoplay=1"
            allow="autoplay; encrypted-media"
            allowfullscreen>
    </iframe>
  </div>
</div>
```

**Estimación:** 3 horas (incluyendo grabar/conseguir video)

---

### 2.5 Corregir threshold del observer de stats

**Problema:** `threshold: 0.4` puede ser demasiado alto en móviles, haciendo que el contador nunca se dispare.

**Cambio en `landing.component.ts` (línea 357):**
```typescript
// ANTES
}, { threshold: 0.4 });

// DESPUÉS
}, { threshold: 0.2, rootMargin: '0px 0px -50px 0px' });
```

**Estimación:** 15 minutos

---

### 2.6 Añadir comparativa visual de planes (tabla)

**Problema:** La diferencia entre planes Starter, Business y Enterprise no es inmediatamente clara en las cards.

**Agregar debajo del grid de precios:**
```html
<div class="plan-compare fade-in">
  <h3>Comparativa detallada</h3>
  <table>
    <thead>
      <tr>
        <th>Característica</th>
        <th>Starter</th>
        <th>Business</th>
        <th>Enterprise</th>
      </tr>
    </thead>
    <tbody>
      <tr *ngFor="let row of planComparison">
        <td>{{ row.feature }}</td>
        <td [innerHTML]="row.starter"></td>
        <td [innerHTML]="row.business"></td>
        <td [innerHTML]="row.enterprise"></td>
      </tr>
    </tbody>
  </table>
</div>
```

**Estimación:** 4 horas

---

## 🟢 FASE 3 — Baja Prioridad (SEO, Accesibilidad & Calidad de Código)

> Mejoras de largo plazo para optimización continua.

---

### 3.1 Añadir meta tags de SEO (Open Graph, Twitter Card)

**Cambios en `landing.component.ts`:**
```typescript
import { Meta, Title } from '@angular/platform-browser';

// Inyectar en constructor:
private meta = inject(Meta);
private titleService = inject(Title);

ngOnInit(): void {
  this.titleService.setTitle('FacturaSec — ERP de Facturación Electrónica para Ecuador');
  this.meta.addTags([
    { name: 'description', content: 'Facturación electrónica, inventarios, contabilidad y nómina en una sola plataforma. Homologado SRI Ecuador. Prueba gratis 30 días.' },
    { property: 'og:title', content: 'FacturaSec — ERP Inteligente Ecuador' },
    { property: 'og:description', content: 'El ERP más completo para empresas ecuatorianas. SRI homologado, multi-empresa, 100% en la nube.' },
    { property: 'og:image', content: 'https://facturasec.com/assets/og-image.png' },
    { property: 'og:url', content: 'https://facturasec.com' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ]);
}
```

**Estimación:** 1 hora

---

### 3.2 Mejorar accesibilidad del hamburger y FAQ

**Cambios en `landing.component.html`:**
```html
<!-- Hamburger -->
<button class="hamburger"
        (click)="toggleMobileMenu()"
        [class.is-open]="mobileMenuOpen"
        aria-label="Menú de navegación"
        [attr.aria-expanded]="mobileMenuOpen"
        [attr.aria-controls]="'mobile-panel'">
  <span></span><span></span><span></span>
</button>

<!-- FAQ items -->
<button class="faq-q"
        (click)="toggleFaq(item)"
        [attr.aria-expanded]="item.open"
        [attr.id]="'faq-btn-' + i"
        [attr.aria-controls]="'faq-ans-' + i">
```

**Estimación:** 1 hora

---

### 3.3 Refactorizar estado del FAQ (anti-patrón)

**Problema:** `readonly faqItems` se muta directamente con `item.open = !item.open`.

**Cambio en `landing.component.ts`:**
```typescript
// Reemplazar la propiedad open en FaqItem por un Set externo:
openFaqIndices = new Set<number>();

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
```

**Estimación:** 1 hora

---

### 3.4 Reemplazar Trust Bar con logos de clientes o certificaciones

**Problema:** Mostrar "Firebase", "Angular 17+" es información para desarrolladores, no para dueños de empresa.

**Alternativa sugerida:**
- Logos de clientes conocidos (con permiso)
- Sello de homologación SRI con número de resolución
- Certificación ISO/seguridad si aplica
- Rating de Google Reviews / Trustpilot

**Estimación:** 2–3 horas (depende de conseguir logos con permiso)

---

### 3.5 Corregir `max-height` del FAQ

**Cambio en `landing.component.scss` (línea 1126):**
```scss
// ANTES
&.open { max-height: 300px; }

// DESPUÉS — más amplio para respuestas largas
&.open { max-height: 600px; }
```

**Estimación:** 5 minutos

---

### 3.6 Mejorar grid de testimonios para escalabilidad

**Cambio en `landing.component.scss` (línea 1036):**
```scss
// ANTES
.testi-grid {
  grid-template-columns: repeat(3, 1fr);
}

// DESPUÉS — escala automáticamente con más tarjetas
.testi-grid {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}
```

**Estimación:** 10 minutos

---

## 📊 Resumen y cronograma

| Fase | Mejoras | Estimación total | Prioridad |
|------|---------|-----------------|-----------|
| 🔴 Fase 0 | 0.1 a 0.4 | ~1.5 horas | Junto con Fase 1 |
| 🔴 Fase 1 | 1.1 a 1.5 | 4–6 horas | Antes del lanzamiento |
| 🟡 Fase 2 | 2.1 a 2.6 | 14–16 horas | Semanas 1–2 post lanzamiento |
| 🟢 Fase 3 | 3.1 a 3.6 | 6–8 horas | Mes 1–2 post lanzamiento |

**Total estimado:** 26–32 horas de desarrollo

---

## ✅ Checklist de seguimiento

### Fase 0 — Correcciones adicionales
- [x] 0.1 Corregir rutas "Prueba gratis" y "Registrarse" → `/register`
- [x] 0.2 Agregar campo Teléfono/WhatsApp al formulario de contacto
- [x] 0.3 Agregar validación visual al formulario (campos requeridos)
- [x] 0.4 Corregir breakpoint grid de precios en tablets

### Fase 1 — Crítica
- [ ] 1.1 Conectar formulario a backend real — **pendiente: configurar credenciales EmailJS** (`YOUR_SERVICE_ID`, `YOUR_TEMPLATE_ID`, `YOUR_PUBLIC_KEY` en `onSubmitContact()`)
- [x] 1.2 Corregir CTA del plan Enterprise (→ `scrollToSection('contact')`)
- [x] 1.3 Añadir botón flotante de WhatsApp
- [x] 1.4 Corregir links de redes sociales y legales (código listo; **pendiente: crear páginas `/legal/terminos`, `/legal/privacidad`, `/legal/aviso`**)
- [x] 1.5 Añadir teléfono en sección contacto y footer ✓ número actualizado por el usuario

### Fase 2 — Media
- [x] 2.1 Sección "Cómo funciona" (3 pasos)
- [x] 2.2 Ampliar y mejorar testimonios (6 total, con variedad)
- [x] 2.3 Active section en navbar (IntersectionObserver)
- [ ] 2.4 Modal de video demo — **pendiente: reemplazar `.video-placeholder` con `<iframe>` de YouTube cuando haya video**
- [x] 2.5 Bajar threshold del observer de stats a 0.2
- [x] 2.6 Tabla comparativa de planes

### Fase 3 — Baja
- [x] 3.1 Meta tags SEO / Open Graph
- [x] 3.2 Accesibilidad: aria-label, aria-expanded en hamburger y FAQ
- [x] 3.3 Refactorizar estado del FAQ (usar `Set<number>`)
- [x] 3.4 Reemplazar Trust Bar con contenido orientado al cliente
- [x] 3.5 Corregir max-height FAQ (300px → 600px)
- [x] 3.6 Grid testimonios responsive con `auto-fill`

---

## 🔴 FASE 4 — Calidad visual & Páginas legales (Agregado 25 Abril 2025)

---

### 4.1 Reemplazar emojis por iconos del sistema CoreUI

**Problema:** La landing usa emojis del sistema operativo que varían por plataforma (iOS vs Android vs Windows). Los iconos CoreUI son consistentes, escalables y alineados con el resto del ERP.

**Patrón de uso:** `<svg cIcon name="cilIconName"></svg>` — requiere `IconDirective` de `@coreui/icons-angular` en el array imports del componente.

**Mapeo emoji → icono:**
| Contexto | Emoji | Icono CoreUI |
|---|---|---|
| Hero trust badges | ✅ | `cilCheckCircle` |
| Hero floating badges | ✅ / 🏢 | `cilCheckCircle` / `cilBuilding` |
| Hero ghost button | ▶ | `cilMediaPlay` |
| Trust bar | 🏛️ ⭐ 🔒 ☁️ ⚡ | `cilShieldAlt` `cilStar` `cilLockLocked` `cilCloudDownload` `cilBolt` |
| Stats | 🏢 📄 ⚡ 🎯 | `cilBuilding` `cilFile` `cilBolt` `cilSpeedometer` |
| Módulos (8) | 📄 📊 📦 🛒 💼 👥 🏪 🏢 | `cilDescription` `cilChartPie` `cilLayers` `cilCart` `cilBriefcase` `cilPeople` `cilScreenDesktop` `cilBuilding` |
| Feature list ✅ | ✅ | `cilCheck` |
| Contact items | ⚡ 🔒 🤝 📱 | `cilBolt` `cilLockLocked` `cilPeople` `cilScreenSmartphone` |
| How steps | 📝 🏢 🚀 | `cilDescription` `cilBuilding` `cilMediaPlay` |
| Form ok | ✅ grande | `cilCheckCircle` |
| Form error | ⚠️ | `cilWarning` |
| Video modal | ▶ | `cilMediaPlay` |
| Hero CTA | 🚀 | eliminado |
| Excluidos | 🇪🇨 pill, mockup sidebar, SRI mock | sin cambio (decorativo/bandera) |

**Estimación:** 3 horas

---

### 4.2 Crear páginas legales

**Problema:** Los links `/legal/terminos`, `/legal/privacidad`, `/legal/aviso` del footer apuntan a rutas que no existen.

**Archivos a crear:**
- `src/app/views/legal/legal-terminos.component.ts + .html + .scss`
- `src/app/views/legal/legal-privacidad.component.ts + .html + .scss`
- `src/app/views/legal/legal-aviso.component.ts + .html + .scss`

**Ruta sugerida en router:** Vista pública (sin auth guard), mismo layout que landing o layout mínimo con navbar y footer compartido.

**Estimación:** 4–6 horas (dependiendo de contenido legal real)

---

## ✅ Checklist de seguimiento

### Fase 0 — Correcciones adicionales
- [x] 0.1 Corregir rutas "Prueba gratis" y "Registrarse" → `/register`
- [x] 0.2 Agregar campo Teléfono/WhatsApp al formulario de contacto
- [x] 0.3 Agregar validación visual al formulario (campos requeridos)
- [x] 0.4 Corregir breakpoint grid de precios en tablets

### Fase 1 — Crítica
- [ ] 1.1 Conectar formulario a backend real — **pendiente: configurar credenciales EmailJS** (`YOUR_SERVICE_ID`, `YOUR_TEMPLATE_ID`, `YOUR_PUBLIC_KEY` en `onSubmitContact()`)
- [x] 1.2 Corregir CTA del plan Enterprise (→ `scrollToSection('contact')`)
- [x] 1.3 Añadir botón flotante de WhatsApp
- [x] 1.4 Corregir links de redes sociales y legales (código listo; **pendiente: crear páginas `/legal/...`**)
- [x] 1.5 Añadir teléfono en sección contacto y footer ✓ número actualizado

### Fase 2 — Media
- [x] 2.1 Sección "Cómo funciona" (3 pasos)
- [x] 2.2 Ampliar y mejorar testimonios (6 total, con variedad)
- [x] 2.3 Active section en navbar (IntersectionObserver)
- [ ] 2.4 Modal de video demo — **pendiente: reemplazar `.video-placeholder` con `<iframe>` de YouTube**
- [x] 2.5 Bajar threshold del observer de stats a 0.2
- [x] 2.6 Tabla comparativa de planes

### Fase 3 — Baja
- [x] 3.1 Meta tags SEO / Open Graph
- [x] 3.2 Accesibilidad: aria-label, aria-expanded en hamburger y FAQ
- [x] 3.3 Refactorizar estado del FAQ (usar `Set<number>`)
- [x] 3.4 Reemplazar Trust Bar con contenido orientado al cliente
- [x] 3.5 Corregir max-height FAQ (300px → 600px)
- [x] 3.6 Grid testimonios responsive con `auto-fill`

### Fase 4 — Calidad visual & Legal
- [x] 4.1 Reemplazar emojis por iconos CoreUI
- [x] 4.2 Crear páginas legales (`/legal/terminos`, `/legal/privacidad`, `/legal/aviso`)

---

## ⏳ Pendientes manuales (requieren acción externa)

| # | Tarea | Acción requerida |
|---|-------|-----------------|
| 1 | EmailJS (formulario de contacto) | Crear cuenta en emailjs.com, configurar servicio + template, reemplazar las 3 constantes en `onSubmitContact()` |
| 2 | Video demo (modal) | Grabar/conseguir video, subir a YouTube, reemplazar `.video-placeholder` con `<iframe src="https://www.youtube.com/embed/VIDEO_ID?autoplay=1">` |
| 3 | Páginas legales | ~~Crear vistas para `/legal/terminos`, `/legal/privacidad`, `/legal/aviso`~~ ✓ Completado |

---

*Documento generado el 24 de Abril de 2025 — v1.3 actualizado el 25 de Abril de 2025 — FacturaSec Landing Analysis*
