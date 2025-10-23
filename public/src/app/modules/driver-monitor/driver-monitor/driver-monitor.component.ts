import { Component, OnInit, OnDestroy } from '@angular/core';
import { UsersService } from 'app/services/users/users.service';
import { Users } from 'app/interfaces/users';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-driver-monitor',
  templateUrl: './driver-monitor.component.html',
  styleUrls: ['./driver-monitor.component.css']
})
export class DriverMonitorComponent implements OnInit, OnDestroy {

  public activeDrivers: Users[] = [];
  public mapCenter = { lat: 7.7677778, lng: -72.234686 }; // Coordenadas por defecto
  public zoom = 12;
  private driversSubscription: Subscription;
  public hasActiveDrivers: boolean = false; // Nueva propiedad para saber si hay conductores activos
  private isMapInitialized: boolean = false; // Flag para centrar el mapa solo una vez
  public followedDriverId: string | null = null; // ID del conductor que se está siguiendo
  public isDriverListCollapsed: boolean = false; // Flag para colapsar la lista de conductores
  private timeUpdateInterval: any;

  constructor(
    private usersService: UsersService
  ) { }

  ngOnInit(): void {
    this.loadActiveDrivers();
    // Actualiza el tiempo relativo cada 10 segundos para mantener la vista fresca.
    this.timeUpdateInterval = setInterval(() => {
      this.updateRelativeTimes();
    }, 10000);
  }

  ngOnDestroy(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
    if (this.driversSubscription) {
      this.driversSubscription.unsubscribe();
    }
  }

  /**
   * Carga conductores activos en tiempo real
   */
  loadActiveDrivers() {
    this.driversSubscription = this.usersService.getActiveDrivers().subscribe(drivers => {
      // Filtra y mapea los datos en un solo paso para mejorar el rendimiento.
      this.activeDrivers = drivers.filter(driver =>
        driver.userLastLocationLatitude &&
        driver.userLastLocationLongitude
        && driver.userStateShareLocation // Asegurarse de que estén compartiendo ubicación
      ).map(driver => {
        // Pre-calculamos los valores para evitar llamadas a funciones en el template.
        return {
          ...driver,
          markerIcon: this.getDriverMarkerIcon(driver),
          markerLabel: this.getDriverLabel(driver),
          formattedLastLocationDate: this.getRelativeTime(driver.userLastLocationDate)
        };
      });

      this.hasActiveDrivers = this.activeDrivers.length > 0;
      
      // Centrar el mapa solo la primera vez que se cargan los conductores.
      if (this.followedDriverId) {
        // Si se está siguiendo a un conductor, mantener el mapa centrado en él.
        const followedDriver = this.activeDrivers.find(d => d.userUid === this.followedDriverId);
        if (followedDriver) {
          this.mapCenter = {
            lat: followedDriver.userLastLocationLatitude,
            lng: followedDriver.userLastLocationLongitude
          };
        }
      } else if (this.hasActiveDrivers && !this.isMapInitialized) {
        // Si no se sigue a nadie, centrar el mapa solo la primera vez.
        this.mapCenter = {
          lat: this.activeDrivers[0].userLastLocationLatitude,
          lng: this.activeDrivers[0].userLastLocationLongitude
        };
        this.zoom = 14;
        this.isMapInitialized = true; // Marcar como inicializado para no volver a centrar.
      }

    });
  }
 
  /**
   * Obtiene la etiqueta del marcador para cada conductor
   */
  getDriverLabel(driver: Users): string {
    return driver.userName ? driver.userName.charAt(0).toUpperCase() : 'D';
  }

  /**
   * Obtiene el ícono del marcador para cada conductor
   */
  getDriverMarkerIcon(driver: Users): any {
    // Usar siempre el ícono de pin como se solicitó.
    return {
      url: 'assets/img/icons/pin.png',
      scaledSize: { width: 40, height: 40 },
    };
  }

  /**
   * Formatea la fecha de última ubicación para mostrarla de forma legible.
   */
  formatLastLocationDate(dateString: string): string {
    if (!dateString) return 'N/A';
    try { 
      const date = new Date(dateString); 
      return date.toLocaleString(); // Formato local de fecha y hora
    } catch (error) {
      console.error('Error al formatear la fecha:', error);
      return 'N/A';
    }
  }

  /**
   * Actualiza el campo de tiempo relativo para cada conductor activo.
   */
  private updateRelativeTimes() {
    if (this.activeDrivers.length > 0) {
      this.activeDrivers = this.activeDrivers.map(driver => ({
        ...driver,
        formattedLastLocationDate: this.getRelativeTime(driver.userLastLocationDate)
      }));
    }
  }

  /**
   * Convierte una fecha en formato string a un texto de tiempo relativo (ej: "hace 5 min").
   * @param dateString La fecha a convertir.
   */
  private getRelativeTime(dateString: string): string {
    if (!dateString) return 'N/A';

    const now = new Date();
    const lastUpdate = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);

    if (diffInSeconds < 10) return 'ahora';
    if (diffInSeconds < 60) return `hace ${diffInSeconds} seg`;

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes === 1) return `hace 1 min`;
    if (diffInMinutes < 60) return `hace ${diffInMinutes} min`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours === 1) return `hace 1 hora`;
    if (diffInHours < 24) return `hace ${diffInHours} horas`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return `hace 1 día`;
    if (diffInDays <= 7) return `hace ${diffInDays} días`;

    // Si es más de una semana, muestra la fecha normal.
    return lastUpdate.toLocaleDateString();
  }

  /**
   * Activa o desactiva el seguimiento de un conductor en el mapa.
   * @param driver El conductor a seguir.
   */
  public toggleFollowDriver(driver: Users) {
    if (this.followedDriverId === driver.userUid) {
      // Si ya se está siguiendo a este conductor, se desactiva el seguimiento.
      this.followedDriverId = null;
    } else {
      // Si no, se activa el seguimiento para este conductor.
      this.followedDriverId = driver.userUid;
      // Centra el mapa inmediatamente en el conductor y aumenta el zoom.
      this.mapCenter = { lat: driver.userLastLocationLatitude, lng: driver.userLastLocationLongitude };
      this.zoom = 16; // Un zoom más cercano para el seguimiento
    }
  }

  /**
   * Colapsa o expande la lista de conductores.
   */
  public toggleDriverList() {
    this.isDriverListCollapsed = !this.isDriverListCollapsed;
  }

}
