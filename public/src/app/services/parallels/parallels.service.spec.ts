import { TestBed } from '@angular/core/testing';

import { ParallelsService } from './parallels.service';

describe('ParallelsService', () => {
  let service: ParallelsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ParallelsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
