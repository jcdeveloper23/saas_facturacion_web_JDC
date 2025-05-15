import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Provider } from 'app/interfaces/provider';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { ProviderService } from 'app/services/provider/provider.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StudentService } from 'app/services/student/student.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { take } from 'rxjs/operators';
import {Subscription} from "rxjs/Subscription";
declare var $: any;
@Component({
  selector: 'app-new-request-students',
  templateUrl: './new-request-students.component.html',
  styleUrls: ['./new-request-students.component.css']
})
export class NewRequestStudentsComponent implements OnInit, OnDestroy {
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('tableStudentsRequest') paginator: MatPaginator;
  public dataSource: MatTableDataSource<Student>;
  public dataSourceR: MatTableDataSource<Representative>;
  public displayedColumns: string[] = [
    'details',
    'nameRepresentative',
    'nameStudent',
    'Fecha',
    'view',
  ];
  public displayedColumnsR: string[] = [
    'details',
    'nameRepresentative',
    'view',
  ];
  public infoUser: Users;
  public array_students: Array<Student>;
  public array_representatives: Array<Representative>;
  public student: Student;
  public representative: Representative;
  public provider: Provider;
  public rSubs: Subscription;
  constructor(private studentsService: StudentService,
    private representativeService: RepresentativeService,
    private utilService: UtilsService,
    private providerService: ProviderService) { }

  ngOnInit(): void {
    this.array_students = [];
    this.array_representatives = [];
    this.infoUser = JSON.parse(localStorage.getItem('infoUser'));
    this.getInfoProvider()
  }

  /**
   * Obtengo informacion del proveedor
   * */
  public getInfoProvider() {
    this.providerService.getProviderId(this.infoUser.user_id).pipe(take(1)).subscribe((provider) => {
      this.provider = provider;
      if (provider) {
        this.getStudentsStateFalse();
        this.getRepresentativeStateFalse();
      }
    })
  }

  /**
   * Recupero los estudiantes con estado false para ser aprobados por el bar
   * */
  public getStudentsStateFalse() {
    this.array_students = [];
    this.studentsService.getStudentsRequest(this.provider.provider_id_school).subscribe((students: Array<Student>) => {
      this.array_students = students;
      this.setInfoRepresentative();
    })
  }

  public setInfoRepresentative() {
    if (this.array_students.length > 0) {
      for (let index = 0; index < this.array_students.length; index++) {
        const student = this.array_students[index];
        this.representativeService.getRepresentativeId(student.student_id_representative).pipe(take(1)).subscribe((representative: Representative) => {
          student.student_name_representative = representative.representative_name + ' ' + representative.representative_surname;
          if (index + 1 === this.array_students.length) {
            this.dataSource = new MatTableDataSource<Student>(this.array_students);
            this.dataSource.paginator = this.paginator;
            this.dataSource.sort = this.sort;
          }
        })
      }
    } else {
      this.dataSource = new MatTableDataSource<Student>(this.array_students);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    }

  }

  /**
   * Recupero los representantes con estado false para ser aprobados por el bar
   * */
  public getRepresentativeStateFalse() {
    this.array_representatives = [];
    this.rSubs = this.representativeService.getRepresentativeStateFalse(this.provider.provider_id_school).subscribe((representative: Array<Representative>) => {
      this.array_representatives = representative;
      this.dataSourceR = new MatTableDataSource<Representative>(this.array_representatives);
      this.dataSourceR.paginator = this.paginator;
      this.dataSourceR.sort = this.sort;
      // this.setInfoRepresentative();
    });
    /*this.representativeService.getRepresentativeStateFalse(this.provider.provider_id_school).subscribe((representative: Array<Representative>) => {
      this.array_representatives = representative;
      this.dataSourceR = new MatTableDataSource<Representative>(this.array_representatives);
      this.dataSourceR.paginator = this.paginator;
      this.dataSourceR.sort = this.sort;
      // this.setInfoRepresentative();
    })*/
  }

  public viewDateilStudent(student: Student) {
    this.student = student;
    $('#myModaldetailStudent').modal('show')
  }
  public viewDateilR(representative: Representative) {
    this.representative = representative;
    $('#myModaldetailR').modal('show')
  }

  public acceptStudent() {
    this.student.student_state_register = true;
    this.studentsService.updateStudent(this.student).then(() => {
      this.getStudentsStateFalse()
      this.utilService.showNotification('top', 'right', 'nc-check-2', 'Se realizó la actualización corectamente.', 'success')

      document.getElementById('modal-students').click();
      $('#myModaldetailStudent').modal('hide');

    })
  }

  public acceptRep() {
    this.representative.representative_state_confirm_by_bar = true;
    this.representative.representative_request_access_state = 1;
    this.studentsService.updateRep(this.representative).then(() => {
      this.getRepresentativeStateFalse();
      this.utilService.showNotification('top', 'right', 'nc-check-2', 'Se realizó la actualización corectamente.', 'success')

      document.getElementById('modal-students').click();
      $('#myModaldetailStudent').modal('hide');

    })
  }

  public declineRep() {
    this.representative.representative_state_confirm_by_bar = false;
    this.representative.representative_request_access_state = 0;
    this.studentsService.updateRep(this.representative).then(() => {
      this.getRepresentativeStateFalse();
      this.utilService.showNotification('top', 'right', 'nc-check-2', 'Se realizó la actualización corectamente.', 'success')

      document.getElementById('modal-students').click();
      $('#myModaldetailStudent').modal('hide');

    })
  }

  ngOnDestroy(): void {
    this.rSubs.unsubscribe();
  }

}
