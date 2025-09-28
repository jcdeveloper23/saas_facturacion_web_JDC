import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { StorageService } from 'app/services/storage/storage.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { PaymentMethodsService } from 'app/services/paymentMethods/payment-methods.service';
import { CountriesService } from 'app/services/countries/countries.service';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';

declare var $: any;

@Component({ 
  selector: 'app-payment-method',
  templateUrl: './payment-method.component.html',
  styleUrls: ['./payment-method.component.css']
})
export class PaymentMethodComponent implements OnInit {

    /// *** Usado para datatables ***
    public dataSource: MatTableDataSource<PaymentMethod>;
    @ViewChild(MatSort) sort: MatSort;
    @ViewChild("tableProviders") paginator: MatPaginator;
    public displayedColumns: string[] = [
      "code",
      "name",
      "phone",
      "status",
      "edit",
      "delete",
    ];
    /// *** #Usado para datatables ***
  

  public paymentMethod: PaymentMethod = {};

  public isEdit: boolean = false;

  public previewImage: any = null;
  public fileDataImage: File = null;
  public previewImageQr: any = null;
  public fileDataImageQr: File = null;

  public tablaDatos;
  public arrayPaymentMethods: Array<PaymentMethod> = [];

  public dropdownList = [];
  public selectedCountries: Array<Country> = [];

  public arrayCountries: Array<Country> = [];


  constructor(
    private storageService: StorageService,
    public utilsService: UtilsService,
    public paymentMethodsService: PaymentMethodsService,
    public countriesService: CountriesService,

  ) { }

  ngOnInit(): void {
    this.getPaymentMethods();
    this.getCountries();
  }

  public getCountries() {
    this.countriesService.getCountries().subscribe(countrys => {
      this.arrayCountries = countrys;
      this.setList ();
    });
  }

