import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  CardComponent, CardBodyComponent,
  NavComponent, NavItemComponent, NavLinkDirective,
  RowComponent, ColComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';

@Component({
  selector: 'app-settings-shell',
  templateUrl: './settings-shell.component.html',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CardComponent, CardBodyComponent,
    NavComponent, NavItemComponent, NavLinkDirective,
    RowComponent, ColComponent,
    IconDirective
  ]
})
export class SettingsShellComponent {}
