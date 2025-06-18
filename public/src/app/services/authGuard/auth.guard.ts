import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  Router,
} from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../authService/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    var isAuthenticated = this.authService.getAuthStatus();
    /**
     * *** If user not authenticated navigate to landing page ***
     */
    isAuthenticated.then((isAuthenticatedState) => {
      if (!isAuthenticatedState) {
        this.router.navigate(['']);
      }
    });
    
    return isAuthenticated;
  }
}
