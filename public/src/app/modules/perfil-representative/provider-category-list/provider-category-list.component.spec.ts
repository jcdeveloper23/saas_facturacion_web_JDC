import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProviderCategoryListComponent } from './provider-category-list.component';

describe('ProviderCategoryListComponent', () => {
  let component: ProviderCategoryListComponent;
  let fixture: ComponentFixture<ProviderCategoryListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ProviderCategoryListComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ProviderCategoryListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
