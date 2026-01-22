import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule, GridModule, ButtonModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    GridModule,
    ButtonModule,
    IconModule,
    HasPermissionDirective
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class UsersComponent {}
