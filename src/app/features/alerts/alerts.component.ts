import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule, GridModule, BadgeModule } from '@coreui/angular';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    GridModule,
    BadgeModule
  ],
  templateUrl: './alerts.component.html',
  styleUrl: './alerts.component.scss'
})
export class AlertsComponent {}
