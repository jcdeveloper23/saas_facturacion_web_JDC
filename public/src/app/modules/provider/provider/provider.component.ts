import { Component, ElementRef, OnInit, ViewChild, } from '@angular/core';
import { Provider } from 'app/interfaces/provider';
import { ProviderService } from 'app/services/provider/provider.service';
import { take } from 'rxjs/operators';
import { StorageService } from 'app/services/storage/storage.service';
import { Users } from 'app/interfaces/users';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
declare var $: any;
@Component({
  selector: 'app-provider',
  templateUrl: './provider.component.html',
  styleUrls: ['./provider.component.css']
})
export class ProviderComponent implements OnInit {
  @ViewChild('myModaldetailPaymentMethod') myModaldetailPaymentMethod: ElementRef;

  public infoUser: Users;
  public provider_id: string = '1624925525724';
  public provider: Provider;
  public fileDataImage: File = null;
  public previe_url_image: any = null;
  public urlByAddPayment: SafeUrl;
  constructor(private providerService: ProviderService,
    private storageService: StorageService,
    public sanitizer: DomSanitizer,
  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.provider_id = this.infoUser.user_id;
      this.urlByAddPayment = this.sanitizerUrl(`https://luncher-paymentez.web.app/?id=${this.infoUser.user_uid}&email=${this.infoUser.email}&idp=${this.infoUser.user_id}`);
    }
    this.provider = {};
    this.getProvider()
  }

  ngAfterViewInit() {
      $(this.myModaldetailPaymentMethod.nativeElement).on('hidden.bs.modal', () => {
        location.reload();
      });
  }

  /**
* * *** aplicamos el metodo bypassSecurityTrustResourceUrl ***
* *** para (url segura) ***
* @param urlByAddPayment
*/
  sanitizerUrl(urlByAddPayment: string): SafeUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(urlByAddPayment);
  }

  /**
   * Metodo para consultar información del bar
   */
  public getProvider() {
    this.providerService.getProviderId(this.provider_id).pipe(take(1)).subscribe(provider => {
      this.provider = provider;
    })
  }
  /**
   * Metodo para actualizar información del proveedor.
   * @param provider 
   * @param isValid 
   * @param form 
   */
  public async updateProvider(provider: Provider, isValid: boolean) {
    // if (!this.provider.provider_image) {
    //   this.showNotification('top', 'right', 'nc-check-2', 'Por favor seleccione el logo del Bar', 'success');
    // } else {
    if (isValid) {
      if (this.fileDataImage) {
        await this.storageService.uploadFile(`provider/provider${this.provider.provider_id}/image${this.provider.provider_id}.png`, this.fileDataImage).then((result) => {
          this.provider.provider_image = result;
        })
      }
      if (this.provider.provider_image) {
        this.providerService.updateProvider(this.provider).then(() => {
          this.previe_url_image = null
          this.fileDataImage = null;
          this.showNotification('top', 'right', 'nc-check-2', 'Se realizó la actualización correctamente', 'success');
        })
      } else {
        this.providerService.updateProvider(this.provider).then(() => {
          this.previe_url_image = null
          this.fileDataImage = null;
          this.showNotification('top', 'right', 'nc-check-2', 'Se realizó la actualización correctamente', 'success');
        })
      }

    }
    // }

  }

  /**
   * Metodo para obtener el archivo de imagen seleccinado.
   * @param fileInput 
   */
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

  /**
   * Método para elimnar imagen.
   */
  public deleteFile() {
    if (this.fileDataImage) {
      this.fileDataImage = null;
      this.previe_url_image = null;
    } else {
      this.storageService.deleteFileByURL(this.provider.provider_image);
      this.provider.provider_image = null;
      this.providerService.updateProvider(this.provider);
      this.provider.provider_image = null;
      this.fileDataImage = null;
      this.previe_url_image = null;
    }
  }

  public saveConfigPaymentez (value: any, valid: boolean) {
    if (valid) {
      this.providerService.saveConfigPaymentez(this.provider).then(() => {
        this.showNotification('top', 'right', 'nc-check-2', 'Configuración guardada correctaente', 'success');
      })
    }
  }
}
