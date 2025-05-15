import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewRequestStudentsComponent } from './new-request-students.component';

describe('NewRequestStudentsComponent', () => {
  let component: NewRequestStudentsComponent;
  let fixture: ComponentFixture<NewRequestStudentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ NewRequestStudentsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NewRequestStudentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
