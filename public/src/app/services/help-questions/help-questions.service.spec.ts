import { TestBed } from '@angular/core/testing';

import { HelpQuestionsService } from './help-questions.service';

describe('HelpQuestionsService', () => {
  let service: HelpQuestionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HelpQuestionsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
