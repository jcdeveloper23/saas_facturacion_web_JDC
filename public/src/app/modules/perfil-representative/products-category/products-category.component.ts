import { THIS_EXPR } from '@angular/compiler/src/output/output_ast';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, ActivationEnd, Router } from '@angular/router';
import { CalendarOptions, EventClickArg } from '@fullcalendar/angular';
import { Calendar } from 'app/interfaces/calendar';
import { Lines } from 'app/interfaces/lines';
import { Menu } from 'app/interfaces/menu';
import { Product } from 'app/interfaces/product';
import { Provider } from 'app/interfaces/provider';
import { LinesService } from 'app/services/lines/lines.service';
import { ManageMenuService } from 'app/services/manage-menu/manage-menu.service';
import { ProductsService } from 'app/services/products/products.service';
import { ProviderService } from 'app/services/provider/provider.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
declare var $: any;
@Component({
  selector: 'app-products-category',
  templateUrl: './products-category.component.html',
  styleUrls: ['./products-category.component.css']
})
export class ProductsCategoryComponent implements OnInit {

  public productsAllLength: Array<Product>;
  public allCategories: Array<Lines>;
  public product: Product;
  public isViewDetailProduct = false;
  public info_provider: Provider;
  public student_id = this.activatedRoute.snapshot.params.student_id;
  public provider_id = this.activatedRoute.snapshot.params.provider_id;
  public category_id = this.activatedRoute.snapshot.params.category_id;
  public category: Lines;
  public product_list: Array<Product>;
  public optionActive = '';
  public hiddenButton = false;
  public productsOfCategoryAll: Array<Array<Product>>;
  public hiddenInCategoryAll: Array<boolean> = [];
  public isViewDaysCategoryMenu = false;
  public isViewDaysCategoryMenuInAllCategory: Array<boolean> = [];
  public array_week = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  public array_menu: Array<Menu>;
  public array_events: Array<Calendar> = [];
  calendarOptions: CalendarOptions = {
  };
  appointment: any;
  public menuSelect: Menu;
  public monthSelect: any;

  constructor(private activatedRoute: ActivatedRoute,
    private router: Router,
    private productService: ProductsService,
    private categoryService: LinesService,
    private providerService: ProviderService,
    private menuService: ManageMenuService,
    private utilSevrice: UtilsService) { }

  ngOnInit(): void {
    this.validateUrl();

  }

  /**
 * Método para validar datos obtenidos de url
 */
  public validateUrl() {
    if (this.category_id !== 'all') {
      this.getInfoCategoryId();

    } else {
      this.getInfoProvider()
      this.getAllProductsActive()
      this.getAllCategories()
    }

  }

  public getAllCategories() {
    this.categoryService.getLinesActive(this.provider_id).pipe(take(1)).subscribe((categories) => {
      let arrayCategories : Array<Lines> = categories.filter((category: Lines) => !category.category_is_menu );
      this.allCategories = arrayCategories;
      if (categories) {
        this.getProductsByCategoryIdInAll()

      }
    })
  }

  public getProductsByCategoryIdInAll() {
    this.productsOfCategoryAll = []
    for (let index = 0; index < this.allCategories.length; index++) {
      const category = this.allCategories[index];
      this.hiddenInCategoryAll[index] = false;
      this.isViewDaysCategoryMenuInAllCategory[index] = false;
      if (category.category_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'menu') {
        this.isViewDaysCategoryMenuInAllCategory[index] = true;
      }
      this.productService.getProductsByCategoryIdActiveAndProviderIdselectCategoryAll(category.category_id, this.provider_id, index).pipe(take(1)).subscribe((products) => {
        this.productsOfCategoryAll[index] = products;
        if (products && products.length < 6) {
          this.hiddenInCategoryAll[index] = true
        }
      })

    }
  }

  public getInfoProvider() {
    this.providerService.getProviderId(this.provider_id).pipe(take(1)).subscribe((provider) => {
      this.info_provider = provider
    })
  }

  public getProductsAllActives() {
    this.productService.getProductsAllActives(this.provider_id).pipe(take(1)).subscribe(products => {
      this.product_list = products;
    })
  }

  public getAllProductsCategory() {
    this.productService.getAllProductsOfCategory(this.category_id, this.provider_id).pipe(take(1)).subscribe(products => {
      this.productsAllLength = products;

    })
  }

