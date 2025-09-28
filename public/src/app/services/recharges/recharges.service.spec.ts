import { TestBed } from '@angular/core/testing';

import { RechargesService } from './recharges.service';

describe('RechargesService', () => {
  let service: RechargesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RechargesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
