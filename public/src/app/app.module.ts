import { NgModule, LOCALE_ID } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { HttpModule } from '@angular/http';
import { HttpClientModule } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { AgmCoreModule } from '@agm/core';

import { AppComponent } from './app.component';

import { SidebarModule } from './sidebar/sidebar.module';
import { FixedPluginModule } from './shared/fixedplugin/fixedplugin.module';
import { FooterModule } from './shared/footer/footer.module';
import { NavbarModule } from './shared/navbar/navbar.module';
import { AdminLayoutComponent } from './layouts/admin/admin-layout.component';
import { AuthLayoutComponent } from './layouts/auth/auth-layout.component';
import { AppRoutes } from './app.routing';
import { environment } from 'environments/environment';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { IndexLayoutComponent } from './layouts/index-layout/index-layout.component';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { CurrencyPipe } from '@angular/common';
import { CustomCurrencyPipe } from './pipes_custom/custom-currency.pipe';

@NgModule({
    providers: [
        CurrencyPipe,
        // { provide: LOCALE_ID, useValue: 'es' } 
    ],
    imports: [
        BrowserAnimationsModule,
        FormsModule,
        RouterModule.forRoot(AppRoutes, {
            useHash: false
        }),
        NgbModule,
        HttpModule,
        HttpClientModule,
        SidebarModule,
        NavbarModule,
        FooterModule,
        FixedPluginModule,
        AgmCoreModule.forRoot({
            apiKey: 'AIzaSyABbbtwiiybWFt7e1ADeTGN6iGEQ0cRIe4',
            libraries: ['visualization', 'places']
        }),
        MatSortModule,
        MatPaginatorModule,
        MatTableModule,
        MatFormFieldModule,
        MatInputModule,
    ],
    declarations: [
        AppComponent,
        AdminLayoutComponent,
        AuthLayoutComponent,
        IndexLayoutComponent,
    ],
    bootstrap: [AppComponent],

})

export class AppModule { }
