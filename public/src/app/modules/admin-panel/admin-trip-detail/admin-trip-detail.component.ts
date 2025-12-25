import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RequestVehicleService } from '../../../services/request-vehicle/request-vehicle.service';

declare var L: any;

@Component({
  selector: 'app-admin-trip-detail',
  templateUrl: './admin-trip-detail.component.html',
  styleUrls: ['./admin-trip-detail.component.css']
})
export class AdminTripDetailComponent implements OnInit, AfterViewInit, OnDestroy {

  public trip: any = null;
  public tripId: string = '';
  public loading: boolean = true;
  private map: any;
  private routePolyline: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private requestVehicleService: RequestVehicleService
  ) { }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.tripId = params['id'];
      this.loadTripData();
    });
  }

  ngAfterViewInit(): void {
    // El mapa se inicializará después de cargar los datos
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  loadTripData(): void {
    this.loading = true;
    // Obtener todos los viajes y buscar el específico
    this.requestVehicleService.getAllRequests().subscribe(
      (trips: any[]) => {
        this.trip = trips.find(t => t.requestId === this.tripId);
        this.loading = false;

        if (this.trip) {
          console.log(JSON.stringify(this.trip, null, 2));

          // Inicializar el mapa después de cargar los datos
          setTimeout(() => {
            this.initMap();
          }, 100);
        } else {
          console.error('Viaje no encontrado');
        }
      },
      error => {
        console.error('Error loading trip:', error);
        this.loading = false;
      }
    );
  }

  initMap(): void {
    if (!this.trip || !this.trip.requestCoordinatesOriginDestiny || this.trip.requestCoordinatesOriginDestiny.length === 0) {
      console.warn('No hay coordenadas para mostrar en el mapa');
      return;
    }

    // Crear el mapa centrado en la primera coordenada
    const firstCoord = this.trip.requestCoordinatesOriginDestiny[0];
    this.map = L.map('tripMap').setView([firstCoord.lat, firstCoord.lng], 13);

    // Agregar capa de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(this.map);

    // Convertir coordenadas al formato de Leaflet
    const latlngs = this.trip.requestCoordinatesOriginDestiny.map((coord: any) => [coord.lat, coord.lng]);

    // Dibujar la ruta como polyline
    this.routePolyline = L.polyline(latlngs, {
      color: '#FF6B35',
      weight: 5,
      opacity: 0.7,
      smoothFactor: 1
    }).addTo(this.map);

    // Agregar marcador de origen (verde)
    if (latlngs.length > 0) {
      const originIcon = L.divIcon({
        html: '<div style="background-color: #28a745; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center;"><i class="nc-icon nc-pin-3" style="color: white; font-size: 16px;"></i></div>',
        className: 'custom-marker-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      L.marker(latlngs[0], { icon: originIcon }).addTo(this.map)
        .bindPopup('<b>Origen:</b><br>' + (this.trip.requestClientAddressOrigin || 'Punto de partida'));
    }

    // Agregar marcador de destino (rojo)
    if (latlngs.length > 1) {
      const destinyIcon = L.divIcon({
        html: '<div style="background-color: #dc3545; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center;"><i class="nc-icon nc-pin-3" style="color: white; font-size: 16px;"></i></div>',
        className: 'custom-marker-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      L.marker(latlngs[latlngs.length - 1], { icon: destinyIcon }).addTo(this.map)
        .bindPopup('<b>Destino:</b><br>' + (this.trip.requestClientAddressDestiny || 'Punto de llegada'));
    }

    // Ajustar el mapa para mostrar toda la ruta
    this.map.fitBounds(this.routePolyline.getBounds(), { padding: [50, 50] });
  }

  getStatusLabel(status: string): string {
    const statusMap: any = {
      'requested': 'Solicitado',
      'acceptedByDriver': 'Aceptado por Conductor',
      'driverIsInSitu': 'Conductor en Lugar',
      'inTravel': 'En Viaje',
      'finished': 'Finalizado',
      'cancelledByUser': 'Cancelado por Usuario',
      'cancelledByDriver': 'Cancelado por Conductor',
      'Finalizada': 'Finalizado',
      'Cancelada': 'Cancelado'
    };
    return statusMap[status] || status;
  }

  getStatusClass(status: string): string {
    if (status === 'requested') return 'badge-warning';
    if (status === 'acceptedByDriver' || status === 'driverIsInSitu') return 'badge-info';
    if (status === 'inTravel') return 'badge-primary';
    if (status === 'finished' || status === 'Finalizada') return 'badge-success';
    if (status === 'cancelledByUser' || status === 'cancelledByDriver' || status === 'Cancelada') return 'badge-danger';
    return 'badge-secondary';
  }

  goBack(): void {
    this.router.navigate(['/admin-panel/admin-trips']);
  }
}
