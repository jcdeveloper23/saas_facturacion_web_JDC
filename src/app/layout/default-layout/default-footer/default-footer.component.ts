import { Component, computed, inject } from '@angular/core';
import { FooterComponent } from '@coreui/angular';
import { TenantService } from '../../../core/services/tenant.service';

@Component({
  selector: 'app-default-footer',
  templateUrl: './default-footer.component.html',
  styleUrls: ['./default-footer.component.scss'],
  imports: []
})
export class DefaultFooterComponent extends FooterComponent {
  readonly #tenantService = inject(TenantService);

  readonly companyName = computed(() => this.#tenantService.company?.name ?? 'FacturaSec');
  readonly currentYear = new Date().getFullYear();

  constructor() {
    super();
  }
}