  public getAllProductsActive() {
    this.productService.getProductsAllBydActive(this.provider_id).pipe(take(1)).subscribe(products => {
      this.productsAllLength = products;
    })
  }

  /**
 * Método para escuchar cambio  de url 
 */
  public checkEventsInUrl() {
    this.router.events.subscribe((event) => {
      if (event instanceof ActivationEnd) {
        if (
          event.snapshot.params["category_id"]
        ) {
          this.category_id = event.snapshot.params["category_id"];
          if (this.category_id !== 'all') {
            this.getInfoCategoryId();
          } else {
            this.getInfoProvider()
            this.getAllProductsActive()
            this.getAllCategories()
          }
        } if (
          event.snapshot.params["student_id"]
        ) {
          this.student_id = event.snapshot.params["student_id"];

        }
      }
    });
  }

  public getProductsByCategory(category_id: string) {
    this.productService.getProductsByCategoryIdActiveAndProviderId(category_id, this.provider_id).pipe(take(1)).subscribe((products: Array<Product>) => {
      this.product_list = products;
      if (products && this.productsAllLength) {
        if (this.productsAllLength.length - products.length > 0) {
          this.hiddenButton = false

        } else {
          this.hiddenButton = true

        }
      }
      this.getInfoCategoryId();

    })
  }

  public moreSix() {
    if (this.category_id !== 'all') {
      this.productService.getMoreSix(this.category_id, this.provider_id).pipe(take(1)).subscribe(products => {
        if (products.length < 6) {
          this.hiddenButton = true;
        }
        products.forEach(element => {
          if (!this.product_list.includes(element)) {
            this.product_list.push(element);
          }
        });
      })
    }
  }

  public moreSixCategoryAll(category_id: string, index: number) {
    this.productService.getMoreSixCategoryAll(this.category_id, this.provider_id, index).pipe(take(1)).subscribe(products => {
      if (products.length < 6) {
        this.hiddenInCategoryAll[index] = true;
      }
      products.forEach(element => {
        if (!this.productsOfCategoryAll[index].includes(element)) {
          this.productsOfCategoryAll[index].push(element);
        }
      });
    })
  }

  public getInfoCategoryId() {
    this.categoryService.getLineById(this.category_id).pipe(take(1)).subscribe((category: Lines) => {
      this.category = category;
      if (category.category_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'menu') {
        this.isViewDaysCategoryMenu = true;
        if (this.monthSelect === undefined) {
          let year = new Date().getFullYear();
          let month = new Date().getMonth();
          let day = new Date().getDate();
          let days = new Date(year, (month + 1), 0).getDate();

          if (days - day === 0) {
            day = 2;
            month = month + 1;
          } else if (days - day === 1) {
            day = 1;
            month = month + 1;
          } else if (days - day === 2 || days - day > 2) {
            day = day + 2;
          }

          let dateStart = year + '-' + this.utilSevrice.addZero((month + 1)) + '-' + this.utilSevrice.addZero(day);
          let dateEnd = year + '-' + this.utilSevrice.addZero((month + 1)) + '-' + this.utilSevrice.addZero(new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate());

          this.getEventsCalendar(dateStart, dateEnd)
        } else {
          this.setInfoEventsCalendarMenu(this.array_events)

        }


      } else {
        this.getAllProductsCategory();
        this.getProductsByCategory(this.category_id);
        this.getInfoProvider()
      }
    })
  }

  public searchProduct(e) {
    let array_products: Array<Product>;
    array_products = this.productsAllLength;

    if (this.category_id !== 'all') {
      this.product_list = [];
      array_products.forEach((product) => {
        if (
          product.product_name
            .toUpperCase()
            .includes(e.target.value.toUpperCase())
        ) {
          this.product_list.push(product);
        }
        if (e.target.value === "") {
          this.getProductsByCategory(this.category_id)
        }
      });
    } else {
      this.productsOfCategoryAll[0] = [];
      this.allCategories = []
      array_products.forEach((product) => {
        if (
          product.product_name
            .toUpperCase()
            .includes(e.target.value.toUpperCase())
        ) {
          this.productsOfCategoryAll[0].push(product);
        }
        if (e.target.value === "") {
          this.getAllCategories()
        }
      });
    }

  }

