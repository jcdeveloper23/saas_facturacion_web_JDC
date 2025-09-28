import { TestBed } from '@angular/core/testing';

import { BcvExchangeRateService } from './bcv-exchange-rate.service';

describe('BcvExchangeRateService', () => {
  let service: BcvExchangeRateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BcvExchangeRateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
