import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Chart } from 'chart.js';
import { CityService } from '../../../services/city/city.service';
import { UsersService } from '../../../services/users/users.service';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

declare var $: any;

@Component({
  selector: 'app-admin-panel',
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.css']
})
export class AdminPanelComponent implements OnInit, AfterViewInit, OnDestroy {

  // Propiedades para las tarjetas de estadísticas
  public totalUsers: number = 0;
  public totalDevices: number = 0;
  public activeAlerts: number = 0;

  // Arrays para datos
  public cities: any[] = [];
  public users: any[] = [];
  public devices: any[] = [];

  // Subscripciones
  private subscriptions: Subscription[] = [];

  public lightboxImage: string = '';

  constructor(
    private router: Router,
    private cityService: CityService,
    private usersService: UsersService,
  ) { }

  ngOnInit(): void {
    this.loadCities();
    this.loadUsers();
    // TODO: loadDevices() once service is fully integrated
  }

  ngOnDestroy(): void {
    // Limpiar subscripciones para evitar memory leaks
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  loadCities(): void {
    const citiesSub = this.cityService.getCities().subscribe(
      (cities: any[]) => {
        this.cities = cities;
        console.log('Cities loaded:', this.cities);
      },
      error => {
        console.error('Error loading cities:', error);
      }
    );
    this.subscriptions.push(citiesSub);
  }

  loadUsers(): void {
    const usersSub = this.usersService.getAllUsersOnce(50).subscribe(
      (users: any[]) => {
        this.users = users;
        this.totalUsers = users.length;
        console.log('Latest users loaded:', this.users.length);
      },
      error => {
        console.error('Error loading users:', error);
      }
    );
    this.subscriptions.push(usersSub);
  }

  ngAfterViewInit(): void {
    this.createWeeklyTripsChart();
  }

  viewTripDetail(trip: any): void {
    // Legacy trip view not applicable to GPS routes yet
  }

  createWeeklyTripsChart() {
    const canvas = document.getElementById('weeklyTripsChart') as HTMLCanvasElement;
    if (!canvas) {
      console.error('El elemento canvas para la gráfica no fue encontrado.');
      return;
    }

    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], // Últimos 7 días
        datasets: [{
          label: 'Viajes completados',
          data: [150, 180, 210, 190, 220, 250, 230], // Datos de ejemplo
          backgroundColor: 'rgba(255, 107, 53, 0.6)', // Naranja con transparencia
          borderColor: 'rgba(255, 107, 53, 1)',
          borderWidth: 1,
          borderRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)' // Líneas de la cuadrícula más sutiles
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.8)' // Color claro para los números del eje Y
            }
          },
          x: {
            grid: {
              display: false // Ocultar líneas de la cuadrícula en el eje X 
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.8)' // Color claro para los días del eje X
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: 'rgba(255, 255, 255, 0.9)' // Color claro para la leyenda ('Viajes completados')
            }
          }
        }
      }
    });
  }
}
