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
      params['state'] = '1';
    }
    params['$sort[order]'] = '1';

    console.log(params);
    
    return this.http.get<PaginatedResponse<Module> | Module[]>(this.apiUrl, { params }).pipe(
      map(response => {
        console.log(`*** response Modules ${JSON.stringify(response, null, 3)} ***`);
        
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
    return this.getModulesFlat(true).pipe(
      map(modules => modules.map(m => ({
        value: m.id,
        label: m.name
      })))
    );
  }

  /**
   * Get all modules as a flat list (including children)
   * Useful for admin views where all modules need to be displayed
   * Includes _level and _parentName for hierarchical display
   */
  getModulesFlat(activeOnly = true): Observable<Module[]> {
    return this.getModules(activeOnly).pipe(
      map(modules => this.flattenModules(modules))
    );
  }

  /**
   * Flatten hierarchical modules into a single array
   * Children are extracted and placed after their parent
   * Adds _level and _parentName for UI hierarchy display
   */
  private flattenModules(modules: Module[]): Module[] {
    const result: Module[] = [];

    const processModule = (module: Module, level: number = 0, parentName?: string) => {
      // Add the module with hierarchy info
      const { children, ...moduleWithoutChildren } = module;
      const flatModule = {
        ...moduleWithoutChildren,
        _level: level,
        _parentName: parentName || null
      } as Module;

      result.push(flatModule);

      // Process children recursively (they will be placed right after the parent)
      if (children && children.length > 0) {
        // Sort children by order before processing
        const sortedChildren = [...children].sort((a, b) => a.order - b.order);
        sortedChildren.forEach(child => processModule(child, level + 1, module.name));
      }
    };

    // First, sort root modules by order
    const sortedModules = [...modules].sort((a, b) => a.order - b.order);
    sortedModules.forEach(module => processModule(module, 0));

    return result;
  }
}
