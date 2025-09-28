import { Component, OnInit, ViewChild } from '@angular/core';
import { FormControl, NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Levels } from 'app/interfaces/levels';
import { Parallels } from 'app/interfaces/parallels';
import { LevelsService } from 'app/services/levels/levels.service';
import { ParallelsService } from 'app/services/parallels/parallels.service';
import { take } from 'rxjs/operators';
import { ChangeDetectorRef } from '@angular/core';
import { Users } from 'app/interfaces/users';
import { UsersService } from "../../../services/users/users.service";
import { Vehicle } from 'app/interfaces/vehicle';
import { Student } from 'app/interfaces/student';

declare var $: any;

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css']
})
export class UsersComponent implements OnInit {

  public isValidForm = false;
  public isValidFormStudent: Array<boolean> = [];
  public formStudent = new FormControl();
  public levels: Array<Levels>;
  public parallels: Array<Parallels>;
  public provider_id_school = '';
  public vehicleSelect: Student;
  public isValidUserForm = false;
  public arrayVehicles: Array<Vehicle> = [];
  public isEdit = false;
  public user: Users = {};
  public array_gender: Array<string> = ['Femenino', 'Masculino'];
  public array_user: Array<Users>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('tableUsers') paginator: MatPaginator;
  public dataSource: MatTableDataSource<Users>;
  public displayedColumns: string[] = [
    'identification',
    'name',
    'lastname',
    'email',
    'phone',
    'state',
    'send',
    'edit',
    'link',
  ];
  @ViewChild(MatSort) sortListSuperAdmin: MatSort;
  @ViewChild('tableUsersSuperAdmin') paginatorListSuperAdmin: MatPaginator;
  public dataSourceListSuperAdmin: MatTableDataSource<Users>;
  public displayedColumnsListSuperAdmin: string[] = [
    'identification',
    'name',
    'lastname',
    'email',
    'phone',
    'state',
    'view',
    'delete',
  ];
  public selectedStudent: number;
  public vehicleSelected: Vehicle = {};
  public arrayVehiclesAux: Array<boolean> = [];
  public infoUser: Users;
  public userUser: Users;

  public selectedVehicleIndex = 0;
  public lightboxImage: string = '';


  constructor(
    private usersService: UsersService,
    private levelsService: LevelsService,
    private parallelsService: ParallelsService,
    private userService: UsersService,
    private cdRef: ChangeDetectorRef) {
  }

  ngOnInit(): void {
    this.vehicleSelect = {};
    this.infoUser = JSON.parse(localStorage.getItem('infoUser'));

    if (this.infoUser) {
      // this.provider_id_school = this.infoUser.userIdSchool;
      this.getUsersList();
    }
  }

  public getUsersList() {
    console.log(this.infoUser.userRol);

    if (this.infoUser.userRol.toString() !== '0') {
      this.usersService.getUserByEmail(this.provider_id_school).pipe(take(1)).subscribe((users) => {
        this.array_user = users;
        this.dataSource = new MatTableDataSource<Users>(users);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      })
    } else {
      this.usersService.getAllUsers().pipe(take(1)).subscribe((users) => {
        this.array_user = users;
        this.dataSourceListSuperAdmin = new MatTableDataSource<Users>(users);
        this.dataSourceListSuperAdmin.paginator = this.paginatorListSuperAdmin;
        this.dataSourceListSuperAdmin.sort = this.sortListSuperAdmin;
      })
    }

  }

  public newUser() {
    this.user = {};
    this.arrayVehicles = [];
    this.arrayVehiclesAux = []
    this.isEdit = false;
    this.user.userState = false;

    this.user.userId = new Date().getTime().toString();
    $('#multiCollapseUser').collapse('show');
    $('#optionUser').trigger('click');
  }

  public saveUser(user: Users, isValid: boolean, form: NgForm) {
    console.log(isValid + " " + this.isValidForm);

    if (isValid) {
      if (!this.isEdit) {
        this.usersService.saveUser(this.user).then(() => {
          this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente. ', 'success');
          this.arrayVehicles = null;
          // form.resetForm();
          $('#multiCollapseUser').collapse('hide');
          this.getUsersList();
          form.resetForm();
        })
      } else {

        this.usersService.updateUser(this.user).then(() => {
          this.userService.updateUserState(this.userUser.userUid, this.user.userState);
          this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente. ', 'success');
          this.arrayVehicles = null;
          form.resetForm();
          $('#multiCollapseUser').collapse('hide');
          this.getUsersList();
        })
      }
    } else {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Por favor valide que los campos requeridos del representante y cada estudiante estén llenos. ', 'warning');
    }
  }

  /**
   * Actualizo el estado del usuario
   * */
  private updateUserState() {

  }

  public saveVehicle(formValue: Student, isValid: boolean, form: NgForm, i: number, vehicle: Vehicle) {
    console.log(isValid);

    if (isValid === true) {
      console.log('*** ejecutar saveVehicle ***', JSON.stringify(vehicle, null, 3));

      if (vehicle.vehicleState) {
        vehicle.vehicleInReview = false;
      }


      this.userService.updateVehicleState(this.user.userUid, vehicle).then(() => {
        // Handle any post-update logic here if needed
      });

      this.isValidFormStudent.push(true);
      this.arrayVehiclesAux[i] = true;
    } else {
      this.isValidFormStudent.splice(1, 1);
      this.arrayVehiclesAux[i] = false;
    }
    if (this.isValidFormStudent.length === this.arrayVehicles.length) {
      this.isValidForm = true;
    }
    console.log(this.isValidFormStudent.length + ' ' + this.arrayVehicles.length);

  }

