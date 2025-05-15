import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentsBySuperAdminComponent } from './students-by-super-admin.component';

describe('StudentsBySuperAdminComponent', () => {
  let component: StudentsBySuperAdminComponent;
  let fixture: ComponentFixture<StudentsBySuperAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StudentsBySuperAdminComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StudentsBySuperAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
