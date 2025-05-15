import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrdersConfirmationPendingComponent } from './orders-confirmation-pending.component';

describe('OrdersConfirmationPendingComponent', () => {
  let component: OrdersConfirmationPendingComponent;
  let fixture: ComponentFixture<OrdersConfirmationPendingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OrdersConfirmationPendingComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(OrdersConfirmationPendingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
