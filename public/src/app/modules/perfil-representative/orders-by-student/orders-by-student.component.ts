import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Orders } from 'app/interfaces/orders';
import { Product } from 'app/interfaces/product';
import { Provider } from 'app/interfaces/provider';
import { Student } from 'app/interfaces/student';
import { OrdersService } from 'app/services/orders/orders.service';
import { StudentService } from 'app/services/student/student.service';
import { take } from 'rxjs/operators';
declare var $: any

@Component({
  selector: 'app-orders-by-student',
  templateUrl: './orders-by-student.component.html',
  styleUrls: ['./orders-by-student.component.css']
})
export class OrdersByStudentComponent implements OnInit {
  public student: Student;
  public arrayOrders: Orders[];
  public arrayOrdersDelivered: Orders[];
  public student_id = this.activatedRoute.snapshot.params.student_id;
  public product: Product[];
  public order_detail: Orders;
  public array_products: Product[];
  public info_provider: Provider;


  constructor(
    private activatedRoute: ActivatedRoute,
    private studentService: StudentService,
    private orderService: OrdersService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.student = {};
    this.getInfoStudent();
    this.getOrdersPendingByStudent();
    this.getOrdersDeliveredByStudent();
  }

  public goBehind(){
    this.router.navigate(['perfil-representative/childrens']);
  }

  public getInfoStudent() {
    this.studentService.getStudentId(this.student_id).pipe(take(1)).subscribe((student) => {
      this.student = student;
    })
  }

  public getOrdersPendingByStudent() {
    this.studentService.getOrdersPendingByStudent(this.student_id).subscribe((orders) => {
      this.arrayOrders = orders;
    })
  }

  public getOrdersDeliveredByStudent() {
    this.studentService.getOrdersDeliveredByStudent(this.student_id).pipe(take(1)).subscribe((orders) => {
      this.arrayOrdersDelivered = orders;
    })
  }
  public getProductDeliveredByStudent() {
    this.studentService.getProductDeliveredByStudent(this.student_id).pipe(take(1)).subscribe((product) => {
      this.product = product;
    })
  }


  public selectedOrder(order: Orders) {
  }

  public async viewProducts(order: Orders) {
    this.order_detail = order;
    this.array_products = await this.orderService.getOrdersProductsByProvider(order.order_provider_id, order.order_transaccion_id)
      .pipe(take(1)).toPromise();
    $('#modalDetailsOrder').modal('show');
  }
}
