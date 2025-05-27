import { TestBed } from '@angular/core/testing';

import { FirestoreExportServiceService } from './firestore-export-service.service';

describe('FirestoreExportServiceService', () => {
  let service: FirestoreExportServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FirestoreExportServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
