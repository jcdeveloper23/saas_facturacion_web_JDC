import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { QrScannerComponent } from 'angular2-qrscanner';
import { DatePicker } from 'app/interfaces/datepicker';
import { Orders } from 'app/interfaces/orders';
import { Product } from 'app/interfaces/product';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { LevelsService } from 'app/services/levels/levels.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { OrdersService } from 'app/services/orders/orders.service';
import { StudentService } from 'app/services/student/student.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
declare var $: any

@Component({
  selector: 'app-provider-deliver-orders',
  templateUrl: './provider-deliver-orders.component.html',
  styleUrls: ['./provider-deliver-orders.component.css']
})
export class ProviderDeliverOrdersComponent implements OnInit {

  public infoUser: Users = {};

  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableOrdersDelivered") paginator: MatPaginator;
  @ViewChild(QrScannerComponent, { static: false }) qrScannerComponent: QrScannerComponent;

  public dataSource: MatTableDataSource<Orders>;
  public displayedColumns: string[] = [
    "n",
    "dateRequest",
    "student",
    "amount",
    "price",
    "view"
  ];

  /**
   * *** Lista de ordenes ***
   */
  public orders: Array<Orders> = [];


  public orderSelected: Orders = {};
  /**
   * *** Fecha actual ***
   */
  public dateActually: string;

  /**
   * *** Studiante seleccionado ***
   */
  public student: Student;

  /**
   * *** Lista de productos de la orden ***
   */
  public arrayProducts: Array<Product>;

  /**
   * *** Controla si se esta mostrando o no los detalles de un producto ***
   */
  public viewDetailProduct: boolean = false;

  /**
   * *** Para el manejo de Fechas ***
   */
  /// *** Dia seleccionada ***
  public daySelected: DatePicker = {};
  public dateSelected: string = '';
  /// *** Almacenamos la fecha previa seleccionada ***
  public previousDaySelected: DatePicker = {};
  /// *** fecha minima de compra ***
  public minDate: string = ""

  /**
   * *** Valor escaneado en el QR ***
   */
  public resultQr;


  /**
   * 
   * @param ordersService 
   * @param loadingService 
   * @param studentService 
   * @param levelsService 
   * @param utilsService 
   */
  constructor(
    private ordersService: OrdersService,
    private loadingService: LoadingService,
    private studentService: StudentService,
    private levelsService: LevelsService,
    private utilsService: UtilsService,
  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    var dateCurrent = new Date();

    let day = new Date().getDate();
    let month = new Date().getMonth() + 1;
    let year = new Date().getFullYear();
    this.dateActually = year + '-' + month + '-' + day;
    this.daySelected.day = new Date(dateCurrent).getDate();
    this.daySelected.month = (new Date(dateCurrent).getMonth() + 1);
    this.daySelected.year = new Date(dateCurrent).getFullYear();

    /**
     * *** Seleccionamos la fecha actual para la primera consulta ***
     */
    this.dateSelected = dateCurrent.getFullYear() + '-' +
      String(dateCurrent.getMonth() + 1).padStart(2, '0') + '-' +
      String(dateCurrent.getDate()).padStart(2, '0');

    /// *** Guardamos la fecha previa igual a la seleccion actual ***
    this.previousDaySelected = { ...this.daySelected };

    this.getAllOrdersStateFalse();
    $('#modalScannerQrCode').on('hidden.bs.modal', function () {
      $("#modal-scanner-close").trigger("click");
      document.getElementById('close-scan').click();
    })
  }

  /**
   * *** Las ordenes con estado [false] son aquellas que estan pendiente de entrega ***
   */
  public getAllOrdersStateFalse() {
    this.loadingService.show('Cargando ordenes');
    this.ordersService.getOrdersByProviderInStatusFalse(this.infoUser.userId, this.dateSelected).pipe(take(1)).subscribe((orders: Array<Orders>) => {
      console.log(orders);
      console.log(JSON.stringify(orders[0], null, 3));

      if (orders && orders.length > 0) {
        this.orders = orders;
        this.dataSource = new MatTableDataSource<Orders>(orders);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loadingService.hide();
      } else {
        this.orders = []
        this.dataSource = new MatTableDataSource<Orders>(this.orders);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loadingService.hide();
      }
    })
  }

