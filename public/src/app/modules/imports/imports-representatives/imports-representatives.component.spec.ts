import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImportsRepresentativesComponent } from './imports-representatives.component';

describe('ImportsRepresentativesComponent', () => {
  let component: ImportsRepresentativesComponent;
  let fixture: ComponentFixture<ImportsRepresentativesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ImportsRepresentativesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ImportsRepresentativesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
