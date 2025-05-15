import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Levels } from 'app/interfaces/levels';
import { Parallels } from 'app/interfaces/parallels';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { LevelsService } from 'app/services/levels/levels.service';
import { ParallelsService } from 'app/services/parallels/parallels.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StudentService } from 'app/services/student/student.service';
import { take } from 'rxjs/operators';
declare var $: any;
@Component({
  selector: 'app-students',
  templateUrl: './students.component.html',
  styleUrls: ['./students.component.css']
})
export class StudentsComponent implements OnInit {

  public levels: Array<Levels>;
  public parallels: Array<Parallels>;
  public provider_school_id = ''
  public array_gender: Array<string> = ['Femenino', 'Masculino'];
  public student: Student;
  public isEdit = true;
  public array_students: Array<Student>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableStudents") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Student>;
  public displayedColumns: string[] = [
    "identification",
    "name",
    "lastname",
    "email",
    "address",
    "phone",
    "status",
    "edit",
  ];
  public representative: Representative;
  public infoUser: Users;

  constructor(private studentService: StudentService,
    private levelsService: LevelsService,
    private parallelsService: ParallelsService,
    private representativeService: RepresentativeService) { }

  ngOnInit(): void {
    this.student = {};
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.provider_school_id = this.infoUser.user_id_school;
      this.getStudentsBySchool();
      this.getLevels();
    }


  }

  public getLevels() {
    if (this.infoUser.users_account_type !== "0") {
      this.levelsService.getLevelsBySchool(this.provider_school_id).pipe(take(1)).subscribe(levels => {
        this.levels = levels;
      })
    } else {
      this.levelsService.getLevelsAll().pipe(take(1)).subscribe(levels => {
        this.levels = levels;
      })
    }
    
  }

  public selectLevel(e) {
    if (e.value) {
      this.parallelsService.getParallelsBySchool(e.value).pipe(take(1)).subscribe(paralles => {
        this.parallels = paralles;
      })
    }
  }

  public getStudentsBySchool() {
    if (this.infoUser.users_account_type !== "0") {
      this.studentService.getStudentsBySchool(this.provider_school_id).pipe(take(1)).subscribe(students => {
        this.array_students = students;
        this.dataSource = new MatTableDataSource<Student>(students);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      })
    } else {
      this.studentService.getAllStudents().pipe(take(1)).subscribe(students => {
        this.array_students = students;
        this.dataSource = new MatTableDataSource<Student>(students);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      })
    }
      
  }

  public editStudent(student: Student) {
    this.student = student;
    $('#multiCollapseStudents').collapse('show');
    this.getInfoRepresentative(student.student_id_representative);
    if (student.student_level) {
      this.parallelsService.getParallelsBySchool(student.student_level).pipe(take(1)).subscribe(paralles => {
        this.parallels = paralles;
      })
    }
  }


  public getInfoRepresentative(represenattive_id: string) {
    this.representativeService.getRepresentativeId(represenattive_id).pipe(take(1)).subscribe(r => {
      this.representative = r;
    })
  }

  public updateStudent(student: Student, isValid: boolean, form: NgForm) {
    if (isValid) {
      this.studentService.updateStudent(this.student).then(() => {
        this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente. ', 'success');
        $('#multiCollapseStudents').collapse('hide');

      })
    }
  }

  public cancelForm() {
    $('#multiCollapseStudents').collapse('hide');
    $('.nav-tabs li.active').removeClass('active');
    $('.tab-content div.active').removeClass('active');
    this.student = {}

  }

  public viewTableRepresentative() {
    $('.nav-tabs li').addClass('active');
    $('.tab-content div').addClass('active');
  }
  /**
* *** Function para filtar en data table ***
* @param event
*/
  public applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  /**
* Metodo para mostrar notificaciones.
* @param from 
* @param align 
* @param icon 
* @param message 
* @param type 
*/
  public showNotification(from, align, icon, message, type) {

    $.notify({
      icon: icon,
      message: message,
    }, {
      type: type,
      timer: 4000,
      placement: {
        from: from,
        align: align
      },
      template: '<div data-notify="container" class="col-11 col-md-4 alert alert-{0} alert-with-icon" role="alert"><button type="button" aria-hidden="true" class="close" data-notify="dismiss"><i class="nc-icon nc-simple-remove"></i></button><span data-notify="icon" class="nc-icon {{icon}}"></span> <span data-notify="title">{1}</span> <span data-notify="message">{2}</span><div class="progress" data-notify="progressbar"><div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div></div><a href="{3}" target="{4}" data-notify="url"></a></div>'
    });
  }
}
