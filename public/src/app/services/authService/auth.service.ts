import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Users } from 'app/interfaces/users';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { first, take } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { UsersService } from '../users/users.service';

declare var $: any;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public infoUser: Users;

  constructor(
    private router: Router,
    private userService: UsersService,
    private http: HttpClient
  ) {
  }

  public async login(email: string, password: string) {
    console.log('*** Logging in via Backend API ***');
    const url = `${environment.apiGpsUrl}/authentication`;
    const payload = {
      strategy: 'local',
      userEmail: email,
      userPassword: password
    };

    try {
      const response: any = await this.http.post(url, payload).toPromise();
      console.log('Login successful:', JSON.stringify(response, null, 2));

      if (response && response.accessToken) {
        localStorage.setItem('accessToken', response.accessToken);
        const infoUser: Users = response.user;

        localStorage.setItem('infoUser', JSON.stringify(infoUser));
        this.infoUser = infoUser;

        // Check if user is active (handle both boolean and number 1/0)
        if (!this.infoUser.state) {
          this.showNotification('top', 'right', 'nc-alert-circle-i', 'El usuario se encuentra desactivado.', 'danger');
          localStorage.clear();
          return;
        }

        const role = this.infoUser.userCurrentRole;

        // Redirect based on role for GPS application
        if (role?.toString() === '0') {
          this.router.navigate(['/admin-panel']);
        } else {
          // Standard users/clients go to Monitor
          this.router.navigate(['/monitor']);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error.status === 401) {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'Las credenciales ingresadas son incorrectas', 'warning');
      } else {
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'Ha ocurrido un error al iniciar sesión intente más tarde.', 'warning');
      }
    }
  }

  public async logout() {
    // await this.afAuth.signOut();
    localStorage.clear()
    this.router.navigate([''])
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
  }
  /**
  * *** method retrun state user authentication true or false ***
  */
  async getAuthStatus(): Promise<boolean> {
    const token = localStorage.getItem('accessToken');
    const infoUser = localStorage.getItem('infoUser');
    return !!(token && infoUser);
  }
}
