import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Orders } from 'app/interfaces/orders';
import { Product } from 'app/interfaces/product';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { LoadingService } from 'app/services/loading/loading.service';
import { OrdersService } from 'app/services/orders/orders.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StudentService } from 'app/services/student/student.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { take } from 'rxjs/operators';
declare var $: any;

@Component({
  selector: 'app-provider-payment-confirmation',
  templateUrl: './provider-payment-confirmation.component.html',
  styleUrls: ['./provider-payment-confirmation.component.css']
})
export class ProviderPaymentConfirmationComponent implements OnInit {
  public infoUser: Users = {};

  public orderSelected: Orders = {};
  public student: Student;
  public loading_orders = false;
  public arrayProducts: Array<Product>;
  public arrayOrders: Array<Orders> = [];
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableOrdersDelivered") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Orders>;
  public displayedColumns: string[] = [
    "n",
    "dateRequest",
    "nameRepresentative",
    "nameStudent",
    "amount",
    "state",
    "view",
  ];
  constructor(
    private ordersService: OrdersService,
    private studentService: StudentService,
    private representativeService: RepresentativeService,
    private utilService: UtilsService,
    public loadingService: LoadingService,
  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    this.getOrdersConfirmationPending('')
  }

  public getOrdersConfirmationPending(value: string) {
    this.loadingService.show('Cargando ordenes');
    this.ordersService.getAllOrdersConfirmationPending(this.infoUser.user_id, value).subscribe((orders: Array<Orders>) => {
      console.log(JSON.stringify(orders, null, 3));
      if (orders.length > 0) {
        this.setInfoAditionalOrder(orders)
        this.arrayOrders = orders;
        this.dataSource = new MatTableDataSource<Orders>(this.arrayOrders);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      } else {
        this.arrayOrders = [];
        this.dataSource = new MatTableDataSource<Orders>(this.arrayOrders);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loadingService.hide();
      }
    })
  }

  public async setInfoAditionalOrder(orders: Array<Orders>) {
    for (let index = 0; index < orders.length; index++) {
      const element = orders[index];
      this.studentService.getStudentId(element.order_student_id).pipe(take(1)).subscribe((student: Student) => {
        if (student) {
          element.order_student_name = student.student_name + ' ' + student.student_lastname
        }
        this.representativeService.getRepresentativeId(element.order_representative_id).pipe(take(1)).subscribe((representative: Representative) => {
          element.order_representative_name = representative.representative_name + ' ' + representative.representative_surname;
        })
        if (index + 1 === orders.length) {
          this.loadingService.hide();
        }
      })
    }
  }

  public async viewProducts(order: Orders) {
    this.student = await this.studentService.getStudentId(order.order_student_id).pipe(take(1)).toPromise();
    this.orderSelected = order;
    this.arrayProducts = await this.ordersService.getOrdersProductsByProvider(order.order_provider_id, order.order_transaccion_id).pipe(take(1)).toPromise()
    $('#modalDetailsOrder').modal('show');
  }

  public accepOrder(order: Orders) {
    this.loadingService.show('Procesando');
    let object: Orders = {
      order_state_payment_method: true,
      order_state_payment_method_string: 'Aceptada',
    }

    this.ordersService.updateStatePaymentMethodInProvider(this.infoUser.user_id, order.order_transaccion_id, object).then(() =>
      this.ordersService.updateStatePaymentMethodInStudent(this.infoUser.user_id, order.order_student_id, order.order_transaccion_id, object).then(() => {
        this.utilService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de pago correctamente.', 'success');
        $('#modalDetailsOrder').modal('hide');
        this.loadingService.hide();
      })
    )
  }

  public rejectedOrder(order: Orders) {
    this.loadingService.show('Procesando');
    let object: Orders = {
      order_state_payment_method: false,
      order_state_payment_method_string: 'Rechazada',
    }

    this.ordersService.updateStatePaymentMethodInProvider(this.infoUser.user_id, order.order_transaccion_id, object).then(() =>
      this.ordersService.updateStatePaymentMethodInStudent(this.infoUser.user_id, order.order_student_id, order.order_transaccion_id, object).then(() => {
        this.utilService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de pago correctamente.', 'success');
        $('#modalDetailsOrder').modal('hide');
        this.loadingService.hide();
      })
    )
  }

  convertToDate(timestamp: any): Date | null {
    return timestamp?.toDate ? timestamp.toDate() : null;
  }

  openVoucherModal(): void {
    ($('#voucherModal') as any).modal('show');
  }
}
