import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { PaymentMethod, PaymentMethodTypes } from 'app/interfaces/payment_method';
import { Provider } from 'app/interfaces/provider';
import { Representative } from 'app/interfaces/representative';
import { Users } from 'app/interfaces/users';
import { ProviderService } from 'app/services/provider/provider.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { take } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { utf8Encode } from '@angular/compiler/src/util';
import { sha256 } from 'js-sha256';
import { environment } from 'environments/environment';

declare var $: any;

@Component({
  selector: 'app-payment-methods',
  templateUrl: './payment-methods.component.html',
  styleUrls: ['./payment-methods.component.css']
})
export class PaymentMethodsComponent implements OnInit {
  public paymentMethodSelected: String;
  public payment_method: PaymentMethod;
  public payment_method_representative_id: string;
  public representative: Representative;
  public arrayPaymentMethod: PaymentMethod[];
  public providerSelected: Provider;
  public providersList: Array<Provider>;
  public infoUser: Users;
  public representative_id: string;
  public urlByAddPayment: SafeUrl;
  public paymentMethodTypes: Array<PaymentMethodTypes> = [
    {
      payment_method_type_id: '001',
      payment_method_type_value: 'Tarjeta',
      payment_method_type_title: 'Tarjeta de crédito',
      payment_method_type_subtitle: 'o débito',
      payment_method_type_description: 'Con Nuvei',
      payment_method_type_details: [
        'Método de pago seguro',
        'Paga de forma rápida y protegida',
        'No almacenamos los datos de tu tarjeta',
        'Optimiza los pagos',
        'Agrega tus tarjetas favoritas',
      ],
    },
    {
      payment_method_type_id: '002',
      payment_method_type_value: 'DeUna',
      payment_method_type_title: 'Pago con DeUna!',
      payment_method_type_subtitle: 'Pago QR',
      payment_method_type_description: 'Banco Pichincha',
      payment_method_type_details: [
        'Pago directo desde tu cuenta bancaria',
        'Confirma tu pago con un solo clic',
        'Sin ingresar datos bancarios',
        'Fácil, rápido y sin complicaciones',
        'Ideal para clientes del Banco Pichincha',
      ],
    },
    {
      payment_method_type_id: '003',
      payment_method_type_value: 'Efectivo',
      payment_method_type_title: 'Transferencia bancaria',
      payment_method_type_subtitle: 'o efectivo',
      payment_method_type_description: 'Banca electrónica',
      payment_method_type_details: [
        'Transferencia a nuestra cuenta bancaria',
        'Recibirás los datos bancarios al confirmar esta opción',
        'Validación: hasta 24 horas hábiles',
        'Se debe adjuntar el comprobante del pago',
      ],
    },
  ];

  constructor(
    private representativeService: RepresentativeService,
    public sanitizer: DomSanitizer,
    private providersService: ProviderService,
    private http: HttpClient,
  ) { }
x
  ngOnInit(): void {
    this.arrayPaymentMethod = [];
    this.providerSelected = {};
    this.representative = {};
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.representative_id = this.infoUser.user_id;
    }
    /// *** Obtenemos la info del usuario ***
    this.getRepresentative();

