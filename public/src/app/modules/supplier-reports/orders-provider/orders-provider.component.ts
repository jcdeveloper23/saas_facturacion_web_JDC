import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Orders } from 'app/interfaces/orders';
import { Product } from 'app/interfaces/product';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { DatePicker } from 'app/modules/perfil-representative/cart-detail/cart-detail.component';
import { OrdersService } from 'app/services/orders/orders.service';
import { StudentService } from 'app/services/student/student.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { QrScannerComponent } from 'angular2-qrscanner';
import html2canvas from 'html2canvas';
import { jsPDF } from "jspdf";
import { LevelsService } from 'app/services/levels/levels.service';

declare var $: any
@Component({
  selector: 'app-orders-provider',
  templateUrl: './orders-provider.component.html',
  styleUrls: ['./orders-provider.component.css']
})
export class OrdersProviderComponent implements OnInit {

  public order_detail: Orders;
  public loading_orders = false
  public array_products: Array<Product>;
  public infoUser: Users;
  public array_orders_inactive: Array<Orders>;
  public provider_id: string;
  public dayselected: DatePicker = {};
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableOrdersPending") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Orders>;
  public displayedColumns: string[] = [
    "n",
    "student",
    "date",
    "level",
    "quantity",
    "qr",
    "view",
  ];
  @ViewChild(MatSort) sortProducts: MatSort;
  @ViewChild("tableOrdersPendingProducts") paginatorProducts: MatPaginator;
  public dataSourceProducts: MatTableDataSource<Orders>;
  public displayedColumnsProducts: string[] = [
    "n",
    "student",
    "date",
    "level",
    "product",
  ];
  public dateActually: string;
  public student: Student;
  public viewOrdersDelivered = false;
  public viewOrdersRequest = true;
  public viewOrdersConfirmationPending = false
  public result;
  @ViewChild(QrScannerComponent, { static: false }) qrScannerComponent: QrScannerComponent;
  title = 'app';
  elementType = 'url';
  value = 'Techiediaries';
  public listViewOrders = true;
  public listViewProducts = false;
  public array_products_dates: Array<Array<Product>> = [];
  public viewDetailProduct: boolean;

  constructor(private orderService: OrdersService,
    private studentService: StudentService,
    private utilsService: UtilsService,
    private levelsService: LevelsService,
  ) { }

