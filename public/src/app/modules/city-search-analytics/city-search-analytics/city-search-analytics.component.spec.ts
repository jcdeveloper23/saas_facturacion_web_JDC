import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CitySearchAnalyticsComponent } from './city-search-analytics.component';

describe('CitySearchAnalyticsComponent', () => {
  let component: CitySearchAnalyticsComponent;
  let fixture: ComponentFixture<CitySearchAnalyticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CitySearchAnalyticsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CitySearchAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