  public sendForm() {
    this.isValidForm = false;
    this.isValidFormStudent = []
    if (this.arrayVehicles && this.arrayVehicles.length > 0) {
      for (let index = 0; index < this.arrayVehicles.length; index++) {
        const element = this.arrayVehicles[index];
        console.log(element);

        document.getElementById('send-form-vehicle' + index).click();
      }
    } else {
      this.isValidForm = true;
    }
    document.getElementById('send-form').click();
  }

  public cancelForm() {
    $('#multiCollapseUser').collapse('hide');

  }

  // public searchIdentifacation() {
  //   this.usersService.getUserIdentification(this.user.userIdentification).pipe(take(1)).subscribe((r) => {
  //     if (r && r.length > 0) {
  //       this.isEdit = true;
  //       this.user = r[0];
  //       this.getStudents()
  //     } else {
  //       this.isEdit = false;
  //       this.showNotification('top', 'right', 'nc-alert-circle-i', 'No existe representante asociado al número ingresado. ', 'warning');
  //     }
  //   })
  // }

  // public getStudents() {
  //   this.vehicleService.getStudentsByUserActives(this.user.userId).pipe(take(1)).subscribe(vehicles => {
  //     this.arrayVehicles = vehicles;
  //   })
  // }

  // public addStudent() {
  //   if (this.user.userIdentification !== null && this.user.userIdentification !== undefined && this.user.userIdentification !== '') {
  //     this.arrayVehiclesAux.push(true);
  //     this.arrayVehicles.push({
  //       vehicle_state_register: true,
  //       vehicle_state: true,
  //       vehicle_id: new Date().getTime().toString(),
  //     });
  //     this.selectedStudent = (this.arrayVehicles.length - 1)
  //   } else {
  //     this.showNotification('top', 'right', 'nc-alert-circle-i', 'Debe ingresar primero los datos requeridos de un representante. ', 'warning');

  //   }
  // }

  // public deleteStudent(i: number) {
  //   if (!this.isEdit) {
  //     this.arrayVehicles.splice(i, 1);
  //     this.selectedStudent = (this.arrayVehicles.length - 1)
  //   } else {
  //     const vehicle: Student = this.arrayVehicles[i];
  //     const vehicleValue = this.vehicleService.getStudentById(vehicle).pipe(take(1)).toPromise();
  //     if (vehicleValue) {
  //       this.vehicleService.deleteStudent(vehicle).then(() => {
  //         this.arrayVehicles.splice(i, 1);
  //         this.selectedStudent = (this.arrayVehicles.length - 1)

  //       })
  //     } else {
  //       this.arrayVehicles.splice(i, 1);
  //       this.selectedStudent = (this.arrayVehicles.length - 1)

  //     }
  //   }
  // }

  // public async sendEmail(user: Users) {
  //   this.usersService.getUserIdSendEmail(user.userId).pipe(take(1)).subscribe((rep: Users) => {
  //     if (rep) {
  //       if (!rep.user_send_email) {
  //         rep.user_send_email = 0;
  //       } else {
  //         user.user_send_email = (rep.user_send_email + 1);

  //       }
  //       this.usersService.updateEmailUser(user).then(() => {
  //         this.showNotification('top', 'right', 'nc-check-2', 'Se ha enviado el correo correctamente. ', 'success');
  //       })
  //     }
  //   })
  // }

  public editUser(user: Users) {
    this.isEdit = true;
    this.user = user;

    this.userService.getUserByEmail(this.user.userEmail).pipe(take(1)).subscribe((user) => {
      this.userUser = user[0];
    });

    this.userService.getVehiclesByUser(user.userUid).pipe(take(1)).subscribe((vehicles) => {
      console.log(JSON.stringify(vehicles[0], null, 3));

      this.selectVehicle(vehicles[0], 0)

      this.arrayVehicles = vehicles;
      if (this.arrayVehicles.length > 0) {
        this.selectedStudent = 0;

        for (let index = 0; index < vehicles.length; index++) {
          const element = vehicles[index];
          this.arrayVehiclesAux.push(true)
        }
      }
    })
    $('#multiCollapseUser').collapse('show');
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

  public selectVehicle(vehicle: Vehicle, i: number) {
    if (vehicle) {
      this.vehicleSelected = vehicle;
    }

  }

  deleteUser(user: Users) {
    this.userService.deleteUser(user.userUid).then(() => {
      // this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría - eliminado correctamente', 'success');
    });
  }

  get vehicleDocuments() {
    if (!this.vehicleSelected) return [];
    return [
      {
        label: 'DNI',
        url: this.user.userDniURL,
        type: 'dni',
        status: this.user.userDniVerified ? 'Verificado' : 'Pendiente',
        description: 'Identificación del conductor'
      },
      {
        label: 'Licencia',
        url: this.user.userLicenceURL,
        type: 'license',
        status: this.user.userLicenceVerified ? 'Verificado' : 'Pendiente',
        description: 'Licencia de conducir'
      },
      {
        label: 'Seguro',
        url: this.vehicleSelected.vehicleDocumentCarSureURL,
        type: 'insurance',
        status: this.vehicleSelected.vehicleSureVerified ? 'Vigente' : 'Vencido',
        description: 'Seguro de responsabilidad civil'
      }
    ];
  }

  openDocumentLightbox(url: string) {
    console.log(url);
    
    this.lightboxImage = url;
    ($('#documentLightbox') as any).modal('show');
  }
}

