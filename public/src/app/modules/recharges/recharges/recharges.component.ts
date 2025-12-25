import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Users } from 'app/interfaces/users';
import { LoadingService } from 'app/services/loading/loading.service';
import { RechargesService } from 'app/services/recharges/recharges.service';
import { StorageService } from 'app/services/storage/storage.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { UsersService } from 'app/services/users/users.service';
import Swal from 'sweetalert2';
import { read, utils, WorkBook, WorkSheet } from 'xlsx';
import * as XLSX from 'xlsx';
declare var $: any;
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-recharges',
  templateUrl: './recharges.component.html',
  styleUrls: ['./recharges.component.css']
})
export class RechargesComponent implements OnInit {


  /// *** Usado para datatables ***
  public dataSource: MatTableDataSource<Recharges>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableProviders") paginator: MatPaginator;
  public displayedColumns: string[] = [
    "code",
    "paymentMethod",
    "date",
    "cop",
    "usd",
    "vef",
    "status",
    // "statusCange",
    "edit",
    // "delete",
  ];
  /// *** #Usado para datatables ***
  public arrayCategory: Array<Recharges> = [];
  public filteredArray: Array<Recharges> = [];
  public currentFilter: string = 'pending';

  // Statistics
  public stats = {
    total: 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
    amountUsd: 0,
    amountCop: 0,
    amountVef: 0
  };


  public isEdit: boolean = false;
  public recharges: Recharges = {};
  public userSearchQuery: string = '';
  public allUsers: Array<Users> = [];
  public filteredUsers: Array<Users> = [];
  public selectedUser: Users;

  public previewImage: any = null;
  public fileDataImage: File = null;
  public viewAll: boolean = false;
  public lightboxImage: string = '';
  public infoUser: Users;

  constructor(
    public utilsService: UtilsService,
    public rechargesService: RechargesService,
    public usersService: UsersService,
    private storageService: StorageService,
    public loadingService: LoadingService,

  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    this.getRecharges();
  }

  public getRecharges() {
    this.loadingService.show('Cargando recargas...');
    this.rechargesService.getRecharges().subscribe(recharges => {
      this.arrayCategory = recharges;
      this.calculateStats();
      this.applyFilter(this.currentFilter);
      this.loadingService.hide();
    });
  }

  private calculateStats() {
    this.stats = {
      total: this.arrayCategory.length,
      pending: 0,
      accepted: 0,
      rejected: 0,
      amountUsd: 0,
      amountCop: 0,
      amountVef: 0
    };

    this.arrayCategory.forEach(r => {
      if (r.rechargeStatus === 'pending') this.stats.pending++;
      if (r.rechargeStatus === 'accept' || r.rechargeStatus === 'approved') {
        this.stats.accepted++;
        this.stats.amountUsd += parseFloat(r.rechargeAmountUsd || '0');
        this.stats.amountCop += parseFloat(r.rechargeAmountCop || '0');
        this.stats.amountVef += parseFloat(r.rechargeAmountVef || '0');
      }
      if (r.rechargeStatus === 'reject' || r.rechargeStatus === 'rejected') this.stats.rejected++;
    });
  }

  public applyFilter(status: string) {
    this.currentFilter = status;
    if (status === 'all') {
      this.filteredArray = this.arrayCategory;
    } else if (status === 'pending') {
      this.filteredArray = this.arrayCategory.filter(r => r.rechargeStatus === 'pending');
    } else if (status === 'accept') {
      this.filteredArray = this.arrayCategory.filter(r => r.rechargeStatus === 'accept' || r.rechargeStatus === 'approved');
    } else if (status === 'reject') {
      this.filteredArray = this.arrayCategory.filter(r => r.rechargeStatus === 'reject' || r.rechargeStatus === 'rejected');
    }

    this.dataSource = new MatTableDataSource<Recharges>(this.filteredArray);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }


