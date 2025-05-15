import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProviderAdministrationComponent } from './provider-administration.component';

describe('ProviderAdministrationComponent', () => {
  let component: ProviderAdministrationComponent;
  let fixture: ComponentFixture<ProviderAdministrationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ProviderAdministrationComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ProviderAdministrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
