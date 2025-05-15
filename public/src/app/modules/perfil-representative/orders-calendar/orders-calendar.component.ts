import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, ActivationEnd, Router } from '@angular/router';
import { Calendar } from 'app/interfaces/calendar';
import { Orders } from 'app/interfaces/orders';
import { Student } from 'app/interfaces/student';
import { OrdersService } from 'app/services/orders/orders.service';
import { StudentService } from 'app/services/student/student.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { CalendarOptions, EventClickArg } from '@fullcalendar/angular'; // useful for typechecking
import { Product } from 'app/interfaces/product';


declare var $: any
@Component({
  selector: 'app-orders-calendar',
  templateUrl: './orders-calendar.component.html',
  styleUrls: ['./orders-calendar.component.css']
})
export class OrdersCalendarComponent implements OnInit {
  public student_id = this.activatedRoute.snapshot.params.student_id;
  public array_orders: Array<Orders>;
  public array_events: Array<Calendar> = [];
  calendarOptions: CalendarOptions = {
    locale: 'es'
  };
  appointment: any;
  public detailOrder: Orders;
  public typeComponent = 'calendar';
  public setInfoCalendar = false;
  constructor(private orderService: OrdersService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private studentService: StudentService) { }

  ngOnInit(): void {
    this.getOrdersByStudent()
  }
  public getOrdersByStudent() {
    this.orderService.getOrdersByStudent(this.student_id).pipe(take(1)).subscribe((orders) => {
      this.studentService.getStudentId(this.student_id).pipe(take(1)).subscribe(async (student: Student) => {
        this.setInfoCalendar = true;
        this.array_orders = orders;
        if (orders.length> 0) {
          for (let index = 0; index < orders.length; index++) {
            const order: Orders = orders[index];
            let productsInOrder: Array<Product>;
            productsInOrder = await this.orderService.getProductsOfOrderInStudent(this.student_id, order.order_transaccion_id).pipe(take(1)).toPromise()
              let date = order.order_date.replace(/-/g, ",");
  
              let object: Calendar = {
                title: '(' + productsInOrder.length + ')' + student.student_name + ' , ' + student.student_lastname + '-' + '$' + order.order_total_to_pay.toFixed(2),
                start: new Date(date),
                className: 'event-default',
                allDay: true,
                description: index
              }
              this.array_events[index] = object;
              
              if (index + 1 === this.array_orders.length) {
                this.setInfoOrders(this.array_events)
              }
          }
        } else {
          this.setInfoCalendar = false;
        }
       
      })
    })
  }

  public setInfoOrders(e) {
    const $calendar = $('#fullCalendar');
    const orders = e
    this.calendarOptions = {

      headerToolbar: {
        left: "title",
        right: "prev,next",
      },
      locale: 'es',
      initialView: "dayGridMonth",
      events: e,
      weekends: true,
      editable: false,
      selectable: false,
      selectMirror: true,
      dayMaxEvents: true,
      select: this.handleDateSelect.bind(this),
      eventClick: this.handleEventClick.bind(this),
      // height: "auto",
      displayEventTime: true,
      nowIndicator: false,
    };
    this.setInfoCalendar = false;

  }

  handleDateSelect(selectInfo: any) {

  }

  /**
  * *** Validamos el evento click sobre una hora acupada para dar un mensaje al usuario ***
  * @param clickInfo
  * @returns
  */
  async handleEventClick(clickInfo: EventClickArg) {
    this.appointment = clickInfo.event.toJSON();
    this.detailOrder = this.array_orders[clickInfo.event.toJSON().extendedProps.description];
    this.detailOrder.arrayProductCart = await this.orderService.getProductsOfOrderInStudent(this.student_id, this.detailOrder.order_transaccion_id).pipe(take(1)).toPromise();
    $('#myModaldetailOrder').modal('show');
  }
  /**
  * Método para escuchar cambio  de url 
  */
  public checkEventsInUrl() {
    this.router.events.subscribe((event) => {
      if (event instanceof ActivationEnd) {
        if (
          event.snapshot.params["student_id"]
        ) {
          this.student_id = event.snapshot.params["student_id"];
          this.getOrdersByStudent()

        }
      }
    });
  }
}
