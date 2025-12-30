import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Chart } from 'chart.js';
import { CityService } from '../../../services/city/city.service';
import { RechargesService } from '../../../services/recharges/recharges.service';
import { UsersService } from '../../../services/users/users.service';
import { RequestVehicleService } from '../../../services/request-vehicle/request-vehicle.service';
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
  public activeDrivers: number = 0;
  public tripsToday: number = 0;
  public pendingRecharges: number = 0;

  // Arrays para datos
  public cities: any[] = [];
  public recharges: any[] = [];
  public users: any[] = [];
  public requestVehicles: any[] = [];

  // Subscripciones
  private subscriptions: Subscription[] = [];

  // Recarga seleccionada para el modal
  public selectedRecharge: any = null;

  // Viaje seleccionado para el modal
  public selectedTrip: any = null;

  // Filtro de viajes
  public tripFilter: string = 'active'; // 'all', 'active', 'in_process'

  // Imagen para el lightbox
  public lightboxImage: string = '';

  constructor(
    private router: Router,
    private cityService: CityService,
    private rechargesService: RechargesService,
    private usersService: UsersService,
    private requestVehicleService: RequestVehicleService
  ) { }

  ngOnInit(): void {
    this.loadCities();
    this.loadRecharges();
    this.loadUsers();
    this.loadRequestVehicles();
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

  loadRecharges(): void {
    const rechargesSub = this.rechargesService.getRecharges().subscribe(
      (recharges: any[]) => {
        this.recharges = recharges;
        // Filtrar recargas pendientes
        const pending = recharges.filter(r => r.rechargeStatus === 'pending' || r.rechargeStatus === 'pendiente');
        this.pendingRecharges = pending.length;
        console.log('Recharges loaded:', this.recharges);
        console.log('Pending recharges:', this.pendingRecharges);
      },
      error => {
        console.error('Error loading recharges:', error);
      }
    );
    this.subscriptions.push(rechargesSub);
  }

  loadUsers(): void {
    // Solo cargamos los últimos 50 usuarios para el dashboard para ahorrar lecturas
    const usersSub = this.usersService.getAllUsersOnce(50).subscribe(
      (users: any[]) => {
        this.users = users;
        this.totalUsers = users.length; // Nota: Esto será limitado a 50. 
        // Para un conteo real sin leer todo, se recomienda un documento de contadores.

        // Contar conductores activos de la muestra cargada
        this.activeDrivers = users.filter(u => u.userRol === 9 && u.userState === true).length;
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

  getPendingRecharges(): any[] {
    return this.recharges.filter(r =>
      r.rechargeStatus === 'pending' ||
      r.rechargeStatus === 'pendiente' ||
      r.rechargeStatus === 'Pending'
    );
  }

  viewRechargeDetail(recharge: any): void {
    this.selectedRecharge = { ...recharge }; // Crear una copia para evitar modificar el original
    console.log('Selected recharge:', recharge);
  }

  openDocumentLightbox(imageUrl: string): void {
    this.lightboxImage = imageUrl;
    // Abrir el modal usando jQuery (asumiendo que Bootstrap está disponible)
    $('#documentLightbox').modal('show');
  }

  approveRecharge(recharge: any): void {
    if (!recharge.rechargeTransactionReference) {
      alert('Por favor ingrese la referencia de transacción antes de aprobar');
      return;
    }

    const updatedRecharge = {
      ...recharge,
      rechargeStatus: 'approved',
      rechargeUpdateAt: new Date().toISOString(),
      rechargeVerifiedBy: 'Admin' // Puedes cambiar esto por el usuario actual
    };

    this.rechargesService.editRecharges(updatedRecharge).then(() => {
      console.log('Recarga aprobada exitosamente');
      alert('Recarga aprobada exitosamente');
      // Cerrar el modal
      $('#rechargeDetailModal').modal('hide');
    }).catch(error => {
      console.error('Error al aprobar recarga:', error);
      alert('Error al aprobar la recarga');
    });
  }

  rejectRecharge(recharge: any): void {
    if (!confirm('¿Está seguro que desea rechazar esta recarga?')) {
      return;
    }

    const updatedRecharge = {
      ...recharge,
      rechargeStatus: 'rejected',
      rechargeUpdateAt: new Date().toISOString(),
      rechargeVerifiedBy: 'Admin' // Puedes cambiar esto por el usuario actual
    };

    this.rechargesService.editRecharges(updatedRecharge).then(() => {
      console.log('Recarga rechazada');
      alert('Recarga rechazada');
      // Cerrar el modal
      $('#rechargeDetailModal').modal('hide');
    }).catch(error => {
      console.error('Error al rechazar recarga:', error);
      alert('Error al rechazar la recarga');
    });
  }

  loadRequestVehicles(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Optimizamos: Solo cargar viajes de HOY para el contador del dashboard
    const requestsSub = this.requestVehicleService.getFilteredRequests(null, today, tomorrow, 100).pipe(take(1)).subscribe(
      (requests: any[]) => {
        this.requestVehicles = requests;
        this.tripsToday = requests.length;
        console.log('Request vehicles (today) loaded:', this.requestVehicles.length);
      },
      error => {
        console.error('Error loading request vehicles:', error);
      }
    );
    this.subscriptions.push(requestsSub);
  }

  setTripFilter(filter: string): void {
    this.tripFilter = filter;
  }

  getFilteredTrips(status: string): any[] {
    if (status === 'active') {
      // Estados activos: pending, searching, accepted
      return this.requestVehicles.filter(r =>
        r.requestStatusTrip === 'pending' ||
        r.requestStatusTrip === 'searching' ||
        r.requestStatusTrip === 'accepted' ||
        r.requestStatus === 'Activa' ||
        r.requestStatus === 'Pendiente'
      );
    } else if (status === 'in_process') {
      // Estados en proceso: on_way, in_progress, accepted
      return this.requestVehicles.filter(r =>
        r.requestStatusTrip === 'on_way' ||
        r.requestStatusTrip === 'in_progress' ||
        r.requestStatusTrip === 'accepted' ||
        r.requestStatus === 'En Proceso' ||
        (r.requestDriverIsInTrip === true || r.requestClientIsInTrip === true)
      );
    }
    return this.requestVehicles;
  }

  getDisplayedTrips(): any[] {
    if (this.tripFilter === 'all') {
      return this.requestVehicles;
    } else if (this.tripFilter === 'active') {
      return this.getFilteredTrips('active');
    } else if (this.tripFilter === 'in_process') {
      return this.getFilteredTrips('in_process');
    }
    return this.requestVehicles;
  }

  getTripFilterLabel(): string {
    if (this.tripFilter === 'active') {
      return 'activos';
    } else if (this.tripFilter === 'in_process') {
      return 'en proceso';
    }
    return '';
  }

  getStatusLabel(status: string): string {
    const statusMap: any = {
      'pending': 'Pendiente',
      'searching': 'Buscando',
      'accepted': 'Aceptado',
      'on_way': 'En Camino',
      'in_progress': 'En Progreso',
      'finished': 'Finalizado',
      'cancelled': 'Cancelado',
      'Activa': 'Activa',
      'En Proceso': 'En Proceso',
      'Finalizada': 'Finalizada',
      'Cancelada': 'Cancelada',
      'Pendiente': 'Pendiente'
    };
    return statusMap[status] || status;
  }

  viewTripDetail(trip: any): void {
    // Importar Router si no está importado
    this.router.navigate(['/admin-panel/admin-trip-detail', trip.requestId]);
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
