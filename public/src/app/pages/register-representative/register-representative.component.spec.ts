import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegisterRepresentativeComponent } from './register-representative.component';

describe('RegisterRepresentativeComponent', () => {
  let component: RegisterRepresentativeComponent;
  let fixture: ComponentFixture<RegisterRepresentativeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RegisterRepresentativeComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RegisterRepresentativeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
