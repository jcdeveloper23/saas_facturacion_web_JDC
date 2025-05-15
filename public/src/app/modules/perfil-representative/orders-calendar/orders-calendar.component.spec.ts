import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrdersCalendarComponent } from './orders-calendar.component';

describe('OrdersCalendarComponent', () => {
  let component: OrdersCalendarComponent;
  let fixture: ComponentFixture<OrdersCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OrdersCalendarComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(OrdersCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
