import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DriverMonitorComponent } from './driver-monitor.component';

describe('DriverMonitorComponent', () => {
  let component: DriverMonitorComponent;
  let fixture: ComponentFixture<DriverMonitorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DriverMonitorComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DriverMonitorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
