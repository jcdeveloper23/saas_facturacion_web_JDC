import {Routes} from '@angular/router';
/* Components*/
import {CitiesComponent} from './cities/cities.component';

export const CitiesRoutes: Routes = [
  {
    path: '',
    children: [
      {
        path: '',
        component: CitiesComponent
      }
    ]
  }
];
