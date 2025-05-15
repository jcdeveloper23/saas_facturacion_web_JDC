import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RepresentativeProfileComponent } from './representative-profile.component';

describe('RepresentativeProfileComponent', () => {
  let component: RepresentativeProfileComponent;
  let fixture: ComponentFixture<RepresentativeProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RepresentativeProfileComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RepresentativeProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
