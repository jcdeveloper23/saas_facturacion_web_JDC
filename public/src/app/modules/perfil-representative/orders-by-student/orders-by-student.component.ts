import { Component, OnInit, ViewChild } from '@angular/core';
import { DateRange, MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePicker } from 'app/interfaces/datepicker';
import { Orders } from 'app/interfaces/orders';
import { Product } from 'app/interfaces/product';
import { Provider } from 'app/interfaces/provider';
import { Student } from 'app/interfaces/student';
import { LoadingService } from 'app/services/loading/loading.service';
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

  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableOrders") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Orders>;

  public student: Student;
  public arrayOrders: Orders[];
  public arrayOrdersDelivered: Orders[];
  public student_id = this.activatedRoute.snapshot.params.student_id;
  public product: Product[];
  public order_detail: Orders;
  public array_products: Product[];
  public info_provider: Provider;
  public lastVisibleDoc: any = null;


  public displayedColumns: string[] = [
    "code",
    "dateOrder",
    "statusPay",
    "statusOrder",
    "value",
    "options",
  ];

  /**
   * *** Filtros ***
   */
  public filters = {
    status: 'Todos',
    paymentStatus: 'Todos',
    startDate: null,
    endDate: null,

  };
  public filtroEstadoOrden: string = '';
  public filtroEstadoPago: string = '';
  public fechaDesde?: string;
  public fechaHasta?: string;
  public busquedaOrden: string = '';


  /**
   * *** Fechas ***
   */
  // public minDate: string = "";
  public minDate = { year: 2025, month: 4, day: 1 };
  // public startDate  = new Date(); // DatePicker = {};
  // public endDate = new Date(); // DatePicker = {};
  // public dateStart : any;
  // public dateEnd : any;
  /*
  * *** Esta es la variable para el rango de fechas ***
  */
  public dateRange!: DateRange<Date>;


  constructor(
    private activatedRoute: ActivatedRoute,
    private studentService: StudentService,
    private orderService: OrdersService,
    private router: Router,
    public loadingService: LoadingService,
  ) { }

  ngOnInit(): void {
    this.loadingService.show('Cargando...');

    this.setDates();

    this.student = {};
    this.getInfoStudent();

    /**
     * *** Carga inicial con el filtro de fechas ***
     */
    this.loadFilteredOrders();

  }

  /**
   * *** seteamos las fechas de los filtros ***
   */
  setDates() {
    /**
     * *** Obtenemos las fecha para filtrar ultimas dos semanas ***
     */
    const today = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 1);
    
    this.filters.startDate = twoWeeksAgo;
    this.filters.endDate = today;
  }

  convertToDate(timestamp: any): Date | null {
    return timestamp?.toDate ? timestamp.toDate() : null;
  }

  loadOrders(pageSize = 10) {
    this.studentService.getOrdersPendingByStudentPaginated(
      this.student_id,
      {
        estadoPago: this.filtroEstadoPago || undefined,
        estadoOrden: this.filtroEstadoOrden || undefined,
        fechaDesde: this.fechaDesde ? new Date(this.fechaDesde) : undefined,
        fechaHasta: this.fechaHasta ? new Date(this.fechaHasta) : undefined,
      },
      pageSize,
      this.lastVisibleDoc // para paginación
    ).subscribe(orders => {
      this.arrayOrders = orders;
      this.dataSource = new MatTableDataSource(this.arrayOrders);
      this.dataSource.sort = this.sort;
      this.dataSource.paginator = this.paginator;

      // Guarda el último documento para usarlo en startAfter
      if (orders.length > 0) {
        this.lastVisibleDoc = orders[orders.length - 1]['order_date'];
      }
    });
  }
  /**
   * *** Cargamos los pedidos filtrados por el estudiante ***
   */
  public loadFilteredOrders(reset = true) {
    console.log('*** loadFilteredOrders ***');

    /**
     * *** Arreglamos las fechas para el filtro ***
     */
    this.filters.startDate.setHours(0, 0, 0, 0);
    this.filters.endDate.setHours(23, 59, 59, 999);

    this.loadingService.show('Cargando...');
    if (reset) {
      this.lastVisibleDoc = null;
    }

    this.studentService.getOrdersPendingByStudentPaginatedFilter(this.student_id, this.filters, this.lastVisibleDoc)
      .subscribe(result => {
        if (reset) {
          this.arrayOrders = result.data;
        } else {
          this.arrayOrders = [...this.arrayOrders, ...result.data];
        }

        console.log('*** arrayOrders ***');
        console.log(JSON.stringify(this.arrayOrders, null, 2));

        this.lastVisibleDoc = result.lastDoc;
        this.dataSource = new MatTableDataSource(this.arrayOrders);
        this.dataSource.sort = this.sort;
        this.dataSource.paginator = this.paginator;
        this.loadingService.hide();
      });
  }

  public goBehind() {
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
      this.dataSource = new MatTableDataSource<Orders>(this.arrayOrders);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    })
  }


  public getOrdersDeliveredByStudent() {
    this.studentService.getOrdersDeliveredByStudent(this.student_id).pipe(take(1)).subscribe((orders) => {
      this.arrayOrdersDelivered = orders;
      this.dataSource = new MatTableDataSource<Orders>(this.arrayOrders);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
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

  public validateDate(type, date) {

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
    if (type === 'start') {
      // this.dateStart = year + '-' + month + '-' + day;
    } else {
      // this.dateEnd = year + '-' + month + '-' + day;
    }

    if (type === 'start') {
      this.filters.startDate = date.value;
    } else {
      this.filters.endDate = date.value;
    }


  }

  applyFilters() {
    console.log('*** applyFilters ***');
    if (this.filters.startDate && this.filters.endDate) {
      this.filters.startDate.setHours(0, 0, 0, 0);
      this.filters.endDate.setHours(23, 59, 59, 999);
      /**
       * *** Carga inicial con el filtro de fechas ***
       */
      this.loadFilteredOrders(true);
      // this.loading_orders = true
    }
  }

  // public onDateSelected(): void {

  //   const today = new Date();
  //   const selectedDate = new Date(
  //     this.daySelected.year,
  //     this.daySelected.month - 1, // Mes en Date es 0-indexado
  //     this.daySelected.day
  //   );

  //   console.log('*** today ***');
  //   console.log(today);

  //   console.log('*** selectedDate ***');
  //   console.log(selectedDate);
  //   const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());


  //   const selectedDayOfWeek = selectedDate.getDay(); // 0: domingo, 6: sábado

  //   // Validar si la fecha es pasada
  //   if (selectedDate < todayDateOnly) {
  //     this.utilService.showNotification(
  //       'top', 'right', 'nc-alert-circle-i',
  //       'Seleccione una fecha válida que no sea anterior a hoy.',
  //       'warning'
  //     );
  //     /// *** Revertir seleccion al valor anterior ***
  //     this.daySelected = { ...this.previousDaySelected };
  //     return;
  //   }

  //   // Validar si es sábado (6) o domingo (0)
  //   if (selectedDayOfWeek === 0 || selectedDayOfWeek === 6) {
  //     this.utilService.showNotification(
  //       'top', 'right', 'nc-alert-circle-i',
  //       'No puede seleccionar sábados o domingos.',
  //       'warning'
  //     );
  //     /// *** Revertir seleccion al valor anterior ***
  //     this.daySelected = { ...this.previousDaySelected };
  //     return;
  //   }

  //   // Validaciones especiales para categoría menú
  //   if (false /** this.isCategoryMenu */) {
  //     // Ajustar formato del día para compatibilidad con los días disponibles (1: lunes, ..., 5: viernes)
  //     const adjustedDay = selectedDayOfWeek; // Si tu arreglo usa 1=lunes a 5=viernes, puedes ajustar aquí

  //     if (!this.productSelected.product_days_of_availability.includes(adjustedDay)) {
  //       this.utilService.showNotification(
  //         'top', 'right', 'nc-alert-circle-i',
  //         'El día seleccionado no está disponible para este producto.',
  //         'warning'
  //       );
  //       /// *** Revertir seleccion al valor anterior ***
  //       this.daySelected = { ...this.previousDaySelected };
  //       return;
  //     }

  //     const daysInAdvance = Math.floor(
  //       (selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  //     );

  //     if (daysInAdvance < 2) {
  //       this.utilService.showNotification(
  //         'top', 'right', 'nc-alert-circle-i',
  //         'Debe realizar su pedido para esta categoría con al menos 2 días de anticipación.',
  //         'warning'
  //       );
  //       /// *** Revertir seleccion al valor anterior ***
  //       this.daySelected = { ...this.previousDaySelected };
  //       return;
  //     }
  //   }

  //   /// *** Si pasa las validaciones, guardar como válida ***
  //   this.previousDaySelected = { ...this.daySelected };

  //   // *** Si todo está correcto, asignar la fecha de entrega ***
  //   this.productSelected.product_order_delivery_date =
  //     `${this.daySelected.year}-${this.pad(this.daySelected.month)}-${this.pad(this.daySelected.day)}`;
  // }

}
