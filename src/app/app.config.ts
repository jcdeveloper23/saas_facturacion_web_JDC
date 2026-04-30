import { ApplicationConfig, APP_INITIALIZER, inject } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideRouter,
  withEnabledBlockingInitialNavigation,
  withInMemoryScrolling,
  withRouterConfig,
  withViewTransitions
} from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth, authState } from '@angular/fire/auth';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideFunctions, getFunctions } from '@angular/fire/functions';
import { IconSetService } from '@coreui/icons-angular';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { loadingInterceptor } from './core/interceptors';
import { environment } from '../environments/environment';
import { AuthService } from './core/services/auth.service';

/**
 * Wait for Firebase Auth to resolve its initial state before navigation.
 * This prevents the app from redirecting to /login on refresh when the user is logged in.
 */
function initializeAuth(): () => Promise<void> {
  const authService = inject(AuthService);
  return () => authService.waitForAuthReady();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withRouterConfig({ onSameUrlNavigation: 'reload', paramsInheritanceStrategy: 'always' }),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      withEnabledBlockingInitialNavigation(),
      withViewTransitions()
    ),
    provideHttpClient(
      withInterceptors([loadingInterceptor])
    ),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
    provideStorage(() => getStorage()),
    provideFunctions(() => getFunctions()),
    IconSetService,
    provideAnimationsAsync(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      multi: true
    }
  ]
};
