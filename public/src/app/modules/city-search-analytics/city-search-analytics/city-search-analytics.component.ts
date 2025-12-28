import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { CitySearchAnalyticsService } from 'app/services/city-search-analytics/city-search-analytics.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { AngularFireAuth } from '@angular/fire/auth';

@Component({
  selector: 'app-city-search-analytics',
  templateUrl: './city-search-analytics.component.html',
  styleUrls: ['./city-search-analytics.component.css']
})
export class CitySearchAnalyticsComponent implements OnInit {

  public dataSource: MatTableDataSource<CitySearchLog>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableLogs") paginator: MatPaginator;

  public displayedColumns: string[] = [
    'timestamp',
    'userLocation',
    'searchResult',
    'cityFound',
    'distance',
    'coverage',
    'platform',
    'details'
  ];

  public allLogs: Array<CitySearchLog> = [];
  public filteredLogs: Array<CitySearchLog> = [];
  public currentFilter: string = 'all';

  // Datos de resumen diario
  public dailyStats: Array<DailySearchStats> = [];
  public showDailyView: boolean = false; // Toggle entre vista diaria y vista detallada

  // Estadísticas
  public stats = {
    total: 0,
    success: 0,
    noCoverage: 0,
    errors: 0,
    avgDistance: 0,
    uniqueUsers: 0,
    uniqueLocalities: new Set<string>()
  };

  // Top localidades sin cobertura
  public topNoCoverageLocalities: Array<{ locality: string; count: number; coords: { lat: number; lng: number } }> = [];

  // Filtros
  public platformFilter: string = 'all';
  public dateRangeFilter: string = 'all'; // 'today', 'week', 'month', 'all'

  // Mapa de Calor
  public showHeatmap: boolean = false;
  public heatmapData: Array<{ lat: number; lng: number; weight?: number }> = [];
  public mapCenter: { lat: number; lng: number } = { lat: 10.4806, lng: -66.9036 }; // Caracas, Venezuela por defecto
  public mapZoom: number = 7;
  public heatmapFilter: string = 'all'; // 'all', 'success', 'no_coverage', 'error'
  public markerRadius: number = 800; // Radio de los círculos en metros

  constructor(
    private citySearchService: CitySearchAnalyticsService,
    public loadingService: LoadingService,
    public utilsService: UtilsService,
    private afAuth: AngularFireAuth
  ) { }

  ngOnInit(): void {
    this.checkAuthentication();
    this.getLogs();
  }

  private async checkAuthentication() {
    const user = await this.afAuth.currentUser;
    if (user) {
      console.log('✅ Usuario autenticado:', user.email);
      console.log('🔑 UID:', user.uid);

      // Obtener el token para ver los custom claims
      const token = await user.getIdTokenResult();
      console.log('🎫 Custom Claims:', JSON.stringify(token.claims, null, 3));
      console.log('👤 userRol:', token.claims['userRol']);
    } else {
      console.error('❌ Usuario NO autenticado');
    }
  }

  public getLogs() {
    this.loadingService.show('Cargando análisis de búsquedas...');

    // Cargar resúmenes diarios
    this.citySearchService.getDailyStats().subscribe(
      stats => {
        console.log('✅ Resúmenes diarios recibidos:', stats.length);
        this.dailyStats = stats;
      },
      error => {
        console.error('❌ Error al cargar resúmenes diarios:', error);
      }
    );

    // Cargar todos los logs
    this.citySearchService.getAllLogs().subscribe(
      logs => {
        console.log('✅ Logs recibidos:', logs.length);
        this.allLogs = logs;
        console.log(JSON.stringify(logs, null, 2));

        this.calculateStats();
        this.calculateTopNoCoverageLocalities();
        this.applyFilter(this.currentFilter);
        this.loadingService.hide();
      },
      error => {
        console.error('❌ Error al cargar logs:', error);
        console.error('Código de error:', error.code);
        console.error('Mensaje:', error.message);
        this.loadingService.hide();
        this.utilsService.showNotification('top', 'right', 'nc-alert-circle-i',
          'Error al cargar búsquedas: ' + error.message, 'danger');
      }
    );
  }

