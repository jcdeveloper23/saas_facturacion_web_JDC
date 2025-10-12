import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HelpCategoriesComponent } from './help-categories.component';

describe('HelpCategoriesComponent', () => {
  let component: HelpCategoriesComponent;
  let fixture: ComponentFixture<HelpCategoriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ HelpCategoriesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HelpCategoriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
