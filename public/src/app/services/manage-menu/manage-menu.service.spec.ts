import { TestBed } from '@angular/core/testing';

import { ManageMenuService } from './manage-menu.service';

describe('ManageMenuService', () => {
  let service: ManageMenuService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ManageMenuService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
