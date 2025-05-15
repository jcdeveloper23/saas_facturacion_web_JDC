import { Component, OnInit, ViewChild } from '@angular/core';
import { QrScannerComponent } from 'angular2-qrscanner';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StudentService } from 'app/services/student/student.service';
import { take } from 'rxjs/operators';




@Component({
  selector: 'app-scanner',
  templateUrl: './scanner.component.html',
  styleUrls: ['./scanner.component.css']
})
export class ScannerComponent implements OnInit {
  public result;
  @ViewChild(QrScannerComponent, { static: false }) qrScannerComponent: QrScannerComponent;
  public representatives: Representative;
  public student: Student;

  constructor(
    private representativeService: RepresentativeService,
    private studentService: StudentService,

  ) { }

  ngOnInit(): void {
    // this.test();
    this.student = {};
  }

  ngAfterViewInit(): void {
    this.test();

    

    
  }

  test () {
    this.qrScannerComponent.getMediaDevices().then(devices => {
      const videoDevices: MediaDeviceInfo[] = [];
      for (const device of devices) {
        if (device.kind.toString() === 'videoinput') {
          videoDevices.push(device);
        }
      }
      if (videoDevices.length > 0) {
        let choosenDev;
        for (const dev of videoDevices) {
          if (dev.label.includes('front')) {
            choosenDev = dev;
            break;
          }
        }
        if (choosenDev) {
          this.qrScannerComponent.chooseCamera.next(choosenDev);
        } else {
          this.qrScannerComponent.chooseCamera.next(videoDevices[0]);
        }
      }
    });
    this.qrScannerComponent.capturedQr.subscribe(result => {
      this.result = result;
      this.studentService.getStudentByIdScanner(result).pipe(take(1)).subscribe((student: Student) => {
        this.student = student;
      });
    });
  }

}
