import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Module, ModuleInput, PaginatedResponse } from '../interfaces/permission.interface';

@Injectable({
  providedIn: 'root'
})
export class ModulesService {
  private http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiGpsUrl}/modules`;

  /**
   * Get all modules
   */
  getModules(activeOnly = true): Observable<Module[]> {
    const params: Record<string, string> = {};
    if (activeOnly) {
      params['state'] = 'true';
    }
    params['$sort[order]'] = '1';

    return this.http.get<PaginatedResponse<Module> | Module[]>(this.apiUrl, { params }).pipe(
      map(response => {
        if (Array.isArray(response)) {
          return response;
        }
        return response.data || [];
      }),
      catchError(error => {
        console.error('Error loading modules:', error);
        return of([]);
      })
    );
  }

  /**
   * Get a single module by ID
   */
  getModule(id: number): Observable<Module> {
    return this.http.get<Module>(`${this.apiUrl}/${id}`);
  }

  /**
   * Create a new module
   */
  createModule(module: ModuleInput): Observable<Module> {
    return this.http.post<Module>(this.apiUrl, module);
  }

  /**
   * Update a module
   */
  updateModule(id: number, module: Partial<ModuleInput>): Observable<Module> {
    return this.http.patch<Module>(`${this.apiUrl}/${id}`, module);
  }

  /**
   * Delete a module
   */
  deleteModule(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /**
   * Get modules as options for select
   */
  getModulesAsOptions(): Observable<{ value: number; label: string }[]> {
    return this.getModules(true).pipe(
      map(modules => modules.map(m => ({
        value: m.id,
        label: m.name
      })))
    );
  }
}
