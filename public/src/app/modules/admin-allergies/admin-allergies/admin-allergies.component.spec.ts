import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminAllergiesComponent } from './admin-allergies.component';

describe('AdminAllergiesComponent', () => {
  let component: AdminAllergiesComponent;
  let fixture: ComponentFixture<AdminAllergiesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AdminAllergiesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AdminAllergiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
