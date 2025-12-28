import { TestBed } from '@angular/core/testing';

import { CitySearchAnalyticsService } from './city-search-analytics.service';

describe('CitySearchAnalyticsService', () => {
  let service: CitySearchAnalyticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CitySearchAnalyticsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
