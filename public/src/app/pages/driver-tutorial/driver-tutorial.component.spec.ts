import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DriverTutorialComponent } from './driver-tutorial.component';

describe('DriverTutorialComponent', () => {
  let component: DriverTutorialComponent;
  let fixture: ComponentFixture<DriverTutorialComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DriverTutorialComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DriverTutorialComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