  public viewDetailProduct(product: Product) {
    this.isViewDetailProduct = true;
    this.product = product;
  }

  public closeModal() {
    this.isViewDetailProduct = false,
      this.product = {};
    this.validateUrl()
    $('#collapse-detailProduct').collapse('hide');
    $("body").addClass("overflow");
  }

  public goBehind() {
    this.router.navigate(['perfil-representative/student/' + this.student_id + '/providers/' + this.provider_id]);

  }

  public getEventsCalendar(dateStart: any, dateEnd: any) {
    this.menuService.getEventsMenuStart(this.provider_id, dateStart).pipe(take(1)).subscribe((events: Array<Menu>) => {

      this.array_menu = events;
      this.array_events = []
      if(events.length > 0) {
        for (let index = 0; index < events.length; index++) {
          const element = events[index];
          let eventCalendar: Calendar = {
            title: element.menu_product.product_name,
            start: element.menu_date,
            className: 'event-default',
            allDay: false,
            description: index
          }
          this.array_events.push(eventCalendar);
          if (this.array_events.length === events.length) {
            this.setInfoEventsCalendarMenu(this.array_events)
          }
        }
      } else {
        this.setInfoEventsCalendarMenu([])
      }
    })
  }

  public setInfoEventsCalendarMenu(e) {
    const $calendar = $('#fullCalendar');

    this.calendarOptions = {
      headerToolbar: {
        left: "title",
        right: "prev,next",
      },
      locale: 'es',
      initialView: "dayGridMonth",
      eventClick: this.handleEventClick.bind(this),
      events: e,
      selectable: false
    };
  }

  /**
    * *** Validamos el evento click sobre una hora acupada para dar un mensaje al usuario ***
    * @param clickInfo
    * @returns
    */
  async handleEventClick(clickInfo: EventClickArg) {
    this.appointment = clickInfo.event.toJSON();
    this.menuSelect = this.array_menu[this.appointment.extendedProps.description];
    this.viewDetailProduct(this.menuSelect.menu_product)
  }

  nextMonth() {
    if (this.monthSelect === undefined) {
      this.monthSelect = (new Date().getMonth()) + 2;
    } else {
      this.monthSelect = (this.monthSelect + 1)
    }
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    let day = new Date().getDate();
    let days = new Date(year, (month + 1), 0).getDate();
    if (days - day === 1) {
      day = 2;
    } else if (days - day >= 2) {
      day = 1
    }


    let dateStart = year + '-' + this.utilSevrice.addZero((this.monthSelect)) + '-' + this.utilSevrice.addZero(day);
    let dateEnd = year + '-' + this.utilSevrice.addZero((this.monthSelect)) + '-' + this.utilSevrice.addZero(new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate());
    this.getEventsCalendar(dateStart, dateEnd)

  }
  prevMonth() {
    if (this.monthSelect === undefined) {
      this.monthSelect = (new Date().getMonth()) - 2;
    } else {
      this.monthSelect = (this.monthSelect - 1)
    }
    if (this.monthSelect < (new Date().getMonth()) + 1) {
    }
    let year = new Date().getFullYear();
    let day = new Date().getDate()
    let month = new Date().getMonth() + 1;
    let days = new Date(year, (month + 1), 0).getDate();

    if (this.monthSelect === (new Date().getMonth() + 1)) {
      if (days - day === 0) {
        day = 2;
        month = month + 1;
      } else if (days - day === 1) {
        day = 1;
        month = month + 1;
      } else if (days - day === 2 || days - day > 2) {
        day = day + 2;
      }
    }

    let dateStart = year + '-' + this.utilSevrice.addZero((this.monthSelect)) + '-' + this.utilSevrice.addZero(day);
    let dateEnd = year + '-' + this.utilSevrice.addZero((this.monthSelect)) + '-' + this.utilSevrice.addZero(new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate());
    this.getEventsCalendar(dateStart, dateEnd)
  }

  ngAfterViewInit(): void {
    // $('.fc-prev-button').on('click', x => {
    //   this.prevMonth()
    // });
    // $('.fc-next-button').on('click', x => {
    //   this.nextMonth()
    // });
  }
}