  public async setInfoAditionalOrder(orders: Array<Orders>) {
    if (orders.length > 0) {
      for (let index = 0; index < orders.length; index++) {
        const element = orders[index];
        element.order_qr_value = element.order_provider_id + '/' + element.order_transaccion_id;
        this.studentService.getStudentId(element.order_student_id).pipe(take(1)).subscribe((student: Student) => {
          if (student) {
            element.order_student_name = student.student_name + ' ' + student.student_lastname
            this.levelsService.getNameLevelById(student.student_level).pipe(take(1)).subscribe((level) => {
              element.order_student_level = level[0].level_name;
            });
          }
        })
      }
    } else {
      // this.loading_orders = false
      // this.array_orders_inactive = []
    }
  }

  convertToDate(timestamp: any): Date | null {
    return timestamp?.toDate ? timestamp.toDate() : null;
  }

  /**
   * *** Metodo para mostrar los detalles de una orden seleccionada ***
   * @param order 
   */
  public async viewProducts(order: Orders) {
    /**
     * *** Obtenemos la fecha actual ***
     */
    let day = new Date().getDate();
    let month = new Date().getMonth() + 1;
    let year = new Date().getFullYear();
    this.dateActually = this.utilsService.getDateCurrent();
    /**
     * *** Seteamos la data de la orden seleccionada ***
     */
    this.orderSelected = order;

    /**
     * *** Obtenemos la data del estudiante ***
     */
    this.student = await this.studentService.getStudentId(order.order_student_id).pipe(take(1)).toPromise();

    /**
     * *** Obtenemos lod productos de la orden ***
     */
    this.arrayProducts = await this.ordersService.getOrdersProductsByProvider(order.order_provider_id, order.order_transaccion_id).pipe(take(1)).toPromise()

    $('#modalDetailsOrder').modal('show');
  }

