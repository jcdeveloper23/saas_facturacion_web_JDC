import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective,
  ButtonDirective, SpinnerComponent, AlertComponent, CalloutComponent,
  TableDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { PlatformDefaultsService } from '../../../services/platform-defaults.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { iconSubset } from '../../../../../icons/icon-subset';

@Component({
  selector: 'app-platform-sri-config',
  templateUrl: './platform-sri-config.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    RowComponent, ColComponent,
    FormLabelDirective, FormControlDirective,
    ButtonDirective, SpinnerComponent, AlertComponent, CalloutComponent,
    TableDirective,
    IconDirective
  ]
})
export class PlatformSriConfigComponent implements OnInit, OnDestroy {
  private svc = inject(PlatformDefaultsService);
  private auth = inject(AuthService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);
  private subs = new Subscription();

  loading = signal(true);
  saving = signal(false);
  errorMessage = signal('');

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  // ── Sección 1: Versiones ────────────────────────────────────────────────────
  versionsForm = this.fb.group({
    facturaVersion:     ['', Validators.required],
    notaCreditoVersion: ['', Validators.required],
    notaDebitoVersion:  ['', Validators.required],
  });

  // ── Sección 2: Endpoints WSDL ───────────────────────────────────────────────
  endpointsForm = this.fb.group({
    testingReceptionUrl:              ['', Validators.required],
    testingAuthorizationUrl:          ['', Validators.required],
    testingConsultaComprobanteUrl:    ['', Validators.required],
    testingConsultaFacturaUrl:        ['', Validators.required],
    productionReceptionUrl:           ['', Validators.required],
    productionAuthorizationUrl:       ['', Validators.required],
    productionConsultaComprobanteUrl: ['', Validators.required],
    productionConsultaFacturaUrl:     ['', Validators.required],
  });

  // ── Sección 3: Configuración General (TABLAS 2, 4 y consumidor final) ───────
  generalForm = this.fb.group({
    emissionType:                ['', Validators.required],
    testingEnvironmentCode:      ['', Validators.required],
    productionEnvironmentCode:   ['', Validators.required],
    consumidorFinalId:           ['', Validators.required],
    consumidorFinalMaxAmountUsd: [50, [Validators.required, Validators.min(0)]],
  });

  // ── Sección 4: Códigos de tipo de comprobante (TABLA 3) ────────────────────
  docCodesForm = this.fb.group({
    invoice:     ['', Validators.required],
    liquidacion: ['', Validators.required],
    creditNote:  ['', Validators.required],
    debitNote:   ['', Validators.required],
    remission:   ['', Validators.required],
    retention:   ['', Validators.required],
  });

  // ── Sección 5: Códigos de tipo de impuesto para XML (TABLA 16) ─────────────
  taxTypeCodesForm = this.fb.group({
    iva:    ['', Validators.required],
    ice:    ['', Validators.required],
    irbpnr: ['', Validators.required],
  });

  // ── Sección 6: Tax Codes IVA (TABLA 17, FormArray) ────────────────────────
  taxCodesArray = this.fb.array<FormGroup>([]);

  // ── Sección 7: Retención por impuesto (TABLA 19, FormArray) ───────────────
  retentionTaxCodesArray = this.fb.array<FormGroup>([]);

  // ── Sección 8: Retención IVA (TABLA 20, FormArray) ────────────────────────
  ivaRetentionCodesArray = this.fb.array<FormGroup>([]);

  // ── Sección 9: Formas de pago (FormArray) ─────────────────────────────────
  paymentMethodsArray = this.fb.array<FormGroup>([]);

  // ── Sección 10: Tipos de identificación (FormArray) ───────────────────────
  identificationTypesArray = this.fb.array<FormGroup>([]);

  // ── Sección 11: Códigos ICE (TABLA 18, FormArray) ─────────────────────────
  iceCodesArray = this.fb.array<FormGroup>([]);

