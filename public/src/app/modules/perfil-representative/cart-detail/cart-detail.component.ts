import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, ActivationEnd, Router } from '@angular/router';
import { Lines } from 'app/interfaces/lines';
import { Orders } from 'app/interfaces/orders';
import { PaymentMethod } from 'app/interfaces/payment_method';
import { Product } from 'app/interfaces/product';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { LinesService } from 'app/services/lines/lines.service';
import { OrdersService } from 'app/services/orders/orders.service';
import { ProviderService } from 'app/services/provider/provider.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StorageService } from 'app/services/storage/storage.service';
import { StudentService } from 'app/services/student/student.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { utf8Encode } from '@angular/compiler/src/util';
import { sha256 } from 'js-sha256';
import { Provider } from 'app/interfaces/provider';
import { environment } from 'environments/environment';
declare var $: any;

export interface DatePicker {
  day?: number,
  year?: number,
  month?: number,
}
@Component({
  selector: 'app-cart-detail',
  templateUrl: './cart-detail.component.html',
  styleUrls: ['./cart-detail.component.css']
})
export class CartDetailComponent implements OnInit {
  public year: number;
  public month: number;
  public day: number;
  public dayselected: DatePicker = {};
  public array_week = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  public productsCart: Array<Product>;
  public student: Student
  public student_id = this.activatedRoute.snapshot.params.student_id;
  public provider_id: string;
  public isViewDaysCategoryMenuInAllCategory: Array<boolean> = [];
  public order: Orders;
  public infoUser: Users;
  public representative: Representative;
  public typeComponent = 'cart'
  public previe_url_image: any;
  public fileDataImage: File;
  public arrayPaymentMethod: PaymentMethod[];
  public provider: Provider;
  public cvc: number = null;
  public paymentMethodSelected: PaymentMethod;


  constructor(private activatedRoute: ActivatedRoute,
    private studentService: StudentService,
    private router: Router,
    private notificationService: UtilsService,
    private categoryService: LinesService,
    private representativeService: RepresentativeService,
    private storageService: StorageService,
    private orderService: OrdersService,
    private providersService: ProviderService,
    private http: HttpClient,

  ) { }

  ngOnInit(): void {
    this.provider = {};
    this.validateUrl()
  }

  public getInfoRepresentative() {
    this.representativeService.getRepresentativeId(this.infoUser.user_id).pipe(take(1)).subscribe((representative) => {
      this.representative = representative;
      if (this.representative) {
        this.setInfoOrder();
        if (this.representative.representative_payment_method == 'Tarjeta') {
          this.searchPaymentMethod();
        }
      }
    })
  }

  /**
   * *** Si el padre paga con tarjeta las consultamos en paymentez ***
   */
  public searchPaymentMethod() {
    this.arrayPaymentMethod = [];
    if (this.provider.provider_NAME_EC_SERVER != undefined) {
      var httpOptions = {
        headers: new HttpHeaders({
          // 'auth-token': this.getAuthToken('UNIESCOLAR-EC-SERVER', 'VSX4daOgoDsuUfYCf7w1DSmpalvj27')
          'auth-token': this.getAuthToken(this.provider.provider_NAME_EC_SERVER, this.provider.provider_KEY_EC_SERVER)
        }),
      };
      var headers = {};
      var url = `${environment.urlPaymentez}/card/list?uid=${this.infoUser.user_uid}`;
      var response = this.http.get<any>(url, httpOptions).subscribe((response) => {
        response['cards'].forEach(card => {
          this.arrayPaymentMethod.push(card);
        });
      });
    }


  }

  getAuthToken(paymentezClientAppCode, appClientKey) {
    var authTimeStamp = new Date().getTime().toString();
    var stringAuthToken = paymentezClientAppCode + ";" + authTimeStamp.substring(0, 10) + ";" + this.getUniqToken(authTimeStamp.substring(0, 10), appClientKey);
    var authToken = btoa(utf8Encode(stringAuthToken));
    return authToken;
  }

  getUniqToken(authTimeStamp, paymentezClientAppKey) {
    var uniqTokenString = paymentezClientAppKey + authTimeStamp;
    return sha256(utf8Encode(uniqTokenString)).toString();
  }