    this.payment_method = {};
  }

  /**
   * *** Retorna la info del usuario ***
   */
  getRepresentative() {
    this.representativeService.getRepresentativeId(this.representative_id).pipe(take(1)).subscribe((representative) => {
      this.representative = representative;
      this.paymentMethodSelected = this.representative.representative_payment_method;

      /// *** Obtenemos la info de los comercios ***
      this.getProvidersList();
    })
  }

  /**
   * *** Retorna la info de los comercios ***
   */
  public getProvidersList() {
    this.providersService.getProvidersByUEInStateTruePaymentezTrue(this.representative.representative_schools[0]).pipe(take(1)).subscribe((providers) => {
      this.providersList = providers;

      /// *** Seleccionamos un comercio [el primero de la lista] ***
      this.selectProviderTab(this.providersList[0]);
    })
  }

  /**
   * Selecciona el proveedor y construye la url para agregarle un metodo de pago
   * @param provider 
   */
  public selectProviderTab(provider: Provider) {
    this.providerSelected = provider;

    /// *** Consultamos las tarjetas agregadas del usuario ***
    this.searchPaymentMethod();
    // this.infoUser.email = 'osalas@paymentez.com';
    
    /// *** Obtenemos la url para agregar tarjetas al comercio seleccionado ***
    this.urlByAddPayment = this.sanitizerUrl(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}&opt=${this.providerSelected.provider_NAME_EC_CLIENT}&opt1=${this.providerSelected.provider_KEY_EC_CLIENT}`);
    console.log(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}&opt=${this.providerSelected.provider_NAME_EC_CLIENT}&opt1=${this.providerSelected.provider_KEY_EC_CLIENT}`);
    
  }

  /**
   * *** Seleccionamos el bar o comercio ***
   * @param event
   */
  public selectProvider(event: Event) {
    // this.infoUser.email = 'osalas@paymentez.com';
    if ($('#providerSelected').val() != '') {
      this.providerSelected = this.providersList[$('#providerSelected').val()];
    /// *** Obtenemos la url para agregar tarjetas al comercio seleccionado ***
    this.urlByAddPayment = this.sanitizerUrl(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}&opt=${this.providerSelected.provider_NAME_EC_CLIENT}&opt1=${this.providerSelected.provider_KEY_EC_CLIENT}`);
    } else {
      this.providerSelected = {};
    }
    console.log(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}&opt=${this.providerSelected.provider_NAME_EC_CLIENT}&opt1=${this.providerSelected.provider_KEY_EC_CLIENT}`);
  }

  
  /**
   * *** Guarda los metodos de pago predeterminado en el usuario *** 
   * @param type 
   */
  public setPaymentMethod(type: string) {
    this.paymentMethodSelected = type;
    this.representative.representative_payment_method = type;
    this.representativeService.updateRepresentative(this.representative).then(() => {
      // this.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el método de pago predeterminado. ', 'success');
    })
  } 

  /**
   * *** Consulta las tarjetas agregadas en Paymentez *** 
   */
  public searchPaymentMethod() {
    this.arrayPaymentMethod = [];
    console.log(this.providerSelected.provider_NAME_EC_SERVER);
    console.log(this.infoUser.user_uid);

    if (this.providerSelected.provider_NAME_EC_SERVER != undefined) {
      /// *** Obtiene los parametros del proveedor ***
      var httpOptions = {
        headers: new HttpHeaders({
          'auth-token': this.getAuthToken(this.providerSelected.provider_NAME_EC_SERVER, this.providerSelected.provider_KEY_EC_SERVER)
        }),
      };
      var headers = {};

      var url = `${environment.urlPaymentez}/card/list?uid=${this.infoUser.user_uid}`;

      var response = this.http.get<any>(url, httpOptions).subscribe((response) => {
        console.log('*** LIST ***');
        console.log(response);
        response['cards'].forEach(card => {
          this.arrayPaymentMethod.push(card);
        });
      });
    }
  }

  /**
   * *** Genera el auth-token requerido por paymentez ***
   * @param paymentezClientAppCode 
   * @param appClientKey 
   * @returns 
   */
  getAuthToken(paymentezClientAppCode, appClientKey) {
    var authTimeStamp = new Date().getTime().toString();
    var stringAuthToken = paymentezClientAppCode + ";" + authTimeStamp.substring(0, 10) + ";" + this.getUniqToken(authTimeStamp.substring(0, 10), appClientKey);
    var authToken = btoa(utf8Encode(stringAuthToken));
    var authTimeStamp = (new Date().getTime()).toString().substring(0, 10);

    var stringAuthToken = paymentezClientAppCode + ";" + authTimeStamp + ";" + this.getUniqToken(authTimeStamp, appClientKey);

    var authToken = btoa(utf8Encode(stringAuthToken));

    console.log(authToken);

    return authToken;
  }

  getUniqToken(authTimeStamp, paymentezClientAppKey) {
    var uniqTokenString = paymentezClientAppKey + authTimeStamp;
    return sha256(utf8Encode(uniqTokenString)).toString();
  }


  /**
   * * *** aplicamos el metodo bypassSecurityTrustResourceUrl ***
   * *** para (url segura) ***
   * @param urlByAddPayment
   */
  sanitizerUrl(urlByAddPayment: string): SafeUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(urlByAddPayment);
  }
}
