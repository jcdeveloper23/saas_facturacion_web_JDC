import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrdersProviderComponent } from './orders-provider.component';

describe('OrdersProviderComponent', () => {
  let component: OrdersProviderComponent;
  let fixture: ComponentFixture<OrdersProviderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OrdersProviderComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(OrdersProviderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
