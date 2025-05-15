import { Component, OnInit, ViewChild } from '@angular/core';
import { FormControl, NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Levels } from 'app/interfaces/levels';
import { Parallels } from 'app/interfaces/parallels';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { LevelsService } from 'app/services/levels/levels.service';
import { ParallelsService } from 'app/services/parallels/parallels.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StudentService } from 'app/services/student/student.service';
import { take } from 'rxjs/operators';
import { ChangeDetectorRef } from '@angular/core';

declare var $: any;

@Component({
  selector: 'app-representative-by-super-admin',
  templateUrl: './representative-by-super-admin.component.html',
  styleUrls: ['./representative-by-super-admin.component.css']
})
export class  RepresentativeBySuperAdminComponent implements OnInit {
  public isValidForm : boolean = false;
  public isValidFormStudent : Array<boolean> = [];
  public formStudent = new FormControl();
  public levels : Array<Levels>;
  public parallels : Array<Parallels>;
  public provider_id_school = '1624925372360';
  public studentSelect: Student;
  public isValidRepresentativeForm = false;
  public arrayStudents: Array<Student> = [];
  public isEdit = false;
  public representative: Representative;
  public array_gender: Array<string> = ['Femenino', 'Masculino', 'Prefiero no decirlo'];
  public array_representative: Array<Representative>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableRepresentatives") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Representative>;
  public displayedColumns: string[] = [
    "identification",
    "name",
    "lastname",
    "email",
    "phone",
    "send",
    "edit",
    "link",
  ];
  public selectedStudent : number;
  constructor(
    private representativeService: RepresentativeService,
    private studentService: StudentService,
    public representatives: RepresentativeService, 
    private levelsService : LevelsService,
    private parallelsService : ParallelsService,
    private cdRef:ChangeDetectorRef) { }

  ngOnInit(): void {
    this.representative = {};
    this.studentSelect = {};
    this.getRepresentativesList();
    this.getLevels();
  }

  public getLevels() {
    this.levelsService.getLevelsBySchool(this.provider_id_school).pipe(take(1)).subscribe(levels => {
      this.levels = levels;
    })
  }

  public selectLevel(e) {
    if (e.value) {
      this.parallelsService.getParallelsBySchool(e.value).pipe(take(1)).subscribe(paralles => {
        this.parallels = paralles;
      })
    }
  }

  public getRepresentativesList() {
    // this.representativesService.getRepresentativesList().subscribe((representatives) => {
    //   this.array_representative = representatives;
    //   this.dataSource = new MatTableDataSource<Representative>(representatives);
    //   this.dataSource.paginator = this.paginator;
    //   this.dataSource.sort = this.sort;
    // })
  }

  public newRepresentative() {
    this.representative = {};
    this.representative.representative_state = false;
    this.representative.representative_id = new Date().getTime().toString();
    this.arrayStudents = [];
    this.isEdit = false;
    $('#multiCollapseRepresentative').collapse('show');
    $("#optionRepresentative").trigger("click");
  }
  public saveRepresentative(representative: Representative, isValid: boolean, form: NgForm) {
    if (isValid && this.isValidForm ) {
      
      if (!this.isEdit) {
        if (!this.representative.representative_schools) {
          this.representative.representative_schools = [this.provider_id_school];
        } else {
          this.representative.representative_schools.push(this.provider_id_school)
        }
        if (this.arrayStudents && this.arrayStudents.length > 0) {
          for (let index = 0; index < this.arrayStudents.length; index++) {
            const student = this.arrayStudents[index];
            student.student_id_representative = this.representative.representative_id;
            student.student_id_school = this.provider_id_school;

            this.studentService.saveStudent(student);
            if (!this.representative.representative_students) {
              this.representative.representative_students = [student.student_id]
            } else {
              this.representative.representative_students.push(student.student_id)
            }
            if (index + 1 === this.arrayStudents.length) {
              this.representativeService.saveRepresentative(this.representative).then(() => {
                this.representative.representative_send_email = 1;
                this.representativeService.saveEmailRepresentative(this.representative);
                this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente. ', 'success');
                form.resetForm();
                this.arrayStudents = null;
                $('#multiCollapseRepresentative').collapse('hide');
                this.getRepresentativesList();
              })
            }
          }
        } else {
          this.representativeService.saveRepresentative(this.representative).then(() => {
            this.representative.representative_send_email = 1;
            this.representativeService.saveEmailRepresentative(this.representative);
            this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente. ', 'success');
            this.arrayStudents = null;
            form.resetForm();
            $('#multiCollapseRepresentative').collapse('hide');
            this.getRepresentativesList();
          })
        }
      } else {
        if (this.arrayStudents && this.arrayStudents.length > 0) {
          for (let index = 0; index < this.arrayStudents.length; index++) {
            const student = this.arrayStudents[index];
            if (student.student_id_representative === undefined) {
              student.student_id_representative = this.representative.representative_id;
              student.student_id_school = this.provider_id_school;
              this.studentService.saveStudent(student);
            } else {
              this.studentService.updateStudent(student);
            }
            if (this.representative.representative_students && this.representative.representative_students.includes(student.student_id)) {

            } else {
              if (!this.representative.representative_students || this.representative.representative_students.length === 0) {
                this.representative.representative_students = []
              }
              this.representative.representative_students.push(student.student_id)
            }
            if (index + 1 === this.arrayStudents.length) {
              this.representativeService.updateRepresentative(this.representative).then(() => {
                this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente. ', 'success');
                form.resetForm();
                this.arrayStudents = null;
                $('#multiCollapseRepresentative').collapse('hide');
                this.getRepresentativesList();
              })
            }
          }
        } else {
          this.representativeService.updateRepresentative(this.representative).then(() => {
            this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente. ', 'success');
            this.arrayStudents = null;
            form.resetForm();
            $('#multiCollapseRepresentative').collapse('hide');
            this.getRepresentativesList();
          })
        }
      }
    } else {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Por favor valide que los campos requeridos del representante y cada estudiante estén llenos. ', 'warning');
    }
  }

