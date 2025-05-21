import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Representative } from 'app/interfaces/representative';
import { NgForm } from '@angular/forms';

import { StorageService } from 'app/services/storage/storage.service';
import { RepresentativeService, } from 'app/services/representative/representative.service';
import { PaymentMethod } from 'app/interfaces/payment_method';
import { Users } from 'app/interfaces/users';
import { take } from 'rxjs/operators';
import { AuthService } from 'app/services/authService/auth.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { utf8Encode } from '@angular/compiler/src/util';
import { sha256 } from 'js-sha256';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Provider } from 'app/interfaces/provider';
import { ProviderService } from 'app/services/provider/provider.service';
import { environment } from 'environments/environment';


declare var $: any;
@Component({
  selector: 'app-representative-profile',
  templateUrl: './representative-profile.component.html',
  styleUrls: ['./representative-profile.component.css']
})
export class RepresentativeProfileComponent implements OnInit {
  @ViewChild('myModaldetailPaymentMethod') myModaldetailPaymentMethod: ElementRef;
  public showFormAddRepresentative: boolean = false;
  public representative: Representative;
  public previe_url_image: any = null;
  public fileDataImage: File = null;
  public isEdit: boolean = false;
  public paymentMethodSelected: String;
  public payment_method: PaymentMethod;
  public payment_method_representative_id: string;
  public infoUser: Users;
  public representative_id: string;
  public password_current: string = '';
  public showMessageError: boolean = false;
  public showMessageSucces: boolean = false;
  public representative_new_password: string = '';
  public representative_new_password_confirm: string = '';
  public urlByAddPayment: SafeUrl;
  public arrayPaymentMethod: PaymentMethod[];
  public providerSelected: Provider;
  public providersList: Array<Provider>;


  constructor(
    private representativeService: RepresentativeService,
    private storageService: StorageService,
    private authService: AuthService,
    public sanitizer: DomSanitizer,
    private http: HttpClient,
    private providersService: ProviderService,

  ) {
  }

