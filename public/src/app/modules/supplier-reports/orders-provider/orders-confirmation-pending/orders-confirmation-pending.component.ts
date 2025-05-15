import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Orders } from 'app/interfaces/orders';
import { Product } from 'app/interfaces/product';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { OrdersService } from 'app/services/orders/orders.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StudentService } from 'app/services/student/student.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { take } from 'rxjs/operators';
declare var $: any;
@Component({
  selector: 'app-orders-confirmation-pending',
  templateUrl: './orders-confirmation-pending.component.html',
  styleUrls: ['./orders-confirmation-pending.component.css']
})
export class OrdersConfirmationPendingComponent implements OnInit {

  public order_detail : Orders;
  public student : Student;
  public loading_orders = false;
  public array_products : Array<Product>;
  public array_orders_confirmation_pending : Array<Orders> = [];
  @Input() infoUser: Users;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableOrdersConfirmationPending") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Orders>;
  public displayedColumns: string[] = [
    "nameRepresentative",
    "nameStudent",
    "date",
    "state",
    "view",
  ];
  constructor(private ordersService : OrdersService,
    private studentService : StudentService,
    private representativeService: RepresentativeService,
    private utilService : UtilsService) { }

  ngOnInit(): void {
    this.getOrdersConfirmationPending()
  }

  public getOrdersConfirmationPending() {
    this.loading_orders = true;
    this.ordersService.getAllOrdersConfirmationPending(this.infoUser.user_id).subscribe((orders : Array<Orders>) => {
      this.setInfoAditionalOrder(orders)
     
    })
  }

  public async setInfoAditionalOrder(orders: Array<Orders>) {
    if (orders.length > 0) {
      for (let index = 0; index < orders.length; index++) {
        const element = orders[index];
        this.studentService.getStudentId(element.order_student_id).pipe(take(1)).subscribe((student: Student) => {
          if (student) {
            element.order_student_name = student.student_name + ' ' + student.student_lastname
          }
          this.representativeService.getRepresentativeId(element.order_representative_id).pipe(take(1)).subscribe((representative : Representative) => {
            element.order_representative_name = representative.representative_name +' '+ representative.representative_surname;
          })
            if (index + 1 === orders.length) {
              this.loading_orders = false;
              this.array_orders_confirmation_pending = orders;
              this.dataSource = new MatTableDataSource<Orders>(orders);
              this.dataSource.paginator = this.paginator;
              this.dataSource.sort = this.sort;
            }
        })

      }
    } else {
      this.loading_orders = false
      this.array_orders_confirmation_pending = []

    }

  }

  public async viewProducts(order: Orders) {
    this.student = await this.studentService.getStudentId(order.order_student_id).pipe(take(1)).toPromise();
    this.order_detail = order;
    this.array_products = await this.ordersService.getOrdersProductsByProvider(order.order_provider_id, order.order_transaccion_id).pipe(take(1)).toPromise()
    $('#myModaldetailOrder').modal('show');

  }

  public accepOrder(order: Orders) {
    let object: Orders = {
      order_state_payment_method : true,
      order_state_payment_method_string : 'Aceptada',
    }
    
    this.ordersService.updateStatePaymentMethodInProvider(this.infoUser.user_id, order.order_transaccion_id, object).then(() =>
      this.ordersService.updateStatePaymentMethodInStudent(this.infoUser.user_id,order.order_student_id ,order.order_transaccion_id, object).then(() => {
        this.utilService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de pago correctamente.', 'success');
        $('#myModaldetailOrder').modal('hide');
        document.getElementById('modal-products').click();

      })
    )
  }

  public rejectedOrder(order: Orders) {
    let object: Orders = {
      order_state_payment_method : false,
      order_state_payment_method_string : 'Rechazada',
    }
    
    this.ordersService.updateStatePaymentMethodInProvider(this.infoUser.user_id, order.order_transaccion_id, object).then(() =>
      this.ordersService.updateStatePaymentMethodInStudent(this.infoUser.user_id,order.order_student_id ,order.order_transaccion_id, object).then(() => {
        this.utilService.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el estado de pago correctamente.', 'success');
        $('#myModaldetailOrder').modal('hide');
        document.getElementById('modal-products').click();

      })
    )
  }
}
