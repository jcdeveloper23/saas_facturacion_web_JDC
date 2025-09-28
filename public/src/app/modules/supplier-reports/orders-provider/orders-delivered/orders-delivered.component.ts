import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Orders } from 'app/interfaces/orders';
import { Product } from 'app/interfaces/product';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { OrdersService } from 'app/services/orders/orders.service';
import { StudentService } from 'app/services/student/student.service';
import { take } from 'rxjs/operators';
declare var $: any;

@Component({
  selector: 'app-orders-delivered',
  templateUrl: './orders-delivered.component.html',
  styleUrls: ['./orders-delivered.component.css']
})
export class OrdersDeliveredComponent implements OnInit {
  @Input() infoUser: Users;
  range = new FormGroup({
    start: new FormControl(),
    end: new FormControl()
  });
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableOrdersDelivered") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Orders>;
  public displayedColumns: string[] = [
    "n",
    "student",
    "dateRequest",
    "date",
    "time",
    "amount",
    "price",
    "view"
  ];
  public dateStart: any;
  public dateEnd: any;
  public orders: Array<Orders>;
  public loading_orders = false;
  public student: Student;
  public order_detail: Orders;
  public array_products: Array<Product>
  constructor(private ordersService: OrdersService, private studentService: StudentService) { }

  ngOnInit(): void {
    this.getAllOrdersStateTru()

  }

  public getAllOrdersStateTru() {
    this.loading_orders = true
    this.ordersService.getAllOrdersByProviderStateTrue(this.infoUser.userId).pipe(take(1)).subscribe( (orders: Array<Orders>) => {
      if (orders && orders.length > 0) {
        this.setInfoOrders(orders)

      } else {
        this.loading_orders = false;
        this.orders = []
      }
    })
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

  public addEventSelectRange(e, date) {

    let day: any;
    day = new Date(date.value).getDate();
    if (day < 10) {
      day = '0' + new Date(date.value).getDate();
    }
    if (day >= 10) {
      day = new Date(date.value).getDate();
    }
    let month: any = '';
    month = (new Date(date.value).getMonth() + 1);
    if (month < 10) {
      month = '0' + (new Date(date.value).getMonth() + 1);
    }
    if (month >= 10) {
      month = (new Date(date.value).getMonth() + 1);
    }
    let year: any = '';
    year = new Date(date.value).getFullYear();
    if (e === 'start') {
      this.dateStart = year + '-' + month + '-' + day;
    } else {
      this.dateEnd = year + '-' + month + '-' + day;
    }
    if (this.dateStart && this.dateEnd) {
      this.loading_orders = true
      this.getOrdersRange()
    }
  }

  public async getOrdersRange() {
    this.orders = null;
    this.loading_orders = true

    this.ordersService.getOrdersByProviderStateTrueWithRangeDate(this.infoUser.userId, this.dateStart, this.dateEnd).pipe(take(1)).subscribe( (orders: Array<Orders>) => {
      if (orders && orders.length > 0) {
        this.setInfoOrders(orders)
      } else {
        this.loading_orders = false;
        this.orders = []
        this.dataSource = new MatTableDataSource<Orders>(orders);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      }
    })
  }

  public async viewProducts(order: Orders) {
    this.studentService.getStudentId(order.order_student_id).pipe(take(1)).subscribe((student => {
      this.student = student;
      this.order_detail = order;
      this.ordersService.getOrdersProductsByProvider(order.order_provider_id, order.order_transaccion_id).pipe(take(1)).subscribe((array_products => {
        this.array_products = array_products;
        $('#myModaldetailOrder').modal('show');
      }))
    }))
  }


  public async setInfoOrders(array_oders: Array<Orders>) {
    this.orders = null;
    for (let index = 0; index < array_oders.length; index++) {
      const element = array_oders[index];
      this.studentService.getStudentId(element.order_student_id).pipe(take(1)).subscribe((student: Student) => {
        if (student) {
          element.order_student_name = student.student_name + ' ' + student.student_lastname
        }
        this.ordersService.getOrdersProductsByProvider(this.infoUser.userId, element.order_transaccion_id).pipe(take(1)).subscribe((products: Array<Product>) => {
          if (products) {
            element.order_length_products = products.length
          }
          if (index + 1 === array_oders.length) {
            this.loading_orders = false
            this.dataSource = new MatTableDataSource<Orders>(array_oders);
            this.dataSource.paginator = this.paginator;
            this.dataSource.sort = this.sort;
          }
        })

      })

    }
  }
}

