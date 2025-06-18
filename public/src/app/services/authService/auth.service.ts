import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/auth';
import { AngularFirestore } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Representative } from 'app/interfaces/representative';
import { Users } from 'app/interfaces/users';
import { first, take } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { UsersService } from '../users/users.service';

declare var $: any;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public infoUser: Users;

  constructor(private afAuth: AngularFireAuth,
    private router: Router,
    private db: AngularFirestore,
    private userService: UsersService,

  ) {
  }

  /**
   * *** Registro de autenticacion de usuario en firebase ***
   * @param email
   * @param password
   */
  async registerUserForAuth(email: string, password: string) {
    try {
      const result = await this.afAuth
        .createUserWithEmailAndPassword(email, password)
        .then((ok) => {
          return ok.user;
        })
        .catch((error) => {
          if (error.code == 'auth/user-not-found') {
            this.showNotification('top', 'right', 'nc-alert-circle-i', 'No hay registro de usuario correspondiente a este email. El usuario puede haber sido eliminado', 'warning');
          }
          if (error.code == 'auth/email-already-in-use') {
            this.showNotification('top', 'right', 'nc-alert-circle-i', 'El email ingresado ya está en uso', 'warning');

          }
          if (error.code == 'auth/wrong-password') {
            this.showNotification('top', 'right', 'nc-alert-circle-i', 'La contraseña no es válida o el usuario no tiene una contraseña', 'warning');
          }
          if (error.code == 'auth/too-many-requests') {
            this.showNotification('top', 'right', 'nc-alert-circle-i', 'Demasiados intentos de inicio de sesión fallidos.', 'warning');

          }
          if (error.code == 'auth/invalid-email') {
            this.showNotification('top', 'right', 'nc-alert-circle-i', 'El email no tiene un formato válido.', 'warning');

          }
        });
      return result;
    } catch (error) {
      if (error.code == 'auth/user-not-found') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'No hay registro de usuario correspondiente a este email. El usuario puede haber sido eliminado', 'warning');

      }
      if (error.code == 'auth/email-already-in-use') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'El email ingresado ya está en uso', 'warning');

      }
      if (error.code == 'auth/wrong-password') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'La contraseña no es válida o el usuario no tiene una contraseña', 'warning');

      }
      if (error.code == 'auth/too-many-requests') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'Demasiados intentos de inicio de sesión fallidos.', 'warning');

      }
      if (error.code == 'auth/invalid-email') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'El email no tiene un formato válido.', 'warning');

      }
      return error;
    }
  }

  public async changePass(newPassword: string, pass, email) {
    const representative: Representative = {};
    const results = await this.afAuth.signInWithEmailAndPassword(
      email,
      pass
    );
    const result = await this.afAuth.currentUser;
    results.user.updatePassword(newPassword).then(function () {
    }).catch(function (error) {
      console.log('error! ', error)
    });
  }

  public async login(email: string, password: string) {

    const user: Users = {
      user_name: 'Super Administrador',
      user_email: 'superadmin@gmail.com',
      user_uid: 'JCVSO5Yyh1NY6sfvFS40kDkfgD53',
      user_state: true,
      users_account_type: '0',
      users_rol: 'superadmin',
      user_id_school: 'NA',
      user_id: 'JCVSO5Yyh1NY6sfvFS40kDkfgD53',
    }
    // this.userService.saveUser(user).then(() => {
    //   // this.studentService.getStudentById(student).pipe(take(1)).subscribe((s) => {
    //   //   if (s) {
    //   //     this.studentService.updateStudent(student);
    //   //   } else {
    //   //     this.studentService.saveStudent(student)
    //   //   }
    //   // })

    // });

    try {
      const result = await this.afAuth.signInWithEmailAndPassword(
        email,
        password
      );

      console.log(result.user.uid);


      let user_info: any;
      let infoUser: Users = {};
      user_info = (await this.getUserByUid(result.user.uid)).pipe(take(1))
        .toPromise();
      console.log(await user_info);

      if (await user_info) {
        infoUser = {
          email: (await user_info)['user_email'],
          users_account_type: (await user_info)['users_account_type'],
          users_rol: (await user_info)['users_rol'],
          user_id_school: (await user_info)['user_id_school'],
          user_id: (await user_info)['user_id'],
          user_uid: (await user_info)['user_uid'],
          user_state: (await user_info)['user_state'],
          user_state_payment_method_provider: (await user_info)['user_state_payment_method_provider']
        };
      }
      if (infoUser.user_state) {
        localStorage.setItem('infoUser', JSON.stringify(infoUser));
        this.infoUser = JSON.parse(localStorage.getItem('infoUser'));
        switch (this.infoUser.users_account_type) {
          case '0':
            this.router.navigate(['/provider-administration'])
            break;
          case '1':
            if (this.infoUser.user_state) {
              this.router.navigate(['/perfil'])
            } else {
              this.showNotification('top', 'right', 'nc-alert-circle-i', 'Estamos validando tu cuenta, aun no tienes acceso a la plataforma', 'info')
              this.router.navigate(['/'])
            }
            break;
          case '2':
            this.router.navigate(['//perfil-representative/childrens'])
            break;
          case '3':
            this.showNotification('top', 'right', 'nc-alert-circle-i', 'El acceso a la plataforma para los estudiantes es mediante la aplicación móvil', 'warning')
            break;
          default:
            this.router.navigate([''])
            break;
        }
      } else {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'El usuario se encuentra desactivado.', 'danger')
      }

    } catch (error) {
      console.log(JSON.stringify(error, null, 3));

      if (error.code === 'auth/internal-error') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'Las credenciales ingresadas son incorrectas', 'warning')
      } 
      else if (error.code === 'auth/wrong-password') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'La contraseña no es válida o el usuario no tiene una contraseña', 'warning')
      }
      else if (error.code === 'auth/user-not-found') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'No hay registro de usuario correspondiente a este email. El usuario pudo haber sido eliminado', 'warning')

      }
      else if (error.code === 'auth/invalid-email') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'El email no tiene un formato válido.', 'warning')
      }
      else if (error.code === 'auth/too-many-requests') {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'Atención, Demasiados intentos de inicio de sesión fallidos.', 'warning')
      } else {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'Ha ocurrido un error al iniciar sesión intente más tarde.', 'warning')
      }
    }
  }

  public async logout() {
    await this.afAuth.signOut();
    localStorage.clear()
    this.router.navigate([''])
  }

  public async getUserByUid(uid: string) {
    const result = await this.db.collection('users').doc(`${uid}`).valueChanges();
    console.log(result);

    return result
  }

  public showNotification(from, align, icon, message, type) {
    Swal.fire({
      icon: type,
      title: message,
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn btn-primary',
        cancelButton: 'btn btn-danger',
      },
      confirmButtonText: 'Aceptar'
    });

    // $.notify({
    //   icon: icon,
    //   message: message,
    // }, {
    //   type: type,
    //   timer: 4000,
    //   placement: {
    //     from: from,
    //     align: align
    //   },
    //   template: '<div data-notify="container" class="col-11 col-md-4 alert alert-{0} alert-with-icon" role="alert"><button type="button" aria-hidden="true" class="close" data-notify="dismiss"><i class="nc-icon nc-simple-remove"></i></button><span data-notify="icon" class="nc-icon {{icon}}"></span> <span data-notify="title">{1}</span> <span data-notify="message">{2}</span><div class="progress" data-notify="progressbar"><div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div></div><a href="{3}" target="{4}" data-notify="url"></a></div>'
    // });
  }
  /**
  * *** method retrun state user authentication true or false ***
  */
  async getAuthStatus() {
    var stateAuthentication = false;
    var currentUser = await this.afAuth.authState.pipe(first()).toPromise();

    if (currentUser) {
      stateAuthentication = true;
    } else {
      stateAuthentication = false;
    }
    return stateAuthentication;
  }
}