  public newRecharges() {
    this.recharges = {
      rechargeId: 'REC-' + new Date().getTime(),
      rechargeStatus: 'accept',
      rechargeCreatedAt: this.utilsService.getDateCurrent() + ' - ' + this.utilsService.getTimeCurrent(),
      rechargeAmountUsd: '0',
      rechargeAmountCop: '0',
      rechargeAmountVef: '0',
      rechargePaymentMethodName: 'Manual / Admin'
    }
    this.isEdit = false;
    this.selectedUser = null;
    this.userSearchQuery = '';
    this.loadAllUsers();
    $('#modalNewRecharges').modal('show');
  }

  private loadAllUsers() {
    if (this.allUsers.length === 0) {
      this.usersService.getAllUsers().subscribe(users => {
        this.allUsers = users;
      });
    }
  }

  public searchUser(query: string) {
    if (!query || query.length < 3) {
      this.filteredUsers = [];
      return;
    }
    const q = query.toLowerCase();
    this.filteredUsers = this.allUsers.filter(u =>
      (u.userName && u.userName.toLowerCase().includes(q)) ||
      (u.userEmail && u.userEmail.toLowerCase().includes(q)) ||
      (u.userPhone && u.userPhone.includes(q))
    ).slice(0, 5); // Limit to top 5 results
  }

  public selectUser(user: Users) {
    this.selectedUser = user;
    this.recharges.rechargeUserUid = user.userUid;
    this.recharges.rechargeUserName = user.userName;
    this.recharges.rechargeUserPhone = user.userPhone;
    this.filteredUsers = [];
    this.userSearchQuery = user.userName;
  }


  public async saveRecharges(isValid: boolean, form: NgForm) {
    if (isValid) {

      Swal.fire({
        title: "Espere por favor",
        html: "Estamos procesando la información",
        timerProgressBar: true,
        allowOutsideClick: false, // Deshabilita el cierre al hacer clic fuera
        allowEscapeKey: false,   // Deshabilita el cierre con la tecla Escape
        showConfirmButton: false, // Oculta el botón de confirmación
        didOpen: () => {
          Swal.showLoading();
          const timer = Swal.getPopup().querySelector("b");
        },
        willClose: () => {
        }
      }).then((result) => {
        /* Read more about handling dismissals below */
        if (result.dismiss === Swal.DismissReason.timer) {
        }
      });

      if (this.isEdit) {
        this.recharges.rechargeStatus = 'accept';
        this.recharges.rechargeVerifiedBy = this.infoUser.userEmail;
        this.recharges.rechargeUpdateAt = this.utilsService.getDateCurrent() + ' - ' + this.utilsService.getTimeCurrent();


        this.rechargesService.editRecharges(this.recharges).then(() => {
          this.rechargesService.editRechargesInUsers(this.recharges).then(() => {
            this.editCreditBalanceUsers();
          })
        })
      } else {
        // New Manual Recharge
        if (!this.recharges.rechargeUserUid) {
          this.utilsService.showNotification('top', 'right', 'nc-alert-circle-i', 'Debe seleccionar un usuario', 'danger');
          return;
        }
        this.recharges.rechargeVerifiedBy = this.infoUser.userEmail;
        this.recharges.rechargeUpdateAt = this.utilsService.getDateCurrent() + ' - ' + this.utilsService.getTimeCurrent();

        this.rechargesService.saveRecharges(this.recharges).then(() => {
          // We also need to add it to the user's subcollection
          this.rechargesService.editRechargesInUsers(this.recharges).then(() => {
            this.editCreditBalanceUsers();
            $('#modalNewRecharges').modal('hide');
            this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Nueva recarga creada correctamente', 'success');
          })
        })
      }
    }
  }

