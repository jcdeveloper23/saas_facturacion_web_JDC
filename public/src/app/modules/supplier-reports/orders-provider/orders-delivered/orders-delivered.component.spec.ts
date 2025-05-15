import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrdersDeliveredComponent } from './orders-delivered.component';

describe('OrdersDeliveredComponent', () => {
  let component: OrdersDeliveredComponent;
  let fixture: ComponentFixture<OrdersDeliveredComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OrdersDeliveredComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(OrdersDeliveredComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
