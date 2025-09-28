import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BcvExchangeRateComponent } from './bcv-exchange-rate.component';

describe('BcvExchangeRateComponent', () => {
  let component: BcvExchangeRateComponent;
  let fixture: ComponentFixture<BcvExchangeRateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ BcvExchangeRateComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(BcvExchangeRateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
