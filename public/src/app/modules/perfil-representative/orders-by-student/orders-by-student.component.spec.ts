import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrdersByStudentComponent } from './orders-by-student.component';

describe('OrdersByStudentComponent', () => {
  let component: OrdersByStudentComponent;
  let fixture: ComponentFixture<OrdersByStudentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OrdersByStudentComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(OrdersByStudentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