  setDataTest() {
    var dataTestResponse = {
      "transaction": {
        "status": "success",
        "payment_date": "2021-09-16T03:22:02.842",
        "amount": 12,
        "authorization_code": "034445",
        "installments": 0,
        "dev_reference": "Pago de oerden Nro 12376763",
        "message": "Operation Successful",
        "carrier_code": "00",
        "id": "DF-138493",
        "status_detail": 3
      },
      "card": {
        "bin": "411111",
        "expiry_year": "2022",
        "expiry_month": "9",
        "transaction_reference": "DF-138493",
        "type": "vi",
        "number": "4321",
        "origin": "Paymentez"
      }
    }
    this.orderService.setDataTest(dataTestResponse, this.order, this.infoUser)
  }

  public showFormCvc() {

  }

  public selectedPaymentMethod(paymentMethod: PaymentMethod) {
    this.paymentMethodSelected = paymentMethod;
  }
  public finalizedWithPaymentMethod(paymentMethod: PaymentMethod) {
    var httpOptions = {
      headers: new HttpHeaders({
        // 'auth-token': this.getAuthToken('UNIESCOLAR-EC-SERVER', 'VSX4daOgoDsuUfYCf7w1DSmpalvj27')
        'auth-token': this.getAuthToken(this.provider.provider_NAME_EC_SERVER, this.provider.provider_KEY_EC_SERVER)
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
        this.orderService.saveDetailsPaymentInProvider(this.order.order_transaccion_id, this.provider.provider_id, response, this.infoUser).then(async () => {
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

  getBaseImp() {
    var bImp = parseFloat(this.order.order_total_to_pay.toFixed(2)) / 1.12;
    return parseFloat(bImp.toFixed(2));
  }

  getIva() {
    var iva = parseFloat(this.order.order_total_to_pay.toFixed(2)) / 1.12;
    iva = parseFloat(this.order.order_total_to_pay.toFixed(2)) - iva;
    return parseFloat(iva.toFixed(2));

  }

  public getInfoStudent(student_id: string) {
    this.studentService.getStudentId(student_id).pipe(take(1)).subscribe((student) => {
      this.student = student;
    })
  }

  /**
  * Método para validar datos obtenidos de url
  */
  public validateUrl() {
    this.order = {}
    this.representative = {}
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    this.getInfoStudent(this.student_id);
    this.getLocalStorageCart();
    this.getInfoRepresentative();
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
          this.infoUser = JSON.parse(localStorage.getItem("infoUser"));

          this.getInfoStudent(this.student_id);
          this.getInfoRepresentative()
          this.getLocalStorageCart();
        }
      }
    });
  }

  public getLocalStorageCart() {
    this.productsCart = []
    if (JSON.parse(localStorage.getItem("productscartCache"))) {
      this.productsCart = JSON.parse(
        localStorage.getItem("productscartCache")
      );
      if (this.productsCart) {
        this.provider_id = this.productsCart[0].product_provider_id;
        this.getInfoProvider();
        this.validateCategory();
      }
    }
  }

  public getInfoProvider() {
    this.providersService.getProviderId(this.provider_id).pipe(take(1)).subscribe((provider) => {
      this.provider = provider;
      if (provider) {
      }
    })
  }

  public validateCategory() {
    this.order.order_subtotal_price = 0;
    this.order.order_total_to_pay = 0;
    let subtotal = 0
    for (let index = 0; index < this.productsCart.length; index++) {
      const product = this.productsCart[index];
      subtotal = parseFloat(subtotal.toString()) + parseFloat(product.product_price.toString());
      product.product_subtotal = product.product_price;
      product.product_state_in_order = false;
      this.isViewDaysCategoryMenuInAllCategory[index] = false;
      this.categoryService.getLineById(product.product_id_category).pipe(take(1)).subscribe((category: Lines) => {
        if (category && category.category_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'menu') {
          this.isViewDaysCategoryMenuInAllCategory[index] = true;
        }
      });
      if (index + 1 === this.productsCart.length) {
        this.order.order_subtotal_price = subtotal;
        this.order.order_total_to_pay = subtotal;
      }
    }
  }


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
          this.productsCart.splice(i, 1)
          if (this.productsCart.length === 0) {
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
        this.productsCart.splice(i, 1);
        if (this.productsCart.length === 0) {
          this.router.navigate(['perfil-representative/' + 'childrens/']);

        }
        this.recalculateTotal()
      }
    })
  }

  public increaseAmount(product: Product, i: number) {
    product.product_quantity_in_cart = product.product_quantity_in_cart + 1;
    this.recalculateTotal()
  }

  public recalculateTotal() {
    let subtotal = 0
    for (let index = 0; index < this.productsCart.length; index++) {
      const product = this.productsCart[index];
      subtotal = parseFloat(subtotal.toString()) + (parseFloat(product.product_price.toString()) * product.product_quantity_in_cart);
      product.product_subtotal = (parseFloat(product.product_price.toString()) * product.product_quantity_in_cart)
      if (index + 1 === this.productsCart.length) {
        this.order.order_subtotal_price = subtotal;
        this.order.order_total_to_pay = subtotal;
      }
    }
  }

  public goBehind() {
    Swal.fire({
      title: '¿Confirma que desea regresar?',
      text: "Luego de confirmar los productos agregados a su carrito serán eliminados",
      icon: 'warning',
      showCancelButton: true,
      customClass: {
        confirmButton: 'btn btn-success',
        cancelButton: 'btn btn-danger',
      },
      confirmButtonText: 'Sí, regresar!',
      cancelButtonText: 'Cancelar',
      buttonsStyling: false
    }).then((result) => {
      if (result.value) {
        this.router.navigate(['perfil-representative/' + 'childrens/']);

      }
    })
  }

  public async registerOrder() {
    if (this.fileDataImage && this.order.order_payment_method === 'Efectivo') {
      this.order.order_state_payment_method = false;
      this.order.order_state_payment_to_super_admin = false;
      this.previe_url_image = null
      await this.storageService.uploadFile(`order/order${this.order.order_transaccion_id}/image_.png`, this.fileDataImage).then((result) => {
        this.order.order_image_payment_cash = result;
      })
      this.orderService.saveOrderInStudent(this.student_id, this.order);
      this.orderService.saveOrderInProvider(this.order).then(async () => {
        for (let index = 0; index < this.productsCart.length; index++) {
          const product = this.productsCart[index];
          product.product_id_transaction = 'product_' + index,
            await this.orderService.saveProductInOrder(this.order.order_transaccion_id, product.product_provider_id, product);
          await this.orderService.saveProductInOrderInStudent(this.student_id, this.order.order_transaccion_id, product);
          if (index + 1 === this.productsCart.length) {
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
        for (let index = 0; index < this.productsCart.length; index++) {
          const product = this.productsCart[index];
          product.product_id_transaction = 'product_' + index
          await this.orderService.saveProductInOrder(this.order.order_transaccion_id, product.product_provider_id, product);
          await this.orderService.saveProductInOrderInStudent(this.student_id, this.order.order_transaccion_id, product);
          if (index + 1 === this.productsCart.length) {
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

  public async completePurchase() {
    $('#myModalcompleteOrder').modal('show')
  }

  public setInfoOrder() {
    this.order.order_provider_id = this.productsCart[0].product_provider_id;
    this.order.order_transaccion_id = new Date().getTime().toString();
    this.order.order_representative_id = this.infoUser.user_id;
    this.order.order_student_id = this.student_id;
    this.order.order_time = this.notificationService.getTimeCurrent();
    this.order.order_date = this.notificationService.getDateCurrent();
    this.order.order_state = false;
    this.order.order_payment_method = this.representative.representative_payment_method;
  }

  public addImageGallery() {
    document.getElementById('product_gallery').click();
  }

  public fileProgress(fileInput: any) {
    this.fileDataImage = (<File>fileInput.target.files[0]);
    this.previewUrlImage()
  }

  /**
   * Metodo para visualizar imagen previa.
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
      this.previe_url_image = reader.result;
    }
  }
}
