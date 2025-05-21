import { async } from '@angular/core/testing';
import { Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';
import { ActivatedRoute, ActivationEnd, Router } from '@angular/router';
import { Lines } from 'app/interfaces/lines';
import { Orders } from 'app/interfaces/orders';
import { PaymentMethod } from 'app/interfaces/payment_method';
import { Product } from 'app/interfaces/product';
import { Provider } from 'app/interfaces/provider';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { LinesService } from 'app/services/lines/lines.service';
import { OrdersService } from 'app/services/orders/orders.service';
import { ProductsService } from 'app/services/products/products.service';
import { ProviderService } from 'app/services/provider/provider.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StorageService } from 'app/services/storage/storage.service';
import { StudentService } from 'app/services/student/student.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { take } from 'rxjs/operators';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';

import Swal from 'sweetalert2';
import { environment } from 'environments/environment';
declare var $: any;

export interface DatePicker {
  day?: number,
  year?: number,
  month?: number,
}

@Component({
  selector: 'app-create-order',
  templateUrl: './create-order.component.html',
  styleUrls: ['./create-order.component.css']
})
export class CreateOrderComponent implements OnInit {
  @ViewChild('cart', { static: false }) cartIcon!: ElementRef;
  @ViewChild('productImage') productImage!: ElementRef;

  public providersList: Array<Provider>;
  public providerSelected: Provider = {};
  public productsCartInCache: Array<Product> = [];
  public student: Student = {};
  public student_id = this.activatedRoute.snapshot.params.student_id;
  public infoUser: Users;
  public representative: Representative;

  /**
   * *** Categprias ***
   */
  public categoriesList: Array<Lines>;
  selectedCategoryId: string | null = null;


  /**
   * *** Mantiener la lista original completa **
   */
  public allProducts: Array<Product> = [];
  public product_list: Array<Product> = [];

  public productSelected: Product = {};

  public year: number;
  public month: number;
  public day: number;
  public dayOfWeekNumberMenu: number;

  public order: Orders = {
    order_total_to_pay: 0,
    order_subtotal_price: 0,
  };

  /**
   * *** Para el manejo de Fechas ***
   */
  /// *** Dia seleccionada ***
  public daySelected: DatePicker = {}
  /// *** Almacenamos la fecha previa seleccionada ***
  public previousDaySelected: DatePicker = {}
  /// *** fecha minima de compra ***
  public minDate: string = ""


  /**
   * *** Para el manejo de las imagenes de transferencias ***
   */
  public preview_url_image: any;
  public fileDataImage: File;

  /**
   * *** Para pago con tarjeta ***
   */
  public cvc: number = null;
  public paymentMethodSelected: PaymentMethod;
  /**
   * *** Lista de tarjetas del cliente ***
   */
  public arrayPaymentMethod: PaymentMethod[] = [];

  /**
   * *** Controla si se muestra el modal del detalle de producto antes de agregarlo al carrito ***
   */
  public isViewDetailProduct = false;

  /**
   * *** Valor par buscar productos ***
   */
  public productSearchTerm: string = '';


  constructor(
    private router: Router,
    private representativeService: RepresentativeService,
    private providersService: ProviderService,
    private activatedRoute: ActivatedRoute,
    private studentService: StudentService,
    private linesService: LinesService,
    private productService: ProductsService,
    private utilService: UtilsService,
    private storageService: StorageService,
    private orderService: OrdersService,
    private http: HttpClient,
    private renderer: Renderer2, 
    private el: ElementRef
  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem('infoUser'));
    if (this.infoUser === null) {
      this.router.navigate([''])
    } else {
      this.getInfoRepresentative();
      this.validateUrl()
    }

    this.productSelected.product_delivery_method = "i withdraw";
    this.getLocalStorageCart();

    /**
     * *** Obtenemos la fecha actual ***
     * *** [dia mes ano] ***
     */
    var dateCurrent = new Date();
    this.year = dateCurrent.getFullYear();
    this.day = dateCurrent.getDate();
    this.month = dateCurrent.getMonth();

    /**
     * *** Seteamos la fecha actual ***
     */
    // $("#date").val(this.year + '-' + this.month + '-' + this.day);
    this.daySelected.day = new Date(dateCurrent).getDate();
    this.daySelected.month = (new Date(dateCurrent).getMonth() + 1);
    this.daySelected.year = new Date(dateCurrent).getFullYear();

    /// *** Guardamos la fecha previa igual a la seleccion actual ***
    this.previousDaySelected = { ...this.daySelected };

    /**
     * *** # Seteamos la fecha actual ***
     */
    this.dayOfWeekNumberMenu = dateCurrent.getDay();
  }

  ngAfterViewInit() {
    console.log('Cart icon:', this.cartIcon?.nativeElement); // Confirma si está definido
  }


  /**
    * Método para validar datos obtenidos de url
    */
  public validateUrl() {
    this.order = {
      order_total_to_pay: 0,
      order_subtotal_price: 0,
    }
    this.getInfoStudent(this.student_id);
    this.initCart()
  }
  /**
   * Método para escuchar cambio  de url
   */
  public checkEventsInUrl() {
    this.router.events.subscribe((event) => {
      if (event instanceof ActivationEnd) {
        if (
          event.snapshot.params['student_id']
        ) {
          this.student_id = event.snapshot.params['student_id'];
          this.getInfoStudent(this.student_id);
          this.initCart()
        }
      }
    });
  }

  public getInfoStudent(student_id: string) {
    this.studentService.getStudentId(student_id).pipe(take(1)).subscribe((student) => {
      this.student = student;

    })
  }

  public getInfoRepresentative() {
    this.representativeService.getRepresentativeId(this.infoUser.user_id).pipe(take(1)).subscribe(async (representative) => {
      this.representative = representative;
      if (representative) {

        await this.getProvidersList();

      }
    })
  }

  /**
   * *** Setea la data iniocial de la orden ***
   */
  public async setInfoOrder() {
    this.order.order_provider_id = this.providerSelected.provider_id;
    this.order.order_transaccion_id = new Date().getTime().toString();
    this.order.order_representative_id = this.infoUser.user_id;
    this.order.order_student_id = this.student_id;
    this.order.order_time = this.utilService.getTimeCurrent();
    this.order.order_date = this.utilService.getDateCurrent();
    this.order.order_state = false;
    this.order.order_payment_method = this.representative.representative_payment_method;

    console.log('*** ORDEN data inicial ***');

    console.log(JSON.stringify(this.order, null, 3));

  }

  public async getProvidersList() {
    this.providersService.getProvidersByUEInStateTrue(this.representative.representative_schools[0]).pipe(take(1)).subscribe(async (providers) => {
      this.providersList = providers;
      this.providerSelected = this.providersList[0];
      this.getCategoriesByProviderSelected(this.providerSelected.provider_id);

      await this.setInfoOrder();

      if (this.representative.representative_payment_method == 'Tarjeta') {
        this.searchPaymentMethod();
      }
    })
  }

  public selectProvider(provider: Provider) {
    this.router.navigate(['perfil-representative/' + '/student/' + this.student.student_id + '/providers/' + provider.provider_id]);
  }

  public goBehind() {
    this.router.navigate(['perfil-representative/childrens']);
  }

  public initCart() {
    if (JSON.parse(localStorage.getItem('productsCartInCache'))) {
      this.productsCartInCache = [];
      localStorage.setItem('productsCartInCache', JSON.stringify(this.productsCartInCache));
    } else {
      this.productsCartInCache = [];
    }
  }

  public launchModalAwaitApprobed() {
    Swal.fire({
      text: 'Por favor, espere la aprobación del bar',
      icon: 'warning',
      allowOutsideClick: false,
      allowEnterKey: false,
    });

  }

  public getCategoriesByProviderSelected(id: any): void {
    const selected = this.providersList.find(p => p.provider_id === id);

    if (selected) {
      this.providerSelected = { ...selected }; // clona el objeto para evitar mutaciones si es necesario
      console.log('Proveedor seleccionado:', this.providerSelected);

      // Limpia la lista anterior y consulta las nuevas categorías
      this.categoriesList = [];

      this.linesService.getLinesActive(this.providerSelected.provider_id).subscribe({
        next: (lines) => {
          this.categoriesList = lines;
          console.log('Categorías:', this.categoriesList);
          this.getProductsAllActives();
        },
        error: (err) => {
          console.error('Error al obtener categorías:', err);
        }
      });
    } else {
      console.warn('Proveedor no encontrado con ID:', id);
      this.providerSelected = {};
      this.categoriesList = [];
    }
  }

  public getProductsAllActives() {
    this.productService.getProductsAllActives(this.providerSelected.provider_id).subscribe({
      next: (products) => {
        this.product_list = products;
        this.allProducts = products;
        console.log('Productos:', this.product_list);
      },
      error: (err) => {
        console.error('Error al obtener productos:', err);
      }
    });
    // this.productService.getProductsAllActives(this.providerSelected.provider_id).pipe(take(1)).subscribe(products => {
    //   this.product_list = products; 
    // })
  }

  public addToCart(product: Product) {
    this.productSelected = product;
    /// *** Hacer una copia del producto para que no se vincule al que está en la vista ***
    const productClone: Product = JSON.parse(JSON.stringify(product));

    productClone.product_order_delivery_date = `${this.daySelected.year}-${this.pad(this.daySelected.month)}-${this.pad(this.daySelected.day)}`;

    if (productClone.product_order_delivery_date) {
      productClone.product_id_student = this.student_id;

      this.infoUser = JSON.parse(localStorage.getItem("infoUser") || '{}');

      if (JSON.parse(localStorage.getItem("productsCartInCache"))) {
        this.productsCartInCache = JSON.parse(localStorage.getItem("productsCartInCache"));
      } else {
        this.productsCartInCache = [];
      }

      productClone.product_quantity_in_cart = 1;
      this.productsCartInCache.push(productClone);

      localStorage.setItem("productsCartInCache", JSON.stringify(this.productsCartInCache));

      this.recalculateTotal();
      $('#myModalAddProductToCart').modal('hide');

      // this.utilService.showNotification('top', 'right', 'nc-check-2', 'Se ha añadido correctamente el producto al carrito.', 'success');
    } else {
      this.utilService.showNotification('top', 'right', 'nc-alert-circle-i', 'Por favor complete el campo fecha de entrega.', 'warning');
      this.isViewDetailProduct = false;
    }
  }

  public getLocalStorageCart() {
    this.productsCartInCache = []
    if (JSON.parse(localStorage.getItem("productsCartInCache"))) {
      this.productsCartInCache = JSON.parse(
        localStorage.getItem("productsCartInCache")
      );
    } else {
      this.productsCartInCache = [];
      this.validateCategory();
    }
    return this.productsCartInCache.length;
  }

  public onDateSelectedOLD() {
    this.productSelected.product_order_delivery_date = null
    if (this.daySelected.year < this.year) {
      this.utilService.showNotification('top', 'right', 'nc-alert-circle-i', 'Seleccione un año correcto, superior al año actual.', 'warning')
    } else {
      if (this.daySelected.month < this.month) {
        this.utilService.showNotification('top', 'right', 'nc-alert-circle-i', 'Seleccione un mes correcto, superior al mes actual.', 'warning')
      } else {
        var dateSelected = $("#date").val();
        let daySelect = (new Date(dateSelected).getDay());
        if (this.daySelected.day < this.day || daySelect === 5 || daySelect === 6) {
          this.utilService.showNotification('top', 'right', 'nc-alert-circle-i', 'Seleccione un día correcto, superior al día actual sin incluir los días Sabados y Domingos .', 'warning')
        } else {
          if (false /** this.isCategoryMenu */) {
            var date = $("#date").val();
            let day = (new Date(date).getDay());
            if (day === 6) {
              day = 0
            } else {
              day = day + 1
            }

            if (this.productSelected.product_days_of_availability.includes(day)) {
              if (this.daySelected.day - new Date().getDate() >= 2) {
                this.productSelected.product_order_delivery_date = this.daySelected.year + "-" + this.daySelected.month + "-" + this.daySelected.day

              } else {
                this.utilService.showNotification('top', 'right', 'nc-alert-circle-i', 'Recuerde que debe realizar su pedido para la categoría menú con dos días de anticipación.', 'warning')

              }
            } else {
              this.utilService.showNotification('top', 'right', 'nc-alert-circle-i', 'El día seleccionado no corresponde a los días disponibles.', 'warning')
            }
          } else {
            this.productSelected.product_order_delivery_date = this.daySelected.year + "-" + this.daySelected.month + "-" + this.daySelected.day
          }
        }
      }
    }
  }

  public onDateSelected(): void {
    this.productSelected.product_order_delivery_date = null;

    const today = new Date();
    const selectedDate = new Date(
      this.daySelected.year,
      this.daySelected.month - 1, // Mes en Date es 0-indexado
      this.daySelected.day
    );

    console.log('*** today ***');
    console.log(today);

    console.log('*** selectedDate ***');
    console.log(selectedDate);
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());


    const selectedDayOfWeek = selectedDate.getDay(); // 0: domingo, 6: sábado

    // Validar si la fecha es pasada
    if (selectedDate < todayDateOnly) {
      this.utilService.showNotification(
        'top', 'right', 'nc-alert-circle-i',
        'Seleccione una fecha válida que no sea anterior a hoy.',
        'warning'
      );
      /// *** Revertir seleccion al valor anterior ***
      this.daySelected = { ...this.previousDaySelected };
      return;
    }

    // Validar si es sábado (6) o domingo (0)
    if (selectedDayOfWeek === 0 || selectedDayOfWeek === 6) {
      this.utilService.showNotification(
        'top', 'right', 'nc-alert-circle-i',
        'No puede seleccionar sábados o domingos.',
        'warning'
      );
      /// *** Revertir seleccion al valor anterior ***
      this.daySelected = { ...this.previousDaySelected };
      return;
    }

    // Validaciones especiales para categoría menú
    if (false /** this.isCategoryMenu */) {
      // Ajustar formato del día para compatibilidad con los días disponibles (1: lunes, ..., 5: viernes)
      const adjustedDay = selectedDayOfWeek; // Si tu arreglo usa 1=lunes a 5=viernes, puedes ajustar aquí

      if (!this.productSelected.product_days_of_availability.includes(adjustedDay)) {
        this.utilService.showNotification(
          'top', 'right', 'nc-alert-circle-i',
          'El día seleccionado no está disponible para este producto.',
          'warning'
        );
        /// *** Revertir seleccion al valor anterior ***
        this.daySelected = { ...this.previousDaySelected };
        return;
      }

      const daysInAdvance = Math.floor(
        (selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysInAdvance < 2) {
        this.utilService.showNotification(
          'top', 'right', 'nc-alert-circle-i',
          'Debe realizar su pedido para esta categoría con al menos 2 días de anticipación.',
          'warning'
        );
        /// *** Revertir seleccion al valor anterior ***
        this.daySelected = { ...this.previousDaySelected };
        return;
      }
    }

    /// *** Si pasa las validaciones, guardar como válida ***
    this.previousDaySelected = { ...this.daySelected };

    // *** Si todo está correcto, asignar la fecha de entrega ***
    this.productSelected.product_order_delivery_date =
      `${this.daySelected.year}-${this.pad(this.daySelected.month)}-${this.pad(this.daySelected.day)}`;
  }

  // Método auxiliar para formatear con 2 dígitos
  private pad(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  public validateCategory() {
    this.order.order_subtotal_price = 0;
    this.order.order_total_to_pay = 0;
    let subtotal = 0
    for (let index = 0; index < this.productsCartInCache.length; index++) {
      const product = this.productsCartInCache[index];
      subtotal = parseFloat(subtotal.toString()) + parseFloat(product.product_price.toString());
      product.product_subtotal = product.product_price;
      product.product_state_in_order = false;
      /// *** OJO ANALIZAR PARA MENU ***
      // this.isViewDaysCategoryMenuInAllCategory[index] = false;
      // this.categoryService.getLineById(product.product_id_category).pipe(take(1)).subscribe((category: Lines) => {
      //   if (category && category.category_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'menu') {
      //     this.isViewDaysCategoryMenuInAllCategory[index] = true;
      //   }
      // });
      if (index + 1 === this.productsCartInCache.length) {
        this.order.order_subtotal_price = subtotal;
        this.order.order_total_to_pay = subtotal;
      }
    }
  }

  /**
   * *** Aumenta cantidad ***
   * @param product 
   * @param i 
   */
  public increaseAmount(product: Product, i: number) {
    product.product_quantity_in_cart = product.product_quantity_in_cart + 1;
    this.recalculateTotal()
  }

  /**
   * *** Disminuye cantidad ***
   * @param product 
   * @param i 
   */
  public decreaseAmount(product: Product, i: number) {
    if (product.product_quantity_in_cart > 1) {
      product.product_quantity_in_cart = product.product_quantity_in_cart - 1;
      this.recalculateTotal()
    } else {
      Swal.fire({
        title: '¿Confirma que desea eliminar el producto?',
        icon: 'warning',
        showCancelButton: true,
        customClass: {
          confirmButton: 'btn btn-success',
          cancelButton: 'btn btn-danger',
        },
        confirmButtonText: 'Sí, eliminar!',
        cancelButtonText: 'Cancelar',
        buttonsStyling: false
      }).then((result) => {
        if (result.value) {
          this.productsCartInCache.splice(i, 1)
          if (this.productsCartInCache.length === 0) {
            this.router.navigate(['perfil-representative/' + 'childrens/']);
          }
          this.recalculateTotal();
        }
      })
    }
  }

  public deleteProduct(product: Product, i: number) {
    Swal.fire({
      title: '¿Confirma que desea eliminar el producto?',
      icon: 'warning',
      showCancelButton: true,
      customClass: {
        confirmButton: 'btn btn-success',
        cancelButton: 'btn btn-danger',
      },
      confirmButtonText: 'Sí, eliminar!',
      cancelButtonText: 'Cancelar',
      buttonsStyling: false
    }).then((result) => {
      if (result.value) {
        this.productsCartInCache.splice(i, 1);
        if (this.productsCartInCache.length === 0) {
          this.router.navigate(['perfil-representative/' + 'childrens/']);

        }
        this.recalculateTotal()
      }
    })
  }

  /**
   * *** Recalcula costos ***
   */
  public recalculateTotal() {
    let subtotal = 0
    for (let index = 0; index < this.productsCartInCache.length; index++) {
      const product = this.productsCartInCache[index];
      subtotal = parseFloat(subtotal.toString()) + (parseFloat(product.product_price.toString()) * product.product_quantity_in_cart);
      product.product_subtotal = (parseFloat(product.product_price.toString()) * product.product_quantity_in_cart)
      if (index + 1 === this.productsCartInCache.length) {
        this.order.order_subtotal_price = subtotal;
        this.order.order_total_to_pay = subtotal;
      }
    }
  }

  public async completePurchase() {
    $('#myModalcompleteOrder').modal('show')
  }

  public async cancelPurchase() { }

  public async registerOrder() {
    if (this.fileDataImage && this.order.order_payment_method === 'Efectivo') {
      this.order.order_state_payment_method = false;
      this.order.order_state_payment_to_super_admin = false;
      this.preview_url_image = null
      await this.storageService.uploadFile(`order/order${this.order.order_transaccion_id}/image_.png`, this.fileDataImage).then((result) => {
        this.order.order_image_payment_cash = result;
      })
      this.orderService.saveOrderInStudent(this.student_id, this.order);
      this.orderService.saveOrderInProvider(this.order).then(async () => {
        for (let index = 0; index < this.productsCartInCache.length; index++) {
          const product = this.productsCartInCache[index];
          product.product_id_transaction = 'product_' + index,
            await this.orderService.saveProductInOrder(this.order.order_transaccion_id, product.product_provider_id, product);
          await this.orderService.saveProductInOrderInStudent(this.student_id, this.order.order_transaccion_id, product);
          if (index + 1 === this.productsCartInCache.length) {
            $('myModalcompleteOrder').modal('hide')
            $('body').removeClass('modal-open');
            $('.fade').remove();
            Swal.fire({
              title: "Se completó su compra exitosamente, la podrá encontrar en su lista de pedidos.",
              buttonsStyling: false,
              customClass: {
                confirmButton: "btn btn-success",
              },
              confirmButtonText: "Aceptar"
            })
            this.router.navigate(['perfil-representative/' + 'childrens/']);
          }
        }
      })


    } else { /// *** solo se genera orden con tarjeta si el pago esta en estado success por paymentez ***
      this.order.order_state_payment_method = true;
      this.order.order_state_payment_to_super_admin = false;
      this.order.order_state_payment_method_string = 'Aceptada';
      this.orderService.saveOrderInStudent(this.student_id, this.order);
      this.orderService.saveOrderInProvider(this.order).then(async () => {
        for (let index = 0; index < this.productsCartInCache.length; index++) {
          const product = this.productsCartInCache[index];
          product.product_id_transaction = 'product_' + index
          await this.orderService.saveProductInOrder(this.order.order_transaccion_id, product.product_provider_id, product);
          await this.orderService.saveProductInOrderInStudent(this.student_id, this.order.order_transaccion_id, product);
          if (index + 1 === this.productsCartInCache.length) {
            $('myModalcompleteOrder').modal('hide')
            $('body').removeClass('modal-open');
            $('.fade').remove();
            Swal.fire({
              title: "Se completó su compra exitosamente, la podrá encontrar en su lista de pedidos.",
              buttonsStyling: false,
              customClass: {
                confirmButton: "btn btn-success",
              },
              confirmButtonText: "Aceptar"
            })
            this.router.navigate(['perfil-representative/' + 'childrens/']);
          }
        }
      })
    }
  }

  /**
   * *** Captura la imagen seleccionada por el usuario ***
   * @param fileInput 
   */
  public fileProgress(fileInput: any) {
    this.fileDataImage = (<File>fileInput.target.files[0]);
    this.previewUrlImage()
  }

  /**
   * *** Metodo para visualizar imagen previa. ***
   * @returns 
   */
  private previewUrlImage() {
    var mimeType = this.fileDataImage.type;
    if (mimeType.match(/image\/*/) == null) {
      return;
    }
    var reader = new FileReader();
    reader.readAsDataURL(this.fileDataImage);
    reader.onload = (_event) => {
      this.preview_url_image = reader.result;
    }
  }


  /**
   * *** Selecciona el metodo de pago ***
   * @param paymentMethod 
   */
  public selectedPaymentMethod(paymentMethod: PaymentMethod) {
    this.paymentMethodSelected = paymentMethod;
  }

  /**
   * *** Finaliza la orden pagando con tarjete de credito o debito ***
   * @param paymentMethod 
   */
  public finalizedWithPaymentMethod(paymentMethod: PaymentMethod) {
    var httpOptions = {
      headers: new HttpHeaders({
        'auth-token': this.utilService.getAuthToken(this.providerSelected.provider_NAME_EC_SERVER, this.providerSelected.provider_KEY_EC_SERVER)
      }),
    };
    // this.infoUser.email = 'osalas@paymentez.com';
    var body = {
      "user": {
        "id": this.infoUser.user_uid,
        "email": this.infoUser.email,
      },
      "order": {
        "amount": this.order.order_total_to_pay,
        "taxable_amount": this.getBaseImp(), // valor inponible de iva 
        "tax_percentage": 12, // 12
        "vat": this.getIva(), // valor del iva
        "description": "Pago de orden número: " + this.order.order_transaccion_id,
        "installaments": 0,
        "installments_type": 0,
        "dev_reference": this.order.order_transaccion_id,
      },
      "card": {
        "token": paymentMethod.token,
        "cvc": this.cvc,
      }
    }

    var url = `${environment.urlPaymentez}/transaction/debit/`;
    var response = this.http.post<any>(url, body, httpOptions).subscribe((response) => {
      if (response.transaction.status == "success") {
        this.orderService.saveDetailsPaymentInProvider(this.order.order_transaccion_id, this.providerSelected.provider_id, response, this.infoUser).then(async () => {
          this.registerOrder();
        });
      } else {
        Swal.fire({
          title: "Error",
          buttonsStyling: false,
          text: (response.transaction.message).toString(),
          customClass: {
            confirmButton: "btn btn-success",
          },
          confirmButtonText: "Aceptar"
        })
      }
    });
  }

  /**
   * *** la base imponible ***
   * @returns 
   */
  getBaseImp() {
    var bImp = parseFloat(this.order.order_total_to_pay.toFixed(2)) / 1.12;
    return parseFloat(bImp.toFixed(2));
  }
  /**
   * *** Retorna el IVA ***
   * @returns 
   */
  getIva() {
    var iva = parseFloat(this.order.order_total_to_pay.toFixed(2)) / 1.12;
    iva = parseFloat(this.order.order_total_to_pay.toFixed(2)) - iva;
    return parseFloat(iva.toFixed(2));
  }

  /**
   * *** Si el padre paga con tarjeta las consultamos en paymentez ***
   */
  public searchPaymentMethod() {
    console.log('*** searchPaymentMethod ***');

    this.arrayPaymentMethod = [];
    if (this.providerSelected.provider_NAME_EC_SERVER != undefined) {
      var httpOptions = {
        headers: new HttpHeaders({
          'auth-token': this.utilService.getAuthToken(this.providerSelected.provider_NAME_EC_SERVER, this.providerSelected.provider_KEY_EC_SERVER)
        }),
      };
      var headers = {};
      var url = `${environment.urlPaymentez}/card/list?uid=${this.infoUser.user_uid}`;
      console.log(url);

      var resp = this.http.get<any>(url, httpOptions).subscribe((response) => {
        response['cards'].forEach(card => {
          this.arrayPaymentMethod.push(card);
        });
      });
    }
  }

  /**
   * *** Permite mostrar el detalle del producto antes de agregar al crrito ***
   * @param product 
   */
  public viewDetailProduct(product: Product) {
    product.product_delivery_method = "i withdraw";
    this.productSelected = product;
    $('#myModalAddProductToCart').modal('show');
  }

  selectCategory(category: any): void {
    if (this.selectedCategoryId === category.category_id) {
      this.selectedCategoryId = null;
      this.product_list = this.allProducts; // mostrar todos
    } else {
      this.selectedCategoryId = category.category_id;
      this.product_list = this.allProducts.filter(
        product => product.product_id_category === this.selectedCategoryId
      );
    }
  }

  // Filtra productos por nombre o por categoría seleccionada
  filterProducts() {
    const search = this.productSearchTerm.toLowerCase().trim();

    this.product_list = this.allProducts.filter(product =>
      (!this.selectedCategoryId || product.product_id_category === this.selectedCategoryId) &&
      product.product_name.toLowerCase().includes(search)
    );
  }

  flyToCart() { 
    const sourceImg = this.productImage?.nativeElement as HTMLImageElement;
    const cartEl = this.cartIcon?.nativeElement;
  
    if (!sourceImg || !cartEl) return;
  
    const cartRect = cartEl.getBoundingClientRect();
    const imgRect = sourceImg.getBoundingClientRect();
  
    const clone = sourceImg.cloneNode(true) as HTMLImageElement;
    clone.style.position = 'fixed';
    clone.style.zIndex = '9999';
    clone.style.width = imgRect.width + 'px';
    clone.style.height = imgRect.height + 'px';
    clone.style.left = imgRect.left + 'px';
    clone.style.top = imgRect.top + 'px';
    clone.classList.add('flying-img');
  
    document.body.appendChild(clone);
  
    const deltaX = cartRect.left + imgRect.left + 300;
    const deltaY = cartRect.top + imgRect.top + 200;
  
    clone.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.3}px) scale(1.2)`, opacity: 0.9 },
      { transform: `translate(${deltaX}px, ${deltaY}px) scale(0.3)`, opacity: 0 }
    ], {
      duration: 1000,
      easing: 'cubic-bezier(0.55, 0.08, 0.68, 0.53)',
    });
  
    setTimeout(() => {
      document.body.removeChild(clone);
      this.createSparks(cartRect.left + 10, cartRect.top + 10);
    }, 1000);
  }
  
  createSparks(x: number, y: number) {
    const spark = document.createElement('div');
    spark.className = 'spark-glow';
    spark.style.left = x + 'px';
    spark.style.top = y + 'px';
    document.body.appendChild(spark);
  
    setTimeout(() => spark.remove(), 800);
  }

  animateToCart(event: MouseEvent, productImageUrl: string) {
    const target = event.target as HTMLElement;
    const img = this.renderer.createElement('img');
  
    img.src = productImageUrl;
    this.renderer.addClass(img, 'flying-image');
  
    const buttonRect = target.getBoundingClientRect();
    img.style.left = `${buttonRect.left + window.scrollX}px`;
    img.style.top = `${buttonRect.top + window.scrollY}px`;
  
    this.renderer.appendChild(document.body, img);
  
    const cart = document.getElementById('shoppingCartIcon');
    if (!cart) return;
  
    const cartRect = cart.getBoundingClientRect();
    const x = cartRect.left - buttonRect.left;
    const y = cartRect.top - buttonRect.top;
  
    setTimeout(() => {
      img.style.transform = `translate(${x}px, ${y}px) scale(0.2)`;
      img.style.opacity = '0';
    }, 500);
  
    setTimeout(() => {
      this.renderer.removeChild(document.body, img);
    }, 2800);
  }
  

}