  private calculateStats() {
    this.stats = {
      total: this.allLogs.length,
      success: 0,
      noCoverage: 0,
      errors: 0,
      avgDistance: 0,
      uniqueUsers: 0,
      uniqueLocalities: new Set<string>()
    };

    const uniqueUsersSet = new Set<string>();
    let totalDistance = 0;
    let distanceCount = 0;

    this.allLogs.forEach(log => {
      // Contar por resultado
      if (log.searchResult === 'success') this.stats.success++;
      else if (log.searchResult === 'no_coverage') this.stats.noCoverage++;
      else if (log.searchResult === 'error') this.stats.errors++;

      // Usuarios únicos
      if (log.userId) uniqueUsersSet.add(log.userId);

      // Localidades únicas
      if (log.googleLocality) this.stats.uniqueLocalities.add(log.googleLocality);

      // Distancia promedio
      if (log.distanceToNearestCity) {
        totalDistance += log.distanceToNearestCity;
        distanceCount++;
      }
    });

    this.stats.uniqueUsers = uniqueUsersSet.size;
    this.stats.avgDistance = distanceCount > 0 ? totalDistance / distanceCount : 0;
  }

  private calculateTopNoCoverageLocalities() {
    const noCoverageLogs = this.allLogs.filter(log => log.searchResult === 'no_coverage' && log.googleLocality);

    // Agrupar por localidad
    const localityMap = new Map<string, { count: number; coords: { lat: number; lng: number } }>();

    noCoverageLogs.forEach(log => {
      const locality = log.googleLocality!;
      if (localityMap.has(locality)) {
        localityMap.get(locality)!.count++;
      } else {
        localityMap.set(locality, {
          count: 1,
          coords: { lat: log.userLat!, lng: log.userLng! }
        });
      }
    });

    // Convertir a array y ordenar
    this.topNoCoverageLocalities = Array.from(localityMap.entries())
      .map(([locality, data]) => ({ locality, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10
  }

  public applyFilter(filter: string) {
    this.currentFilter = filter;

    if (filter === 'all') {
      this.filteredLogs = this.allLogs;
    } else if (filter === 'success') {
      this.filteredLogs = this.allLogs.filter(log => log.searchResult === 'success');
    } else if (filter === 'no_coverage') {
      this.filteredLogs = this.allLogs.filter(log => log.searchResult === 'no_coverage');
    } else if (filter === 'error') {
      this.filteredLogs = this.allLogs.filter(log => log.searchResult === 'error');
    }

    this.applyAdditionalFilters();
  }

  private applyAdditionalFilters() {
    let filtered = [...this.filteredLogs];

    // Filtro de plataforma
    if (this.platformFilter !== 'all') {
      filtered = filtered.filter(log => log.platform === this.platformFilter);
    }

    // Filtro de fecha
    if (this.dateRangeFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter(log => {
        if (!log.timestamp) return false;
        const logDate = new Date(log.timestamp);
        const diffDays = Math.floor((now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));

        if (this.dateRangeFilter === 'today') return diffDays === 0;
        if (this.dateRangeFilter === 'week') return diffDays <= 7;
        if (this.dateRangeFilter === 'month') return diffDays <= 30;
        return true;
      });
    }

    this.dataSource = new MatTableDataSource<CitySearchLog>(filtered);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  public onPlatformFilterChange() {
    this.applyFilter(this.currentFilter);
  }

  public onDateRangeFilterChange() {
    this.applyFilter(this.currentFilter);
  }

  public getResultBadgeClass(result: string): string {
    if (result === 'success') return 'badge-success';
    if (result === 'no_coverage') return 'badge-warning';
    if (result === 'error') return 'badge-danger';
    return 'badge-secondary';
  }

  public getResultText(result: string): string {
    if (result === 'success') return 'Exitosa';
    if (result === 'no_coverage') return 'Sin Cobertura';
    if (result === 'error') return 'Error';
    return 'Desconocido';
  }

  public formatDate(timestamp: string | undefined): string {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  public openGoogleMaps(lat: number, lng: number) {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(url, '_blank');
  }

  public exportNoCoverageLocalities() {
    // Exportar a CSV las localidades sin cobertura
    const csvData = this.topNoCoverageLocalities.map(item =>
      `"${item.locality}",${item.count},${item.coords.lat},${item.coords.lng}`
    ).join('\n');

    const csv = `Localidad,Búsquedas,Latitud,Longitud\n${csvData}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `localidades_sin_cobertura_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  public toggleView() {
    this.showDailyView = !this.showDailyView;
  }

  public loadLogsForDay(date: string) {
    this.loadingService.show(`Cargando logs del ${date}...`);
    this.citySearchService.getLogsByDate(date).subscribe(
      logs => {
        console.log(`✅ Logs del ${date} recibidos:`, logs.length);
        this.filteredLogs = logs;
        this.dataSource = new MatTableDataSource<CitySearchLog>(logs);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.showDailyView = false;
        this.loadingService.hide();
      },
      error => {
        console.error('❌ Error al cargar logs del día:', error);
        this.loadingService.hide();
        this.utilsService.showNotification('top', 'right', 'nc-alert-circle-i',
          'Error al cargar logs del día: ' + error.message, 'danger');
      }
    );
  }

  // ==================== MÉTODOS DEL MAPA DE CALOR ====================

  public toggleHeatmap() {
    this.showHeatmap = !this.showHeatmap;
    if (this.showHeatmap) {
      this.generateHeatmapData();
    }
  }

  public generateHeatmapData() {
    console.log('🗺️ Generando datos del mapa de calor...');
    console.log('📊 Total de logs disponibles:', this.allLogs.length);

    let logsToMap = this.allLogs;

    // Aplicar filtro de resultado
    if (this.heatmapFilter !== 'all') {
      logsToMap = logsToMap.filter(log => log.searchResult === this.heatmapFilter);
      console.log(`🔍 Después de filtrar por "${this.heatmapFilter}": ${logsToMap.length} logs`);
    }

    // Filtrar logs que tengan coordenadas válidas
    const validLogs = logsToMap.filter(log =>
      log.userLat !== undefined &&
      log.userLng !== undefined &&
      !isNaN(log.userLat) &&
      !isNaN(log.userLng)
    );

    console.log(`📍 Logs con coordenadas válidas: ${validLogs.length} de ${logsToMap.length}`);

    // Mostrar muestra de las primeras coordenadas
    if (validLogs.length > 0) {
      console.log('📌 Primeros 3 puntos:', validLogs.slice(0, 3).map(log => ({
        lat: log.userLat,
        lng: log.userLng,
        locality: log.googleLocality
      })));
    }

    // Convertir a formato del heatmap
    this.heatmapData = validLogs.map(log => ({
      lat: log.userLat!,
      lng: log.userLng!,
      weight: 1 // Cada búsqueda tiene peso 1
    }));

    // Calcular el centro del mapa basado en los datos
    if (this.heatmapData.length > 0) {
      const avgLat = this.heatmapData.reduce((sum, point) => sum + point.lat, 0) / this.heatmapData.length;
      const avgLng = this.heatmapData.reduce((sum, point) => sum + point.lng, 0) / this.heatmapData.length;
      this.mapCenter = { lat: avgLat, lng: avgLng };
      console.log(`📍 Centro calculado del mapa: ${this.mapCenter.lat}, ${this.mapCenter.lng}`);
    } else {
      console.warn('⚠️ No hay datos para mostrar en el mapa');
    }

    console.log(`✅ Mapa de calor generado con ${this.heatmapData.length} puntos`);
    console.log(`🎨 Color de marcadores: ${this.getMarkerColor()}`);
    console.log(`📏 Radio de marcadores: ${this.markerRadius}m`);
  }

  public onHeatmapFilterChange() {
    console.log(`🔍 Filtro de mapa cambiado a: ${this.heatmapFilter}`);
    this.generateHeatmapData();
  }

  public getHeatmapGradient(): string[] {
    // Gradiente personalizado para el mapa de calor
    // De menos a más intensidad: transparente → azul → verde → amarillo → rojo
    return [
      'rgba(0, 255, 255, 0)',
      'rgba(0, 255, 255, 1)',
      'rgba(0, 191, 255, 1)',
      'rgba(0, 127, 255, 1)',
      'rgba(0, 63, 255, 1)',
      'rgba(0, 0, 255, 1)',
      'rgba(0, 0, 223, 1)',
      'rgba(0, 0, 191, 1)',
      'rgba(0, 0, 159, 1)',
      'rgba(0, 0, 127, 1)',
      'rgba(63, 0, 91, 1)',
      'rgba(127, 0, 63, 1)',
      'rgba(191, 0, 31, 1)',
      'rgba(255, 0, 0, 1)'
    ];
  }

  public getMarkerColor(): string {
    // Retorna el color basado en el filtro actual
    switch (this.heatmapFilter) {
      case 'success':
        return '#28a745'; // Verde para búsquedas exitosas
      case 'no_coverage':
        return '#ffc107'; // Amarillo/Naranja para sin cobertura
      case 'error':
        return '#dc3545'; // Rojo para errores
      default:
        return '#FF6B6B'; // Rojo coral para todas
    }
  }
}
