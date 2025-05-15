import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RepresentativeStudentComponent } from './representative-student.component';

describe('RepresentativeStudentComponent', () => {
  let component: RepresentativeStudentComponent;
  let fixture: ComponentFixture<RepresentativeStudentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RepresentativeStudentComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RepresentativeStudentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