  public async editCreditBalanceUsers() {
    try {

      this.rechargesService.getUserByUid(this.recharges.rechargeUserUid).pipe(take(1)).subscribe((user: Users) => {
        var newBalance = 0;
        if (user.userWalletBalance == undefined) {
          user.userWalletBalance = '0.00';
        }
        if (user.userWalletCurrency == undefined) {
          user.userWalletCurrency = 'COP';
        }
        newBalance = parseFloat(user.userWalletBalance) + parseFloat(this.recharges.rechargeAmountCop);
        user.userWalletLastUpdate = this.utilsService.getDateCurrent() + ' - ' + this.utilsService.getTimeCurrent();

        var dataToUpdate = {
          'userWalletBalance': newBalance.toString(),
          'userWalletLastUpdate': user.userWalletLastUpdate,
          'userWalletCurrency': user.userWalletCurrency,
        }

        this.rechargesService.updateUser(dataToUpdate, user.userUid).then(async () => {
          await this.createMovementOfWallet(user);
          $('#modalNewRecharges').modal('hide');
        });

      })

    } catch (error) {

    }


  }

  public async createMovementOfWallet(user: Users) {
    var movementIdCredit = new Date().getTime().toString();
    var newBalance = 0;
    if (user.userWalletBalance == undefined) {
      user.userWalletBalance = '0.00';
    }
    newBalance = parseFloat(user.userWalletBalance) + parseFloat(this.recharges.rechargeAmountCop);

    var previousBalance = parseFloat(user.userWalletBalance.toString());
    var appCommission = 0.00;

    ///
    var movementDataCredit = {
      // Datos del saldo
      'movementId': movementIdCredit,
      'movementPreviousBalance': previousBalance.toString(),
      'movementNewBalance': newBalance.toString(),

      // Id de la wallet del usuario que recibe
      'movementUserWalletId': user.userUid ?? '',

      // Información del origen
      'movementOriginUserUid': 'iMove',
      'movementOriginUserName': 'iMove',
      'movementOriginUserPhone': 'iMove',

      // Información del beneficiario
      'movementDestinationUserUid': user.userUid ?? '',
      'movementDestinationUserName': user.userName ?? '',
      'movementDestinationUserPhone': user.userPhone ?? '',

      // Información del conductor
      'movementDriverUid': '',
      'movementDriverName': '',
      'movementDriverPhone': '',

      // Información del cliente
      'movementClientUid': '',
      'movementClientName': '',
      'movementClientPhone': '',

      // Información de la solicitud o servicio
      'movementRequestId': '',
      'movementRequestType': '',
      'movementRequestDate': '',
      'movementRequestTime': '',

      // Datos de la aplicación y comisión
      'movementAppCommission': appCommission.toString(),
      'movementAmount': this.recharges.rechargeAmountCop.toString(),
      'movementConcept': 'Recarga de saldo cuenta iMove',

      // Datos de auditoría y control
      'movementType': 'Recarga de saldo', // o 'Pago QR', 'Pago de comision por servicio prestado', 'bonificación', etc.
      'movementTypeId': 'recharge', // o 'qrPayment', 'commissionPayment', 'recharge', etc.
      'movementTypeOfMovement': 'credit', // 'debit', 'credit',
      'movementStatus': 'completed', // o 'pending', 'failed', 'reverted', 'completed'
      'movementTimestamp': new Date().toISOString(),

      'movementNotes': '', // campo libre para observaciones manuales o automáticas
    };

    console.log('*** movementDataDebit ***');
    console.log(movementDataCredit);

    this.rechargesService.saveMovement(movementDataCredit, movementIdCredit).then(async () => {
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Recarga procesada correctamente', 'success');
      $('#modalNewRecharges').modal('hide');
    });

  }


  public async declineRecharges() {

    Swal.fire({
      title: "Espere por favor",
      html: "Estamos procesando la información",
      timerProgressBar: true,
      allowOutsideClick: false, // Deshabilita el cierre al hacer clic fuera
      allowEscapeKey: false,   // Deshabilita el cierre con la tecla Escape
      showConfirmButton: false, // Oculta el botón de confirmación
      didOpen: () => {
        Swal.showLoading();
        const timer = Swal.getPopup().querySelector("b");
      },
      willClose: () => {
      }
    }).then((result) => {
      /* Read more about handling dismissals below */
      if (result.dismiss === Swal.DismissReason.timer) {
      }
    });

    if (this.isEdit) {
      console.log('*** EDITANDO ***');

      this.recharges.rechargeStatus = 'reject';
      this.recharges.rechargeUpdateAt = this.utilsService.getDateCurrent() + ' - ' + this.utilsService.getTimeCurrent();

      this.rechargesService.editRecharges(this.recharges).then(() => {
        this.rechargesService.editRechargesInUsers(this.recharges).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría editada correctamente', 'success');
          $('#modalNewRecharges').modal('hide');
        })
      })