  public saveStudent(student: Student, isValid: boolean, form: NgForm) {
      if (isValid === true) {
        this.isValidFormStudent.push(true)
      } else {
        this.isValidFormStudent.splice(1 , 1)
      }
      if (this.isValidFormStudent.length === this.arrayStudents.length) {
        this.isValidForm = true;
      } 
      //         this.showNotification('top', 'right', 'nc-alert-circle-i', 'Por favor valide que los campos requeridos del representante y cada estudiante estén llenos. ', 'warning');

      
  }
  
  public sendForm() {
    this.isValidForm = false;
    this.isValidFormStudent = []
    if (this.arrayStudents && this.arrayStudents.length > 0) {
      for (let index = 0; index < this.arrayStudents.length; index++) {
        const element = this.arrayStudents[index];
        document.getElementById('send-form-student'+index).click();

      }
    } else {
      this.isValidForm = true;
    }
    document.getElementById('send-form').click();
    
  }

  public cancelForm() {
    $('#multiCollapseRepresentative').collapse('hide');

  }
  public searchIdentifacation() {
    this.representativeService.getRepresentativeIdentification(this.representative.representative_identification).pipe(take(1)).subscribe((r) => {
      if (r && r.length > 0) {
        this.isEdit = true;
        this.representative = r[0];
        this.getStudents()
      } else {
        this.isEdit = false;
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'No existe representante asociado al número ingresado. ', 'warning');
      }
    })
  }

  public getStudents() {
    this.studentService.getStudentsByRepresentativeActives(this.representative.representative_id).pipe(take(1)).subscribe(students => {
      this.arrayStudents = students;
    })
  }
  public addStudent() {
    if (this.representative.representative_identification !== null && this.representative.representative_identification !== undefined && this.representative.representative_identification !== '') {
      this.arrayStudents.push({
        student_state: true,
        student_id : new Date().getTime().toString(),
      });
      this.selectedStudent = (this.arrayStudents.length - 1)
    } else {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Debe ingresar primero los datos requeridos de un representante. ', 'warning');

    }
  }

  public deleteStudent(i: number) {
    if (!this.isEdit) {
      this.arrayStudents.splice(i, 1);
      this.selectedStudent = (this.arrayStudents.length - 1)
    } else {
      let student : Student = this.arrayStudents[i];
      let studentValue = this.studentService.getStudentById(student).pipe(take(1)).toPromise();
      if (studentValue) {
        this.studentService.deleteStudent(student).then(() => {
          this.arrayStudents.splice(i, 1);
          this.selectedStudent = (this.arrayStudents.length - 1)

        })
      } else {
        this.arrayStudents.splice(i, 1);
        this.selectedStudent = (this.arrayStudents.length - 1)

      }
    }
  }

  public async sendEmail(representative : Representative) {
    let rep : Representative = await this.representativeService.getRepresentativeId(representative.representative_id).pipe(take(1)).toPromise()
    if (rep) {
      representative.representative_send_email = rep.representative_send_email + 1;
      this.representativeService.updateEmailRepresentative(representative).then(() => {
        this.showNotification('top', 'right', 'nc-check-2', 'Se ha enviado el correo correctamente. ', 'success');
      })
    }
  }

  public editRepresentative(representative: Representative) {
    this.isEdit = true;
    this.representative = representative;
    this.studentService.getStudentsByRepresentativeActives(representative.representative_id).pipe(take(1)).subscribe((students) => {
      this.arrayStudents = students;
      if (this.arrayStudents.length > 0) {
        this.selectedStudent = 0;

      }
    })
    $('#multiCollapseRepresentative').collapse('show');
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

  public selectStudent(student: Student , i : number) {
    this.selectedStudent = i;
    if (student.student_level) {
      this.parallelsService.getParallelsBySchool(student.student_level).pipe(take(1)).subscribe(paralles => {
        this.parallels = paralles;
      })
    }
  }
}

 