  /**
   * *** ***
   * @param e 
   * @param product 
   */
  public changeStatus(event, product: Product) {
    product.product_state_in_order = event.checked;
    let updateStatus: Product = {
      product_state_in_order: event.checked,
      product_delivery_date: this.utilsService.getDateCurrent(),
      product_dalivery_time: this.utilsService.getTimeCurrent(),
    }

    if (product.product_order_delivery_date !== this.dateActually && event.checked) {
      var message = `Este producto está programado para ser entregado el día ${product.product_order_delivery_date}.\n\n
      ¿Estás seguro de que deseas entregarlo hoy: ${this.dateActually}?`
      Swal.fire({
        text: message,
        icon: 'warning',
        showCancelButton: true,
        customClass: {
          confirmButton: 'btn btn-success',
          cancelButton: 'btn btn-danger',
        },
        confirmButtonText: 'Sí, entregar!',
        cancelButtonText: 'Cancelar',
        buttonsStyling: false
      }).then((result) => {
        if (result.value) {
          this.loadingService.show('Actualizando la orden');
          this.ordersService.updateStatusProductInOrderProvider(this.infoUser.userId, this.orderSelected.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
            this.ordersService.updateProductsOfOrderInStudent(this.orderSelected.order_student_id, this.orderSelected.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
              this.utilsService.showNotification(
                'top',
                'right',
                'nc-check-2',
                '¡Entrega registrada con éxito!. El estado del pedido se actualizó correctamente.',
                'success',
              );
              this.validateStateProductsInOrder()
              this.loadingService.hide();
            })
          })
        } else {
          product.product_state_in_order = false;
        }
      })
    } else {
      this.loadingService.show('Actualizando la orden');
      this.ordersService.updateStatusProductInOrderProvider(this.infoUser.userId, this.orderSelected.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
        this.ordersService.updateProductsOfOrderInStudent(this.orderSelected.order_student_id, this.orderSelected.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
          this.utilsService.showNotification(
            'top',
            'right',
            'nc-check-2',
            '¡Entrega registrada con éxito!. El estado del pedido se actualizó correctamente.',
            'success',
          );
          this.validateStateProductsInOrder()
          this.loadingService.hide();
        })
      })
    }
  }

  public onDateSelected(): void {

    const today = new Date();
    const selectedDate = new Date(
      this.daySelected.year,
      this.daySelected.month - 1, // Mes en Date es 0-indexado
      this.daySelected.day
    );

    // console.log('*** today ***');
    // console.log(today);

    // console.log('*** selectedDate ***');
    // console.log(selectedDate);
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    /**
     * *** Seteamos la fecha seleccionada ***
     */
    this.dateSelected = selectedDate.getFullYear() + '-' +
      String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(selectedDate.getDate()).padStart(2, '0');

    console.log('*** this.dateSelected ***');
    console.log(this.dateSelected);

    const selectedDayOfWeek = selectedDate.getDay(); // 0: domingo, 6: sábado
    this.getAllOrdersStateFalse()

  }

  public cleanInputDate() {
    this.orders = []
    this.daySelected = null;
    this.getAllOrdersStateFalse()
  }

  public viewScan() {
    $('#modalScannerQrCode').modal('show');
    this.scanSearchByProviderAndStudent()
  }

  public viewScanSearchByStudent() {
    $('#modalScannerQrCode').modal('show');
    this.scanSearchByStudent()
  }

  public scanSearchByStudent() {
    console.log('*** scanSearchByStudent ***');

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
      this.resultQr = result;
      if (result) {
        this.stopScanning()
        console.log(JSON.stringify(result, null, 3));
        var idStudent = result;
        this.ordersService.getOrdersByStudent(idStudent).pipe(take(1)).subscribe((orders: Orders[]) => {
          if (orders && orders.length > 0) {
            this.orders = orders;
            this.dataSource = new MatTableDataSource<Orders>(orders);
            this.dataSource.paginator = this.paginator;
            this.dataSource.sort = this.sort;
            this.loadingService.hide();
          } else {
            this.orders = []
            this.dataSource = new MatTableDataSource<Orders>(this.orders);
            this.dataSource.paginator = this.paginator;
            this.dataSource.sort = this.sort;
            this.loadingService.hide();
          }
        })
      }
    });
  }


  public scanSearchByProviderAndStudent() {
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
      this.resultQr = result;
      if (result) {
        this.stopScanning()
        console.log(JSON.stringify(result, null, 3));

        let array_info = result.split('/');
        console.log(JSON.stringify(array_info, null, 3));



        /**
         * *** Se escanea un codigo QR con una orden valida ***
         */
        if (array_info && array_info.length === 2) {
          /**
         * *** Obtenemos del QR el id del bar ***
         */
          var idProvider = array_info[0];
          /**
           * *** Obtenemos el id del cliente ***
           */
          var idStudent = array_info[1];

          if (idProvider !== this.infoUser.userId) {
            this.utilsService.showNotification('top', 'right', 'nc-alert-circle-i', 'La información del QR es incorrecta, por favor verifique el QR.', 'warning');
          } else {
            this.ordersService.getOrderByIdProviderAndOrder(idProvider, idStudent).pipe(take(1)).subscribe((order: Orders) => {
              if (order && !order.order_state) {
                this.setInfoAditionalOrder([order]);
                this.viewProducts(order)
              } else {
                this.utilsService.showNotification('top', 'right', 'nc-alert-circle-i', 'El QR no tiene ordenes activas.', 'warning');
              }
            })
          }
        } else if (array_info.length === 3) {
          this.ordersService.getOrderByIdProviderAndOrder(idProvider, idStudent).pipe(take(1)).subscribe(async (order: Orders) => {
            if (order) {
              this.orderSelected = order;
              this.arrayProducts = await this.ordersService.getOrdersProductsByProvider(order.order_provider_id, order.order_transaccion_id).pipe(take(1)).toPromise()
              // this.deliverProduct(order, array_info[2])
            }
          })
        }
      }
    });
  }

  stopScanning() {
    $('#modalScannerQrCode').modal('hide');
    this.qrScannerComponent.stopScanning()
  }

  /**
   * *** Validamos el estado del producto en la orden ***
   */
  public validateStateProductsInOrder() {
    let array_states_products: Array<boolean> = [];
    /**
     * *** Recorremos los productos para optener todos los estados de entrega ***
     */
    for (let index = 0; index < this.arrayProducts.length; index++) {
      const product = this.arrayProducts[index];

      /** 
       * *** Llenamos el array con los productos entregados ***
       */
      if (product.product_state_in_order) {
        array_states_products.push(true)
      }

      /**
       * *** Si ya se entregaron todos marcamos la orden como entregada completa ***
       */
      if (array_states_products.length === this.arrayProducts.length) {
        let updateStatus: Orders = {
          order_state: true,
          order_update_state_date: this.utilsService.getDateCurrent(),
          order_update_state_time: this.utilsService.getTimeCurrent(),
        }

        /**
         * *** Actualizamos la orden en el comercio ***
         */
        this.ordersService.updateStateOrderStatusInProvider(this.infoUser.userId, this.orderSelected.order_transaccion_id, updateStatus).then(() => {
          /**
           * *** Actualizamos la orden en el cliente ***
           */
          this.ordersService.updateStateOrderStatusInStudent(this.orderSelected.order_student_id, this.orderSelected.order_transaccion_id, updateStatus);
          if (index + 1 === this.arrayProducts.length) {
            $('#modalDetailsOrder').modal('hide');
            this.getAllOrdersStateFalse()
          }
        })
      }
    }
  }
}