  setList () {
    // this.dropdownList = [
    //   { item_id: 1, item_text: 'Mumbai' },
    //   { item_id: 2, item_text: 'Bangaluru' },
    //   { item_id: 3, item_text: 'Pune' },
    //   { item_id: 4, item_text: 'Navsari' },
    //   { item_id: 5, item_text: 'New Delhi' }
    // ];
    // this.selectedCountries = [
    //   { item_id: 3, item_text: 'Pune' },
    //   { item_id: 4, item_text: 'Navsari' }
    // ];
    this.dropdownList = this.arrayCountries;
  }

    
  public async getPaymentMethods() {
    this.paymentMethodsService.getPaymentMethods().subscribe(paymentMethods => {

  
      this.arrayPaymentMethods = paymentMethods;

      this.dataSource = new MatTableDataSource<PaymentMethod>(paymentMethods);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }

  /**
 * *** Para iniciar la creacion de la nueva UE limpiamos la UD ***
 * *** Editar = false ***
 * *** Moastramos el formulario ***
 * *** Creamos e nuevo id ***
 */
  public newPaymentMethod() {
   

    this.previewImage = null;
    this.paymentMethod = {}
    this.isEdit = false;
    this.paymentMethod.paymentMethodId = new Date().getTime().toString();
    this.paymentMethod.paymentMethodState = true;
    $('#modalNewPaymentMethod').modal('show');
  }

  async setDataTestPaymentMethod() {
    for (let index = 0; index < 200; index++) {
      var data: PaymentMethod =
      {
        paymentMethodName: "Empresa " + index,
        paymentMethodState: true,
        paymentMethodImage: "https://firebasestorage.googleapis.com/v0/b/early-cash-80f6a.appspot.com/o/paymentMethod%2FpaymentMethodId-1665502143998%2Fimg-1665502143998.png?alt=media&token=1d5bcbfb-b820-4aea-bc8d-fd41e03d2c53",
        paymentMethodDni: "1111111111111" + index,
        paymentMethodId: '00' + index.toString(),
        paymentMethodRegisterTime: "09:18:5" + index,
        paymentMethodEmail: "emp00" + + index + "@gmail.com",
        paymentMethodPhone: '98765432' + index,
        paymentMethodRegisterDate: "2022-10-1" + index
      };
      await this.paymentMethodsService.savePaymentMethod(data).then(() => {
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Empresa creada correctamente', 'success');
        this.previewImage = null;
      }).catch((e) => {
        console.log(JSON.stringify(e, null, 3));
      });
    }
  }

  /**
 * Metodo para registrar o actualizar compañías.
 * @param paymentMethod
 * @param isValid
 */
  public async savePaymentMethod(isValid: boolean, form: NgForm) {
    
    
    
    if (isValid) {
      if (this.fileDataImage) {
        await this.storageService.uploadFile(`paymentMethod/paymentMethodId-${this.paymentMethod.paymentMethodId}/img-${this.paymentMethod.paymentMethodId}.png`, this.fileDataImage).then((result) => {
          this.paymentMethod.paymentMethodImage = result;
        }).catch((e) => {
          console.log(JSON.stringify(e, null, 3));
        })
      }

      if (this.fileDataImageQr) {
        await this.storageService.uploadFile(`paymentMethod/paymentMethodId-${this.paymentMethod.paymentMethodId}/img-${this.paymentMethod.paymentMethodId}-qr.png`, this.fileDataImageQr).then((result) => {
          this.paymentMethod.paymentMethodImageQr = result;
        }).catch((e) => {
          console.log(JSON.stringify(e, null, 3));
        }) 
      }

      if (this.isEdit) {
        this.paymentMethodsService.editPaymentMethod(this.paymentMethod).then(() => {

         
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Empresa editada correctamente', 'success');
          this.previewImage = null;
          // form.resetForm();
          $('#modalNewPaymentMethod').modal('hide');
        })
      } else {
        this.paymentMethod.paymentMethodRegisterDate = this.utilsService.getDateCurrent();
        this.paymentMethod.paymentMethodRegisterTime = this.utilsService.getTimeCurrent();
        this.paymentMethodsService.savePaymentMethod(this.paymentMethod).then(() => {


          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Empresa creada correctamente correctamente', 'success');
          this.previewImage = null;
          form.resetForm();
          $('#modalNewPaymentMethod').modal('hide');
        }).catch((e) => {
          console.log(JSON.stringify(e, null, 3));
        });
      }
    } else {
    }
  }

  editPaymentMethod(paymentMethod: PaymentMethod) {
    this.isEdit = true;
    this.paymentMethod = paymentMethod;
    $('#modalNewPaymentMethod').modal('show');
  }

  deletePaymentMethod(paymentMethod: PaymentMethod) {


    this.paymentMethodsService.deletePaymentMethod(paymentMethod.paymentMethodId);

  }

  onPaymentMethodStateChange(paymentMethod: any, newState: boolean): void {
    paymentMethod.paymentMethodState = newState;
  
    this.paymentMethodsService.editPaymentMethod(paymentMethod).then(() => {

    })
  }

  public cancelViewForm(form: NgForm) {
    form.resetForm();
    $('#modalNewPaymentMethod').modal('hide');
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


  public fileProgressQr(fileInput: any) {
    this.fileDataImageQr = (<File>fileInput.target.files[0]);
    this.previewUrlImageQr()
  }

  /**
   * Metodo para visualizar imagen previa.
   * @returns
   */
  private previewUrlImageQr() {
    let mimeType = this.fileDataImageQr.type;
    if (mimeType.match(/image\/*/) == null) {
      return;
    }
    let reader = new FileReader();
    reader.readAsDataURL(this.fileDataImageQr);
    reader.onload = (_event) => {
      this.previewImageQr = reader.result;
    }
  }

  public initDataTable() {
    let aaa = this.tablaDatos;
    $("#datatablePaymentMethod").DataTable().destroy();
    setTimeout(function () {
      aaa = $("#datatablePaymentMethod").DataTable({

        retrieve: true,
        paging: true,
        ordering: true,
        info: true,
        pagingType: "full_numbers",

        lengthMenu: [
          [10, 25, 50, -1],
          [10, 25, 50, "Todos"],
        ],
        language: {
          search: "Buscar:",
          searchPlaceholder: "Buscar",
          paginate: {
            first: "<",
            last: ">",
            next: "Siguiente",
            previous: "Anterior"
          },
          lengthMenu: "Mostrar _MENU_ registros",
          info: "Mostrando _START_ a _END_ de _TOTAL_ registros",
        },
      });
    }, 10);
  }







  onItemSelect(country: Country) {
  }
  
  onSelectAll(country: any) {
  }


}