      Swal.close();
    }

    Swal.close();
  }



  editRecharges(recharges: Recharges) {
    this.isEdit = true;
    this.recharges = recharges;
    $('#modalNewRecharges').modal('show');
  }

  importRecharges() {
    $('#modalImport').modal('show');
  }

  public cancelViewForm(form: NgForm) {
    form.resetForm();
    $('#modalNewRecharges').modal('hide');
  }

  deleteRecharges(recharges: Recharges) {
    this.rechargesService.deleteRecharges(recharges.rechargeId).then(() => {
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría - eliminado correctamente', 'success');
    });
  }


  /**
   * Metodo para obtener el archivo de imagen seleccinado.
   * @param fileInput
   */
  public fileProgress(fileInput: any) {
    this.fileDataImage = (<File>fileInput.target.files[0]);
    this.previewUrlImage()
  }

  /**
   * Metodo para visualizar imagen previa.
   * @returns
   */
  private previewUrlImage() {
    let mimeType = this.fileDataImage.type;
    if (mimeType.match(/image\/*/) == null) {
      return;
    }
    let reader = new FileReader();
    reader.readAsDataURL(this.fileDataImage);
    reader.onload = (_event) => {
      this.previewImage = reader.result;
    }
  }

  importData() {
    $('#modalImportCategory').modal('show');
  }

  readExcel(event: any): void {
    const file = event.target.files[0];

    if (file) {
      const reader: FileReader = new FileReader();

      reader.onload = (e: any) => {
        const data: Uint8Array = new Uint8Array(e.target.result);
        const workbook: XLSX.WorkBook = XLSX.read(data, { type: 'array' });

        const firstSheetName: string = workbook.SheetNames[1];
        const worksheet: XLSX.WorkSheet = workbook.Sheets[firstSheetName];

        const allRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Omitimos la primera fila (encabezados)
        // this.dataSource = allRows.slice(1);
      };

      reader.readAsArrayBuffer(file);
    }
  }

  // saveDataImports() {
  //   var rechargesAux: Recharges = {};
  //   this.data.forEach((element, i) => {

  //     var rechargesId = `${new Date().getTime().toString()}${i}`;
  //     var rechargesDateRegister = this.utilsService.getDateCurrent();
  //     var rechargesTimeRegister = this.utilsService.getTimeCurrent();
  //     rechargesAux.rechargesId = rechargesId;
  //     rechargesAux.rechargesCode = rechargesId;
  //     rechargesAux.rechargesIcon = '';
  //     rechargesAux.rechargesDateRegister = rechargesDateRegister;
  //     rechargesAux.rechargesTimeRegister = rechargesTimeRegister;
  //     rechargesAux.rechargesParent = element[0];
  //     rechargesAux.rechargesParentName = element[1];
  //     rechargesAux.rechargesName = element[2];
  //     rechargesAux.rechargesDescription = element[3];
  //     rechargesAux.rechargesState = true;
  //     rechargesAux.rechargesIsMain = false;
  //     rechargesAux.rechargesIsPremium = false;

  //     console.log(JSON.stringify(rechargesAux, null, 3));

  //     this.rechargesService.saveRecharges(rechargesAux).then(() => { });
  //   });
  // }

  onPremiumChange(value: boolean, recharges) {
    console.log('Nuevo valor de premium:', value, recharges);
    this.rechargesService.editRecharges(recharges).then(() => {
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría editada correctamente', 'success');
    })
  }

  openDocumentLightbox(url: string) {
    console.log(url);

    this.lightboxImage = url;
    ($('#documentLightbox') as any).modal('show');
  }

}
