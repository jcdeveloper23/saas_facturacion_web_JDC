import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProviderDeliverOrdersComponent } from './provider-deliver-orders.component';

describe('ProviderDeliverOrdersComponent', () => {
  let component: ProviderDeliverOrdersComponent;
  let fixture: ComponentFixture<ProviderDeliverOrdersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ProviderDeliverOrdersComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ProviderDeliverOrdersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
