import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProviderPaymentConfirmationComponent } from './provider-payment-confirmation.component';

describe('ProviderPaymentConfirmationComponent', () => {
  let component: ProviderPaymentConfirmationComponent;
  let fixture: ComponentFixture<ProviderPaymentConfirmationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ProviderPaymentConfirmationComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ProviderPaymentConfirmationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
