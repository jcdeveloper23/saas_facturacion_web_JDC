import { TestBed } from '@angular/core/testing';

import { AppVersionsService } from './app-versions.service';

describe('AppVersionsService', () => {
  let service: AppVersionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AppVersionsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
