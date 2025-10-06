import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppVersionsComponent } from './app-versions.component';

describe('AppVersionsComponent', () => {
  let component: AppVersionsComponent;
  let fixture: ComponentFixture<AppVersionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AppVersionsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AppVersionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
