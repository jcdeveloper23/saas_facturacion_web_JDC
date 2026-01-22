import { Routes } from '@angular/router';
import { PermissionsComponent } from './permissions.component';

export const routes: Routes = [
    {
        path: '',
        component: PermissionsComponent,
        data: {
            title: 'Permisos'
        }
    }
];
