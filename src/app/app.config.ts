import { ApplicationConfig, APP_INITIALIZER, inject } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideRouter,
  withEnabledBlockingInitialNavigation,
  withHashLocation,
  withInMemoryScrolling,
  withRouterConfig,
  withViewTransitions
} from '@angular/router';
import { IconSetService } from '@coreui/icons-angular';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor, loadingInterceptor } from './core/interceptors';
import { AuthService } from './core/services/auth.service';

/**
 * Initialize session from storage on app startup
 * This ensures permissions and modules are loaded before navigation
 */
function initializeApp(): () => Promise<void> {
  const authService = inject(AuthService);

  return async () => {
    try {
      await firstValueFrom(authService.initializeSession());
      console.log('Session initialized successfully');
    } catch (error) {
      console.warn('No active session found');
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes,
      withRouterConfig({
        onSameUrlNavigation: 'reload'
      }),
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled'
      }),
      withEnabledBlockingInitialNavigation(),
      withViewTransitions()
    ),
    provideHttpClient(
      withInterceptors([authInterceptor, loadingInterceptor])
    ),
    IconSetService,
    provideAnimationsAsync(),
    // Initialize session before app starts
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      multi: true
    }
  ]
};

