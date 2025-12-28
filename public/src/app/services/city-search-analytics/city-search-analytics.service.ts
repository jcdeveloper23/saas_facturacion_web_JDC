import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Observable, forkJoin, from } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class CitySearchAnalyticsService {

  constructor(
    private db: AngularFirestore
  ) { }

  /**
   * Obtener resúmenes diarios (documentos principales)
   */
  public getDailyStats(): Observable<DailySearchStats[]> {
    console.log('📊 Consultando resúmenes diarios...');
    return this.db.collection<DailySearchStats>('city_search_analytics', ref =>
      ref.orderBy('date', 'desc')
    ).valueChanges();
  }

  /**
   * Obtener logs de un día específico
   */
  public getLogsByDate(date: string): Observable<CitySearchLog[]> {
    console.log(`📅 Consultando logs del ${date}...`);
    return this.db.collection('city_search_analytics')
      .doc(date)
      .collection<CitySearchLog>('logs')
      .valueChanges();
  }

  /**
   * Obtener TODOS los logs de TODOS los días (para análisis completo)
   * Este método es más costoso pero necesario para el análisis detallado
   */
  public getAllLogs(): Observable<CitySearchLog[]> {
    console.log('🔍 Consultando TODOS los logs de todos los días...');

    return this.getDailyStats().pipe(
      take(1),
      switchMap(dailyStats => {
        if (!dailyStats || dailyStats.length === 0) {
          console.log('⚠️ No hay días con estadísticas');
          return from([[]]);
        }

        console.log(`📦 Obteniendo logs de ${dailyStats.length} días...`);

        // Crear array de observables para obtener logs de cada día
        const logsObservables = dailyStats.map(day =>
          this.getLogsByDate(day.date!).pipe(take(1))
        );

        // Esperar a que todos se completen y combinar resultados
        return forkJoin(logsObservables).pipe(
          map(arrayOfLogArrays => {
            // Aplanar el array de arrays a un solo array
            const allLogs = arrayOfLogArrays.reduce((acc, curr) => acc.concat(curr), []);
            console.log(`✅ Total de logs obtenidos: ${allLogs.length}`);
            return allLogs;
          })
        );
      })
    );
  }

  /**
   * Obtener logs sin cobertura de todos los días
   */
  public getNoCoverageLogs(): Observable<CitySearchLog[]> {
    return this.getAllLogs().pipe(
      map(logs => logs.filter(log => log.searchResult === 'no_coverage'))
    );
  }

  /**
   * Obtener logs por resultado específico
   */
  public getLogsByResult(result: string): Observable<CitySearchLog[]> {
    return this.getAllLogs().pipe(
      map(logs => logs.filter(log => log.searchResult === result))
    );
  }

  /**
   * Obtener logs por ciudad encontrada
   */
  public getLogsByCity(cityId: string): Observable<CitySearchLog[]> {
    return this.getAllLogs().pipe(
      map(logs => logs.filter(log => log.cityFoundId === cityId))
    );
  }

  /**
   * Obtener logs por usuario
   */
  public getLogsByUser(userId: string): Observable<CitySearchLog[]> {
    return this.getAllLogs().pipe(
      map(logs => logs.filter(log => log.userId === userId))
    );
  }

  /**
   * Eliminar un log específico de un día específico
   */
  public deleteLog(date: string, logId: string) {
    return this.db.collection('city_search_analytics')
      .doc(date)
      .collection('logs')
      .doc(logId)
      .delete();
  }

  /**
   * Eliminar todos los logs de un día
   */
  public deleteDay(date: string) {
    return this.db.collection('city_search_analytics').doc(date).delete();
  }
}