  ngOnInit(): void {
    this.arrayPaymentMethod = [];
    this.providerSelected = {};
    this.representative = {};
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.representative_id = this.infoUser.user_id;
      this.urlByAddPayment = this.sanitizerUrl(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}`);
      // console.log(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}`);
    }
    this.getRepresentative();

    this.payment_method = {};
  }

  getAuthToken(paymentezClientAppCode, appClientKey) {
    var authTimeStamp = new Date().getTime().toString();
    var stringAuthToken = paymentezClientAppCode + ";" + authTimeStamp.substring(0, 10) + ";" + this.getUniqToken(authTimeStamp.substring(0, 10), appClientKey);
    var authToken = btoa(utf8Encode(stringAuthToken));
    var authTimeStamp = (new Date().getTime()).toString().substring(0, 10);

    var stringAuthToken = paymentezClientAppCode + ";" + authTimeStamp + ";" + this.getUniqToken(authTimeStamp, appClientKey);

    var authToken = btoa(utf8Encode(stringAuthToken));

    return authToken;
  }

  getUniqToken(authTimeStamp, paymentezClientAppKey) {
    var uniqTokenString = paymentezClientAppKey + authTimeStamp;
    return sha256(utf8Encode(uniqTokenString)).toString();
  }

  deletePaymentMethod(card) {
    var httpOptions = {
      headers: new HttpHeaders({
        // 'auth-token': this.getAuthToken('UNIESCOLAR-EC-SERVER', 'VSX4daOgoDsuUfYCf7w1DSmpalvj27')
        'auth-token': this.getAuthToken(this.providerSelected.provider_NAME_EC_SERVER, this.providerSelected.provider_KEY_EC_SERVER)
      }),
    };
    var body = {
      "card": {
        "token": card.token
      },
      "user": {
        "id": this.infoUser.user_uid
      }
    };

    var url = `${environment.urlPaymentez}/card/delete`;
    var response = this.http.post<any>(url, body, httpOptions).subscribe((response) => {
      this.searchPaymentMethod();
    });
  }

  public searchPaymentMethod() {
    this.arrayPaymentMethod = [];
    console.log(this.providerSelected.provider_NAME_EC_SERVER);

    if (this.providerSelected.provider_NAME_EC_SERVER != undefined) {
      var httpOptions = {
        headers: new HttpHeaders({
          'auth-token': this.getAuthToken(this.providerSelected.provider_NAME_EC_SERVER, this.providerSelected.provider_KEY_EC_SERVER)
        }),
      };
      var headers = {};
      var url = `${environment.urlPaymentez}/card/list?uid=${this.infoUser.user_uid}`;
      // var url = `https://ccapi-stg.paymentez.com/v2/card/list?uid=${this.infoUser.user_uid}`;
      var response = this.http.get<any>(url, httpOptions).subscribe((response) => {
        console.log(response);
        response['cards'].forEach(card => {
          this.arrayPaymentMethod.push(card);
        });
      });
    }

  }



  /**
 * * *** aplicamos el metodo bypassSecurityTrustResourceUrl ***
 * *** para (url segura) ***
 * @param urlByAddPayment
 */
  sanitizerUrl(urlByAddPayment: string): SafeUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(urlByAddPayment);
  }

  getRepresentative() {
    this.representativeService.getRepresentativeId(this.representative_id).pipe(take(1)).subscribe((representative) => {
      this.representative = representative;
      this.paymentMethodSelected = this.representative.representative_payment_method;
      this.getProvidersList();
    })
  }


  /**
    * Metodo para guardar estudiante, donde si no tiene id se le asigna, si está vacios
    * los campos de level, parallel, genero no guarda y manda una notificacción para que sean llenados los campos
    * de igual forma debe validar que las contraseñas sean iguales para guardar
    * asi como guardar la imagen
    * si no se está editando el formulario se manda a guardar el estudiante con los datos llenados, en 
    * el caso contario se editan los datos
    * @param representative 
    * @param isValid 
    * @param form 
    */
  public async saveRepresentative(representative: Representative, isValid: boolean, form: NgForm) {
    if (isValid) {
      if (this.fileDataImage) {
        await this.storageService.uploadFile(`representative/${this.representative.representative_id}/profile_picture.png`, this.fileDataImage).then((result) => {
          this.representative.representative_image = result;
        })
      }
      this.representativeService.updateRepresentative(this.representative).then(() => {
        this.showNotification('top', 'right', 'nc-check-2', '¡Actualización completada! Los cambios han sido guardados.', 'success');
        $('#multiCollapseStudents').collapse('hide');
      })
    }
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
  /**
  * Metodo para obtener el archivo de imagen seleccinado.
  * @param fileInput 
  */
  public fileProgress(fileInput: any) {
    this.fileDataImage = (<File>fileInput.target.files[0]);
    this.previewUrlImage()
  }

  public setPaymentMethod(type: string) {
    this.paymentMethodSelected = type;
    this.representative.representative_payment_method = type;
    this.representativeService.updateRepresentative(this.representative).then(() => {
      this.showNotification('top', 'right', 'nc-check-2', 'Se actualizo el método de pago predeterminado. ', 'success');
    })
  }


  public saveCreditcard(payment_method, isValid: boolean, form: NgForm) {

  }

  /**
* Metodo para mostrar notificaciones.
* @param from 
* @param align 
* @param icon 
* @param message 
* @param type 
*/
  public showNotification(from, align, icon, message, type) {

    $.notify({
      icon: icon,
      message: message,
    }, {
      type: type,
      timer: 4000,
      placement: {
        from: from,
        align: align
      },
      template: '<div data-notify="container" class="col-11 col-md-4 alert alert-{0} alert-with-icon" role="alert"><button type="button" aria-hidden="true" class="close" data-notify="dismiss"><i class="nc-icon nc-simple-remove"></i></button><span data-notify="icon" class="nc-icon {{icon}}"></span> <span data-notify="title">{1}</span> <span data-notify="message">{2}</span><div class="progress" data-notify="progressbar"><div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div></div><a href="{3}" target="{4}" data-notify="url"></a></div>'
    });
  }

  public initChangePass() {
    $('#modalChangePass').modal('show');
    this.showMessageError = false;
    this.showMessageSucces = false;
  }

  public changePass(model, valid) {
    if (this.representative_new_password != '' && this.representative_new_password_confirm != '') {
      /// *** Cambio de clave en auth ***
      this.authService.changePass(
        this.representative_new_password,
        this.representative.representative_password,
        this.representative.representative_email,
      )
        .then(() => {
          this.representative.representative_password_confirm = this.representative_new_password;
          this.representative.representative_password = this.representative_new_password;
          /// *** Cambio de clave en la DB ***
          this.representativeService.updateRepresentative(this.representative).then(() => {
            $('#modalChangePass').modal('hide');
            this.showNotification('top', 'right', 'nc-check-2', '¡Tu contraseña ha sido modificada exitosamente!', 'success');
          });
        });
    } else {
      console.log('*** no cambia ***');
    }
  }

  public validatePassCurrent() {
    if (this.representative.representative_password == this.password_current) {
      this.showMessageError = false;
      this.showMessageSucces = true;
      this.representative_new_password = '';
      this.representative_new_password_confirm = '';
    } else {
      this.showMessageError = true;
    }
  }

  public getProvidersList() {
    this.providersService.getProvidersByUEInStateTruePaymentezTrue(this.representative.representative_schools[0]).pipe(take(1)).subscribe((providers) => {
      this.providersList = providers;
      this.selectProviderTab(this.providersList[0]);
    })
  }

  public selectProviderTab(p: Provider) {
    this.providerSelected = p;
    this.searchPaymentMethod();
    // this.infoUser.email = 'osalas@paymentez.com';
    this.urlByAddPayment = this.sanitizerUrl(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}&opt=${this.providerSelected.provider_NAME_EC_CLIENT}&opt1=${this.providerSelected.provider_KEY_EC_CLIENT}`);
    console.log(this.urlByAddPayment);
    console.log(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}&opt=${this.providerSelected.provider_NAME_EC_CLIENT}&opt1=${this.providerSelected.provider_KEY_EC_CLIENT}`);

  }


  public selectProvider(e: Event) {
    // this.infoUser.email = 'osalas@paymentez.com';
    if ($('#providerSelected').val() != '') {
      this.providerSelected = this.providersList[$('#providerSelected').val()];
      this.urlByAddPayment = this.sanitizerUrl(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}&opt=${this.providerSelected.provider_NAME_EC_CLIENT}&opt1=${this.providerSelected.provider_KEY_EC_CLIENT}`);
    } else {
      this.providerSelected = {};
    }
    console.log(`https://tubarpay.web.app/indexFather.html?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}&opt=${this.providerSelected.provider_NAME_EC_CLIENT}&opt1=${this.providerSelected.provider_KEY_EC_CLIENT}`);

  }
}