  ngOnInit(): void {

    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.getOrdersProvider()
    }
    $('#myModalScanner').on('hidden.bs.modal', function () {
      $("#modal-scanner-close").trigger("click");
      document.getElementById('close-scan').click();
    })


  }

  public async onDateSelected() {
    if (this.listViewOrders) {
      this.loading_orders = true;
      let date = this.dayselected.year + '-' + this.dayselected.month + '-' + this.dayselected.day;
      this.array_orders_inactive = []
      this.orderService.getOrdersByProviderInStatusFalse(this.infoUser.user_id).pipe(take(1)).subscribe((array_oreders_elements => {
        for (let index = 0; index < array_oreders_elements.length; index++) {
          const element = array_oreders_elements[index];
          this.orderService.getOrdersByProviderAndProductsDateStateFalse(this.infoUser.user_id, element.order_transaccion_id, date).pipe(take(1)).subscribe((products) => {
            if (products.length > 0) {
              this.array_orders_inactive.push(element)
            }
            if (index + 1 === array_oreders_elements.length) {
              this.setInfoAditionalOrder(this.array_orders_inactive)
            }
          })
        }
      }))
    } else {
      this.getProductsByDate()
    }



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

            this.orderService.getOrdersProductsByProvider(this.infoUser.user_id, element.order_transaccion_id).pipe(take(1)).subscribe((products: Array<Product>) => {
              if (products) {
                element.order_length_products = products.length
              }
              if (index + 1 === orders.length) {
                this.loading_orders = false
                this.dataSource = new MatTableDataSource<Orders>(orders);
                this.dataSource.paginator = this.paginator;
                this.dataSource.sort = this.sort;
              }
            })
          }
        })
      }
    } else {
      this.loading_orders = false
      this.array_orders_inactive = []
    }
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

  public applyFilterProducts(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSourceProducts.filter = filterValue.trim().toLowerCase();
    if (this.dataSourceProducts.paginator) {
      this.dataSourceProducts.paginator.firstPage()
    }
  }

  public async getOrdersProvider() {
    this.loading_orders = true;
    this.dayselected = null;
    this.orderService.getOrdersByProviderInStatusFalse(this.infoUser.user_id).subscribe((array_orders) => {
      this.array_orders_inactive = array_orders;
      if (this.array_orders_inactive) {
        this.setInfoAditionalOrder(this.array_orders_inactive)

      }
    })

  }

  stopScanning() {
    $('#myModalScanner').modal('hide');
    this.qrScannerComponent.stopScanning()
  }
  // public async viewProductDetail(order: Orders, product_id: string) {
  //   let day = new Date().getDate();
  //   let month = new Date().getMonth() + 1;
  //   let year = new Date().getFullYear();
  //   this.dateActually = year + '-' + month + '-' + day;
  //   this.student = await this.studentService.getStudentId(order.order_student_id).pipe(take(1)).toPromise();
  //   this.order_detail = order;
  //   this.array_products = [await this.orderService.getOrdersProductsByProviderByProductId(order.order_provider_id, order.order_transaccion_id, product_id).pipe(take(1)).toPromise()]
  //   $('#myModaldetailOrder').modal('show');
  // }

  public async viewProducts(order: Orders) {
    let day = new Date().getDate();
    let month = new Date().getMonth() + 1;
    let year = new Date().getFullYear();
    this.dateActually = year + '-' + month + '-' + day;
    this.student = await this.studentService.getStudentId(order.order_student_id).pipe(take(1)).toPromise();
    this.order_detail = order;
    this.array_products = await this.orderService.getOrdersProductsByProvider(order.order_provider_id, order.order_transaccion_id).pipe(take(1)).toPromise()
    $('#myModaldetailOrder').modal('show');
  }

  public cleanInputDate() {
    this.array_orders_inactive = []
    this.dayselected = null;
    if (this.listViewOrders) {
      this.getOrdersProvider()
    } else {
      this.getProductsByDate()
    }
  }

  public changeStatus(e, product: Product) {
    product.product_state_in_order = e.checked;
    let updateStatus: Product = {
      product_state_in_order: e.checked,
      product_delivery_date: this.utilsService.getDateCurrent(),
      product_dalivery_time: this.utilsService.getTimeCurrent(),
    }
    if (product.product_order_delivery_date !== this.dateActually && e.checked) {
      Swal.fire({
        text: "Confirma que desea entregar el producto  que no corresponde al día actual?",
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
          this.orderService.updateStatusProductInOrderProvider(this.infoUser.user_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
            this.orderService.updateProductsOfOrderInStudent(this.order_detail.order_student_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
              this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de entrega correctamente.', 'success');
              // this.viewProducts(this.order_detail);
              this.validateStateProductsInOrder()
            })
          })
          this.validateStateProductsInOrder()
        } else {
          product.product_state_in_order = false;
        }
      })
    } else {
      this.orderService.updateStatusProductInOrderProvider(this.infoUser.user_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
        this.orderService.updateProductsOfOrderInStudent(this.order_detail.order_student_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de entrega correctamente.', 'success');
          // this.viewProducts(this.order_detail);
          this.validateStateProductsInOrder()

        })
      })
      this.validateStateProductsInOrder()
    }
  }

  public validateStateProductsInOrder() {
    let array_states_products: Array<boolean> = [];
    for (let index = 0; index < this.array_products.length; index++) {
      const product = this.array_products[index];
      if (product.product_state_in_order) {
        array_states_products.push(true)
      }
      if (array_states_products.length === this.array_products.length) {
        let updateStatus: Orders = {
          order_state: true,
          order_update_state_date: this.utilsService.getDateCurrent(),
          order_update_state_time: this.utilsService.getTimeCurrent(),
        }
        this.orderService.updateStateOrderStatusInProvider(this.infoUser.user_id, this.order_detail.order_transaccion_id, updateStatus).then(() => {
          this.orderService.updateStateOrderStatusInStudent(this.order_detail.order_student_id, this.order_detail.order_transaccion_id, updateStatus);
          if (index + 1 === this.array_products.length) {
            $('#myModaldetailOrder').modal('hide');
            document.getElementById('modal-products').click();
            // if (this.viewDetailProduct) {
            //   this.getProductsByDate()
            // }
            this.viewDetailProduct = false;
          }
        })
      }
    }
  }

  public scan() {
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
      if (result) {
        this.stopScanning()
        let array_info = result.split('/');
        if (array_info && array_info.length === 2) {
          if (array_info[0] !== this.infoUser.user_id) {
            this.utilsService.showNotification('top', 'right', 'nc-alert-circle-i', 'La información obtenida no corresponde con el bar logueado, por favor verifique la información.', 'warning');
          } else {
            this.orderService.getOrderByIdProviderAndOrder(array_info[0], array_info[1]).pipe(take(1)).subscribe((order: Orders) => {
              if (order && !order.order_state) {
                this.setInfoAditionalOrder([order]);
                this.viewProducts(order)
              } else {
                Swal.fire({
                  title: "La imagen a escanear no corresponde con ninguna orden generada o la orden ya se encuentra finalizada",
                  buttonsStyling: false,
                  confirmButtonText: 'Ok',
                  customClass: {
                    confirmButton: "btn btn-info"
                  }
                })
              }
            })
          }
        } else if (array_info.length === 3) {
          this.orderService.getOrderByIdProviderAndOrder(array_info[0], array_info[1]).pipe(take(1)).subscribe(async (order: Orders) => {
            if (order) {
              this.order_detail = order;
              this.array_products = await this.orderService.getOrdersProductsByProvider(order.order_provider_id, order.order_transaccion_id).pipe(take(1)).toPromise()
              this.deliverProduct(order, array_info[2])
            }
          })
        }
      }
    });
  }

  public deliverProduct(order: Orders, product_id: string) {
    let day = new Date().getDate();
    let month = new Date().getMonth() + 1;
    let year = new Date().getFullYear();
    this.dateActually = year + '-' + month + '-' + day;
    this.orderService.getOrdersProductsByProviderByProductId(order.order_provider_id, order.order_transaccion_id, product_id).pipe(take(1)).subscribe((product: Product) => {
      if (product.product_state_in_order) {
        this.utilsService.showNotification('top', 'right', 'nc-alert-circle-i', 'El producto ya se encuentra entregado.', 'warning');

      } else {
        if (this.dateActually !== product.product_order_delivery_date) {
          Swal.fire({
            title: '¿El producto no corresponde a la fecha actual,confirma que desea entregar?',
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
            if (result.isConfirmed) {
              product.product_state_in_order = true;
              let updateStatus: Product = {
                product_state_in_order: true,
                product_delivery_date: this.utilsService.getDateCurrent(),
                product_dalivery_time: this.utilsService.getTimeCurrent(),
              }
              this.orderService.updateStatusProductInOrderProvider(this.infoUser.user_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
                this.orderService.updateProductsOfOrderInStudent(this.order_detail.order_student_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
                  this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de entrega correctamente.', 'success');
                  this.validateStateProductsInOrder()
                })
              })
            }
          })
        } else {
          Swal.fire({
            title: '¿Confirma que desea entregar el producto?',
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
            if (result.isConfirmed) {
              product.product_state_in_order = true;
              let updateStatus: Product = {
                product_state_in_order: true,
                product_delivery_date: this.utilsService.getDateCurrent(),
                product_dalivery_time: this.utilsService.getTimeCurrent(),
              }
              this.orderService.updateStatusProductInOrderProvider(this.infoUser.user_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
                this.orderService.updateProductsOfOrderInStudent(this.order_detail.order_student_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
                  this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de entrega correctamente.', 'success');
                  this.validateStateProductsInOrder()
                })
              })
            }
          })
        }
      }
    })
  }

  public viewScan() {
    $('#myModalScanner').modal('show');
    this.scan()
  }

  public setStatusNavItems(type_item: string) {
    if (type_item === 'viewOrdersRequest') {
      this.viewOrdersRequest = true;
      this.viewOrdersDelivered = false;
      this.viewOrdersConfirmationPending = false;
    } else if (type_item === 'viewOrdersDelivered') {
      this.viewOrdersRequest = false;
      this.viewOrdersDelivered = true;
      this.viewOrdersConfirmationPending = false;
    } else if (type_item === 'viewOrdersConfirmationPending') {
      this.viewOrdersRequest = false;
      this.viewOrdersDelivered = false;
      this.viewOrdersConfirmationPending = true;
    }
  }

  public generatePDF() {
    const doc = new jsPDF();

    var data = document.getElementById('contentToConvert');
    html2canvas(data).then(canvas => {
      // Few necessary setting options
      var imgWidth = 208;
      var imgHeight = (canvas.height - 100) * imgWidth / canvas.width;
      const contentDataURL = canvas.toDataURL('image/png')
      var position = 0;
      doc.addImage(contentDataURL, 'PNG', 0, position, imgWidth, imgHeight)
      doc.save('lista_de_pedidos.pdf'); // Generated PDF
    });
  }

  public generatePDFProducts() {
    const doc = new jsPDF();
    var data = document.getElementById('contentToConvertProduct');
    html2canvas(data).then(canvas => {
      // Few necessary setting options
      var imgWidth = 208;
      var imgHeight = (canvas.height - 300) * imgWidth / canvas.width;
      const contentDataURL = canvas.toDataURL('image/png')
      var position = 0;
      doc.addImage(contentDataURL, 'PNG', 0, position, imgWidth, imgHeight)
      doc.save('lista_de_productos.pdf'); // Generated PDF
    });
  }

  public selectTypeViewOrders(e, value, type) {
    if (e.checked && type === 'listViewProducts') {
      this.listViewOrders = false;
      this.getProductsByDate()
    } else if (e.checked && type === 'listViewOrders') {
      this.listViewProducts = false;
      if (this.dayselected) {
        this.onDateSelected()
      } else {
        this.getOrdersProvider()
      }

    }
  }

  public getProductsByDate() {
    this.array_orders_inactive = [];
    this.array_products_dates = []
    let dateActually: string;
    if (this.dayselected === null) {
      let day = new Date().getDate();
      let month = new Date().getMonth() + 1;
      let year = new Date().getFullYear();
      dateActually = year + '-' + month + '-' + day;

    } else {
      dateActually = this.dayselected.year + '-' + this.dayselected.month + '-' + this.dayselected.day;
    }
    this.orderService.getOrdersByProviderInStatusFalse(this.infoUser.user_id).subscribe((array_oreders_elements => {
      this.array_products_dates = [];
      this.array_orders_inactive = [];
      for (let index = 0; index < array_oreders_elements.length; index++) {
        const element = array_oreders_elements[index];
        this.orderService.getOrdersByProviderAndProductsDateStateFalse(this.infoUser.user_id, element.order_transaccion_id, dateActually).subscribe((products) => {
          if (products.length > 0) {
            this.array_orders_inactive.push(element)
            this.array_products_dates.push(products)
          }
          if (index + 1 === array_oreders_elements.length) {
            this.setInfoAditionalOrder(this.array_orders_inactive);
            this.dataSourceProducts = new MatTableDataSource<Orders>(this.array_orders_inactive);
            this.dataSourceProducts.paginator = this.paginatorProducts;
            this.dataSourceProducts.sort = this.sortProducts;
          }
        })
      }
    }))
  }

  public viewProductDetail(product: Product, order: Orders) {
    this.array_products = [];
    this.viewDetailProduct = true;
    this.array_products[0] = product;
    this.order_detail = order;
    $('#myModaldetailOrder').modal('show');
  }

  public changeStatusOnlyProduct(e, product: Product) {
    product.product_state_in_order = e.checked;
    let updateStatus: Product = {
      product_state_in_order: e.checked,
      product_delivery_date: this.utilsService.getDateCurrent(),
      product_dalivery_time: this.utilsService.getTimeCurrent(),
    }
    if (product.product_order_delivery_date !== this.dateActually && e.checked) {
      Swal.fire({
        text: "Confirma que desea entregar el producto  que no corresponde al día actual?",
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
          this.orderService.updateStatusProductInOrderProvider(this.infoUser.user_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
            this.orderService.updateProductsOfOrderInStudent(this.order_detail.order_student_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
              this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de entrega correctamente.', 'success');
              // this.viewProducts(this.order_detail);
              this.validateStateProductsInOrder()
            })
          })
          this.validateStateProductsInOrder()
        } else {
          product.product_state_in_order = false;
        }
      })
    } else {
      this.orderService.updateStatusProductInOrderProvider(this.infoUser.user_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
        this.orderService.updateProductsOfOrderInStudent(this.order_detail.order_student_id, this.order_detail.order_transaccion_id, product.product_id_transaction, updateStatus).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de entrega correctamente.', 'success');

        })
      })
      this.validateStateProductsInOrder()
    }
  }
}
