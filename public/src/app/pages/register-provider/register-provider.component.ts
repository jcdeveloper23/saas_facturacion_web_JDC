import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Provider } from 'app/interfaces/provider';
import { Users } from 'app/interfaces/users';
import { AuthService } from 'app/services/authService/auth.service';
import { ProviderService } from 'app/services/provider/provider.service';
import { UsersService } from 'app/services/users/users.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
declare var $: any;
@Component({
  selector: 'app-register-provider',
  templateUrl: './register-provider.component.html',
  styleUrls: ['./register-provider.component.css']
})
export class RegisterProviderComponent implements OnInit {
  public provider: Provider;
  public existsRuc: boolean = false;
  public acceptTerms: boolean = false;
  constructor(
    private providerService: ProviderService,
    public router: Router,
    private authService: AuthService,
    private userService: UsersService,

  ) { }

  ngOnInit(): void {
    this.provider = {};
  }

  changeAccepts (e) {
    this.acceptTerms = e.checked;
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


  public showAlert(icon: any, title: any, text: any) {
    Swal.fire({
      title: title,
      text: text,
      icon: icon,
      showCancelButton: false,
      customClass: {
        confirmButton: 'btn btn-succes',
        cancelButton: 'btn btn-danger',
      },
      confirmButtonText: 'Aceptar',
     
      buttonsStyling: false
    }).then((result) => {
      if (result.value) {
        this.router.navigate(['']); /// navegar
      }
    })
  }

  /**
   * Metodo para agregar la información del proveedor en la DB.
   * @param provider 
   * @param isValid 
   */
  public async addProvider(provider: Provider, isValid: boolean) {
    /// verificamos si el formulario es valido
    if (isValid) {
      /// 
      if (provider.provider_password == provider.provider_confirm_password) {
        /// consumo el servicio para guardar el proveedor, guarda el proveedor
        this.provider.provider_id = new Date().getTime().toString();
        this.provider.provider_state = false;
        this.provider.provider_state_method = false;
        await this.authService
        .registerUserForAuth(
          this.provider.provider_email,
          this.provider.provider_password
        )
        .then(async (result) => {
          if (result != undefined) {
            this.provider.provider_uid = result.uid;
            if (this.provider.provider_id_school == undefined) {
              this.provider.provider_id_school = '';
            }
            let user: Users = {
              user_name: this.provider.provider_name,
              user_email: this.provider.provider_email,
              user_uid: result.uid,
              user_state: false,
              users_account_type: '1',
              users_rol: 'bar',
              user_id_school : this.provider.provider_id_school,
              user_id : this.provider.provider_id,
              user_state_payment_method_provider : false,
            }
            
            this.userService.saveUser(user).then(() => {
              this.providerService.addProvider(this.provider).then(() => {
                this.providerService.setNewRegisterProvider(this.provider).then(() => {
                  this.showNotification('top', 'right', 'nc-check-2', 'El Proveedor se ha registrado correctamente', 'success');
                  this.showAlert('success', '¡Hola estimado proveedor, te damos la bienvenida a Luncher!', 
                  'El registro se ha realizado correctamente, una persona de nuestro equipo se comunicará contigo para confirmar el proceso de registro en las próximas 24 horas, si necesitas ayuda antes puedes escribir a infoluncherwebapp@gmail.com.\n¿Tienes alguna duda? Consulta nuestra ayuda o escríbenos y estaremos encantados de ayudarte.');
                })
              })
            });
          }
        });


        
      } else { /// si no coinciden 
        this.showNotification('top', 'right', 'nc-check-2', 'Las contreseñas ingresadas no coinciden', 'danger');
      }
    }
  }

  searchRuc(){
    this.providerService.getProviderByRuc(this.provider).pipe(take(1)).subscribe(provider => {
      provider.length == 0 ? this.existsRuc = false : this.existsRuc = true;
      if (this.existsRuc) {
        this.showNotification('top', 'right', 'nc-check-2', 'El RUC ingresado ya se encuentra registrado, por favor contactar al administrador', 'danger');
      }
    })
   }
}
