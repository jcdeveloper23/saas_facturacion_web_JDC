import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule, GridModule, ButtonModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

@Component({
  selector: 'app-routes-history',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    GridModule,
    ButtonModule,
    IconModule,
    HasPermissionDirective
  ],
  templateUrl: './routes-history.component.html',
  styleUrl: './routes-history.component.scss'
})
export class RoutesHistoryComponent {}
