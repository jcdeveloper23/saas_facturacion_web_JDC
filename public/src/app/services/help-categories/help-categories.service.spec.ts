import { TestBed } from '@angular/core/testing';

import { HelpCategoriesService } from './help-categories.service';

describe('HelpCategoriesService', () => {
  let service: HelpCategoriesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HelpCategoriesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