  ngOnInit(): void {
    this.subs.add(
      this.svc.getSriPlatformConfig().subscribe({
        next: cfg => {
          if (cfg) {
            // Versiones
            this.versionsForm.patchValue({
              facturaVersion:     cfg.facturaVersion,
              notaCreditoVersion: cfg.notaCreditoVersion,
              notaDebitoVersion:  cfg.notaDebitoVersion,
            });

            // Endpoints
            this.endpointsForm.patchValue({
              testingReceptionUrl:              cfg.endpoints?.testing?.receptionUrl           ?? '',
              testingAuthorizationUrl:          cfg.endpoints?.testing?.authorizationUrl       ?? '',
              testingConsultaComprobanteUrl:    cfg.endpoints?.testing?.consultaComprobanteUrl ?? '',
              testingConsultaFacturaUrl:        cfg.endpoints?.testing?.consultaFacturaUrl     ?? '',
              productionReceptionUrl:           cfg.endpoints?.production?.receptionUrl           ?? '',
              productionAuthorizationUrl:       cfg.endpoints?.production?.authorizationUrl       ?? '',
              productionConsultaComprobanteUrl: cfg.endpoints?.production?.consultaComprobanteUrl ?? '',
              productionConsultaFacturaUrl:     cfg.endpoints?.production?.consultaFacturaUrl     ?? '',
            });

            // General
            this.generalForm.patchValue({
              emissionType:                cfg.emissionType                ?? '1',
              testingEnvironmentCode:      cfg.environmentCodes?.testing    ?? '1',
              productionEnvironmentCode:   cfg.environmentCodes?.production ?? '2',
              consumidorFinalId:           cfg.consumidorFinalId           ?? '9999999999999',
              consumidorFinalMaxAmountUsd: cfg.consumidorFinalMaxAmountUsd ?? 50,
            });

            // Doc codes
            this.docCodesForm.patchValue({
              invoice:     cfg.documentTypeCodes?.invoice     ?? '',
              liquidacion: cfg.documentTypeCodes?.liquidacion ?? '',
              creditNote:  cfg.documentTypeCodes?.creditNote  ?? '',
              debitNote:   cfg.documentTypeCodes?.debitNote   ?? '',
              remission:   cfg.documentTypeCodes?.remission   ?? '',
              retention:   cfg.documentTypeCodes?.retention   ?? '',
            });

            // Tax type codes
            this.taxTypeCodesForm.patchValue({
              iva:    cfg.taxTypeCodes?.iva    ?? '2',
              ice:    cfg.taxTypeCodes?.ice    ?? '3',
              irbpnr: cfg.taxTypeCodes?.irbpnr ?? '5',
            });

            // Tax codes IVA
            while (this.taxCodesArray.length) { this.taxCodesArray.removeAt(0); }
            (cfg.taxCodes ?? []).forEach(t =>
              this.taxCodesArray.push(this.fb.group({
                vatPct:   [t.vatPct],
                sriCode:  [t.sriCode],
                name:     [t.name],
                isExempt: [t.isExempt ?? false],
              }))
            );

            // Retention tax codes
            while (this.retentionTaxCodesArray.length) { this.retentionTaxCodesArray.removeAt(0); }
            (cfg.retentionTaxCodes ?? []).forEach(r =>
              this.retentionTaxCodesArray.push(this.fb.group({
                taxName:  [r.taxName],
                taxLabel: [r.taxLabel],
                code:     [r.code],
              }))
            );

            // IVA retention codes
            while (this.ivaRetentionCodesArray.length) { this.ivaRetentionCodesArray.removeAt(0); }
            (cfg.ivaRetentionCodes ?? []).forEach(r =>
              this.ivaRetentionCodesArray.push(this.fb.group({
                pct:         [r.pct],
                code:        [r.code],
                description: [r.description],
              }))
            );

            // Payment methods
            while (this.paymentMethodsArray.length) { this.paymentMethodsArray.removeAt(0); }
            (cfg.paymentMethodCodes ?? []).forEach(p =>
              this.paymentMethodsArray.push(this.fb.group({
                code: [p.code],
                name: [p.name],
              }))
            );

            // Identification types
            while (this.identificationTypesArray.length) { this.identificationTypesArray.removeAt(0); }
            (cfg.identificationTypes ?? []).forEach(t =>
              this.identificationTypesArray.push(this.fb.group({
                code:      [t.code],
                name:      [t.name],
                isRuc:     [t.isRuc     ?? false],
                isCedula:  [t.isCedula  ?? false],
                isFinal:   [t.isFinal   ?? false],
              }))
            );

            // ICE codes
            while (this.iceCodesArray.length) { this.iceCodesArray.removeAt(0); }
            (cfg.iceCodes ?? []).forEach(c =>
              this.iceCodesArray.push(this.fb.group({
                code:           [c.code],
                description:    [c.description],
                adValoremPct:   [c.adValoremPct   ?? null],
                especificaUsd:  [c.especificaUsd  ?? null],
              }))
            );
          }
          this.loading.set(false);
        },
        error: err => {
          console.error('[PlatformSriConfig] load error:', err);
          this.notifications.error('Error al cargar la configuración SRI');
          this.loading.set(false);
        }
      })
    );
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  // ── Tax Codes IVA helpers ───────────────────────────────────────────────────
  addTaxCode(): void {
    if (this.taxCodesArray.length >= 15) { return; }
    this.taxCodesArray.push(this.fb.group({ vatPct: [0], sriCode: [''], name: [''], isExempt: [false] }));
  }
  removeTaxCode(i: number): void { this.taxCodesArray.removeAt(i); }

  // ── Retention Tax Codes helpers ─────────────────────────────────────────────
  addRetentionTaxCode(): void {
    this.retentionTaxCodesArray.push(this.fb.group({ taxName: [''], taxLabel: [''], code: [''] }));
  }
  removeRetentionTaxCode(i: number): void { this.retentionTaxCodesArray.removeAt(i); }

  // ── IVA Retention Codes helpers ─────────────────────────────────────────────
  addIvaRetentionCode(): void {
    this.ivaRetentionCodesArray.push(this.fb.group({ pct: [0], code: [''], description: [''] }));
  }
  removeIvaRetentionCode(i: number): void { this.ivaRetentionCodesArray.removeAt(i); }

  // ── Payment Methods helpers ─────────────────────────────────────────────────
  addPaymentMethod(): void {
    this.paymentMethodsArray.push(this.fb.group({ code: [''], name: [''] }));
  }
  removePaymentMethod(i: number): void { this.paymentMethodsArray.removeAt(i); }

  // ── Identification Types helpers ────────────────────────────────────────────
  addIdentificationType(): void {
    this.identificationTypesArray.push(this.fb.group({ code: [''], name: [''], isRuc: [false], isCedula: [false], isFinal: [false] }));
  }
  removeIdentificationType(i: number): void { this.identificationTypesArray.removeAt(i); }

  // ── ICE Codes helpers ───────────────────────────────────────────────────────
  addIceCode(): void {
    this.iceCodesArray.push(this.fb.group({ code: [''], description: [''], adValoremPct: [null], especificaUsd: [null] }));
  }
  removeIceCode(i: number): void { this.iceCodesArray.removeAt(i); }

  // ── Save ────────────────────────────────────────────────────────────────────
  async onSave(): Promise<void> {
    this.versionsForm.markAllAsTouched();
    this.endpointsForm.markAllAsTouched();
    this.generalForm.markAllAsTouched();
    this.docCodesForm.markAllAsTouched();
    this.taxTypeCodesForm.markAllAsTouched();

    if (
      this.versionsForm.invalid ||
      this.endpointsForm.invalid ||
      this.generalForm.invalid  ||
      this.docCodesForm.invalid ||
      this.taxTypeCodesForm.invalid
    ) { return; }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      const vv = this.versionsForm.getRawValue();
      const ev = this.endpointsForm.getRawValue();
      const gv = this.generalForm.getRawValue();
      const dc = this.docCodesForm.getRawValue();
      const tt = this.taxTypeCodesForm.getRawValue();

      await this.svc.saveSriPlatformConfig(
        {
          facturaVersion:     vv.facturaVersion!,
          notaCreditoVersion: vv.notaCreditoVersion!,
          notaDebitoVersion:  vv.notaDebitoVersion!,

          endpoints: {
            testing: {
              receptionUrl:           ev.testingReceptionUrl!,
              authorizationUrl:       ev.testingAuthorizationUrl!,
              consultaComprobanteUrl: ev.testingConsultaComprobanteUrl!,
              consultaFacturaUrl:     ev.testingConsultaFacturaUrl!,
            },
            production: {
              receptionUrl:           ev.productionReceptionUrl!,
              authorizationUrl:       ev.productionAuthorizationUrl!,
              consultaComprobanteUrl: ev.productionConsultaComprobanteUrl!,
              consultaFacturaUrl:     ev.productionConsultaFacturaUrl!,
            },
          },

          emissionType: gv.emissionType!,
          environmentCodes: {
            testing:    gv.testingEnvironmentCode!,
            production: gv.productionEnvironmentCode!,
          },
          consumidorFinalId:           gv.consumidorFinalId!,
          consumidorFinalMaxAmountUsd: Number(gv.consumidorFinalMaxAmountUsd),

          documentTypeCodes: {
            invoice:     dc.invoice!,
            liquidacion: dc.liquidacion!,
            creditNote:  dc.creditNote!,
            debitNote:   dc.debitNote!,
            remission:   dc.remission!,
            retention:   dc.retention!,
          },

          taxTypeCodes: {
            iva:    tt.iva!,
            ice:    tt.ice!,
            irbpnr: tt.irbpnr!,
          },

          taxCodes: this.taxCodesArray.getRawValue().map(t => ({
            vatPct:   Number(t['vatPct']),
            sriCode:  t['sriCode']  as string,
            name:     t['name']     as string,
            isExempt: t['isExempt'] as boolean,
          })),

          retentionTaxCodes: this.retentionTaxCodesArray.getRawValue().map(r => ({
            taxName:  r['taxName']  as string,
            taxLabel: r['taxLabel'] as string,
            code:     r['code']     as string,
          })),

          ivaRetentionCodes: this.ivaRetentionCodesArray.getRawValue().map(r => ({
            pct:         Number(r['pct']),
            code:        r['code']        as string,
            description: r['description'] as string,
          })),

          paymentMethodCodes: this.paymentMethodsArray.getRawValue().map(p => ({
            code: p['code'] as string,
            name: p['name'] as string,
          })),

          identificationTypes: this.identificationTypesArray.getRawValue().map(t => ({
            code:      t['code']     as string,
            name:      t['name']     as string,
            isRuc:     t['isRuc']    as boolean,
            isCedula:  t['isCedula'] as boolean,
            isFinal:   t['isFinal']  as boolean,
          })),

          iceCodes: this.iceCodesArray.getRawValue().map(c => ({
            code:          c['code']          as string,
            description:   c['description']   as string,
            adValoremPct:  c['adValoremPct']  != null ? Number(c['adValoremPct'])  : undefined,
            especificaUsd: c['especificaUsd'] != null ? Number(c['especificaUsd']) : undefined,
          })),
        },
        this.auth.user()?.uid ?? ''
      );
      this.notifications.success('Configuración SRI guardada correctamente');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      this.errorMessage.set(msg);
    } finally {
      this.saving.set(false);
    }
  }

  hasError(form: FormGroup, field: string): boolean {
    const c = form.get(field);
    return !!(c?.invalid && c?.touched);
  }

  trackByIndex(i: number): number { return i; }
}
