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
import Chart from 'chart.js';
import { UtilsService } from 'app/services/utils/utils.service';
declare const $: any;

@Component({
  selector: 'app-report-provider',
  templateUrl: './report-provider.component.html',
  styleUrls: ['./report-provider.component.css']
})
export class ReportProviderComponent implements OnInit {
  public infoUser: Users;
  range = new FormGroup({
    start: new FormControl(),
    end: new FormControl()
  });
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableOrdersReport") paginator: MatPaginator;
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
  public dateStart : any;
  public dateEnd : any;
  public loading_orders = false;
  public orders : Array<Orders>;
  public canvas : any;
  public ctx;
  public gradientFill;
  public  myChart : any;
  public totalOrders : Array<Orders>;
  public array_ordersComplete : Array<boolean>;
  public array_ordersIncomplete : Array<boolean>;
  public dateActually : string;
  public timeActually : string;
  public orders_payment_card : Array<Orders>;
  public orders_payment_cash : Array<Orders>;
  public total_sales: number = 0;
  public student : Student;
  public order_detail : Orders;
  public array_products : Array<Product>;
  constructor(private ordersService : OrdersService,
    private studentService : StudentService,
    private utilService: UtilsService) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    this.getTotalOrdersProvider()
    this.getTotalOrdersPendientesByPayToSAProvider();
    this.dateActually = this.utilService.getDateCurrent();
    this.timeActually = this.utilService.getTimeCurrent();
  }



  public validateDate(e, date) {
   
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

    this.ordersService.getTotalOrdersReportRange(this.infoUser.userId, this.dateStart, this.dateEnd).pipe(take(1)).subscribe( (orders: Array<Orders>) => {
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

  public getTotalOrdersProvider() {
    this.ordersService.getTotalOrdersReport(this.infoUser.userId).subscribe((totalOrders) => {
      this.totalOrders = totalOrders;
      if (totalOrders && totalOrders.length > 0) {
        this.getPaymentMethods();
        let numberOrdersStatusTrue = this.totalOrders.map(orders => orders.order_state === true);
      this.array_ordersComplete = [];
      this.array_ordersIncomplete = [];
      for (let index = 0; index < numberOrdersStatusTrue.length; index++) {
        const element = numberOrdersStatusTrue[index];
        
        if (element === true) {
          this.array_ordersComplete.push(element)
        } else {
          this.array_ordersIncomplete.push(element)
        }
        if (this.array_ordersComplete && this.array_ordersIncomplete) {
          this.porcentageOrders()
        }
        
      }
      }
      
    })
  }

  public getTotalOrdersPendientesByPayToSAProvider() {

    this.ordersService.getTotalOrdersPendientesByPayToSAProvider(this.infoUser.userId).subscribe((totalOrders) => {
      if (totalOrders && totalOrders.length > 0) {
        var totalAmount = 0;
        var nOrders = 0;
        totalOrders.forEach(order => {
          totalAmount = totalAmount + order.order_total_to_pay;
          nOrders++;
          if (nOrders == totalOrders.length) {
          }
        });

      }
    })
  }
  // public finalizedWithPaymentMethod(paymentMethod: PaymentMethod) {
  //   console.log(paymentMethod.token);
  //   var httpOptions = {
  //     headers: new HttpHeaders({
  //       'auth-token': this.getAuthToken('UNIESCOLAR-EC-SERVER', this.provider.provider_TPP3_EC_SERVER)
  //     }),
  //   };
  //   console.log(this.getAuthToken('UNIESCOLAR-EC-SERVER', this.provider.provider_TPP3_EC_SERVER));

  //   var body = {
  //     "user": {
  //       "id": this.infoUser.userUid,
  //       "email": this.infoUser.userEmail,
  //     },
  //     "order": {
  //       "amount": parseFloat(this.order.order_total_to_pay.toFixed(2)),
  //       "taxable_amount": 0,
  //       "tax_percentage": 0,
  //       "vat": 0,
  //       "description": "Pago",
  //       "installaments": 0,
  //       "installments_type": 0,
  //       "dev_reference": this.order.order_transaccion_id,
  //     },
  //     "card": {
  //       "token": paymentMethod.token,
  //     }
  //   }

  //   var url = `https://ccapi-stg.paymentez.com/v2/transaction/debit/`;
  //   var response = this.http.post<any>(url, body, httpOptions).subscribe((response) => {
  //     console.log(response);
  //     console.log(response.transaction.status);
  //     if (response.transaction.status == "success") {
  //       this.orderService.saveDetailsPaymentInProvider(this.order.order_transaccion_id, this.provider.provider_id, response).then(async () => {
  //         this.registerOrder();
  //       });
  //     }
  //   });





  // }

  public getPaymentMethods() {
    this.orders_payment_card = [];
    this.orders_payment_cash = [];
    let paymenth_method = this.totalOrders.map(orders => orders.order_payment_method === 'Tarjeta');
    for (let index = 0; index < this.totalOrders.length; index++) {
      const element : Orders = this.totalOrders[index];
        if (element.order_payment_method === 'Tarjeta') {
          this.orders_payment_card.push(element)
        } else {
          this.orders_payment_cash.push(element)
        }
        this.total_sales = (this.total_sales + element.order_total_to_pay)
        if (this.orders_payment_card && this.orders_payment_cash) {
          this.porcentagePaymentMethods()
        }
    }
    
  }

  public  porcentagePaymentMethods() {
    this.canvas = document.getElementById("chartPaymenthMethod");
    this.ctx = this.canvas.getContext("2d");

    this.myChart = new Chart(this.ctx, {
      type: 'pie',
      data: {
        labels: [1, 2],
        datasets: [{
          label: "Emails",
          pointRadius: 0,
          pointHoverRadius: 0,
          backgroundColor: [
            '#e3e3e3',
            '#fcc468  ',
          ],
          borderWidth: 0,
          hoverBackgroundColor : [
            '#e3e3e3',
            '#fcc468  ',
          ],
          data: [this.orders_payment_card.length, this.orders_payment_cash.length]
        }]
      },
      options: {
        legend: {

          display: false
        },

        tooltips: {
          enabled: false
        },

        scales: {
          yAxes: [{

            ticks: {
              display: false
            },
            gridLines: {
              drawBorder: false,
              zeroLineColor: "transparent",
              color: 'rgba(255,255,255,0.05)'
            }

          }],

          xAxes: [{
            barPercentage: 1.6,
            gridLines: {
              drawBorder: false,
              color: 'rgba(255,255,255,0.1)',
              zeroLineColor: "transparent"
            },
            ticks: {
              display: false,
            }
          }]
        },
      }
    });
  }

  public porcentageOrders() {
    this.canvas = document.getElementById("chartEmail");
    this.ctx = this.canvas.getContext("2d");

    this.myChart = new Chart(this.ctx, {
      type: 'pie',
      data: {
        labels: [1, 2],
        datasets: [{
          label: "Emails",
          pointRadius: 0,
          pointHoverRadius: 0,
          backgroundColor: [
            '#4acccd',
            '#e3e3e3',
          ],
          borderWidth: 0,
          hoverBackgroundColor : [
            '#4acccd',
            '#e3e3e3',
          ],
          data: [this.array_ordersComplete.length, this.array_ordersIncomplete.length]
        }]
      },
      options: {

        legend: {

          display: false
        },

        tooltips: {
          enabled: false
        },

        scales: {
          yAxes: [{

            ticks: {
              display: false
            },
            gridLines: {
              drawBorder: false,
              zeroLineColor: "transparent",
              color: 'rgba(255,255,255,0.05)'
            }

          }],

          xAxes: [{
            barPercentage: 1.6,
            gridLines: {
              drawBorder: false,
              color: 'rgba(255,255,255,0.1)',
              zeroLineColor: "transparent"
            },
            ticks: {
              display: false,
            }
          }]
        },
      }
    });
  }

  public async viewProducts(order: Orders) {
    let day = new Date().getDate();
    let month = new Date().getMonth() + 1;
    let year = new Date().getFullYear();
    this.dateActually = year + '-' + month + '-' + day;
    this.student = await this.studentService.getStudentId(order.order_student_id).pipe(take(1)).toPromise();
    this.order_detail = order;
    this.array_products = await this.ordersService.getOrdersProductsByProvider(order.order_provider_id, order.order_transaccion_id).pipe(take(1)).toPromise()
    $('#myModaldetailOrder').modal('show');

  }
}
