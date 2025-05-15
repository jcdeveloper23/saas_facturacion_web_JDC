import { TestBed } from '@angular/core/testing';

import { LectiveYearService } from './lective-year.service';

describe('LectiveYearService', () => {
  let service: LectiveYearService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LectiveYearService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
