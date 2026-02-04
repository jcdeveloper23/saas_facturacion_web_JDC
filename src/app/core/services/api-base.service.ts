import { inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginationParams } from '../interfaces';

/**
 * Base API Service - Provides common HTTP methods for all services
 * Follows FeathersJS API conventions used by the backend
 */
export abstract class ApiBaseService<T> {
  protected http = inject(HttpClient);
  protected readonly baseUrl = environment.apiGpsUrl;
  protected abstract endpoint: string;

  protected get url(): string {
    return `${this.baseUrl}/${this.endpoint}`;
  }

  /**
   * Find all records with optional query params
   */
  find(query?: PaginationParams & Record<string, unknown>): Observable<ApiResponse<T[]>> {
    const params = this.buildParams(query);
    console.log('url', this.url);
    // console.log('params', params);

    return this.http.get<ApiResponse<T[]>>(this.url, { params });
  }

  /**
   * Get a single record by ID
   */
  get(id: number | string, query?: Record<string, unknown>): Observable<T> {
    const params = this.buildParams(query);
    return this.http.get<T>(`${this.url}/${id}`, { params });
  }

  /**
   * Create a new record
   */
  create(data: Partial<T>): Observable<T> {
    return this.http.post<T>(this.url, data);
  }

  /**
   * Update an existing record (PATCH)
   */
  patch(id: number | string, data: Partial<T>): Observable<T> {
    return this.http.patch<T>(`${this.url}/${id}`, data);
  }

  /**
   * Replace an existing record (PUT)
   */
  update(id: number | string, data: T): Observable<T> {
    return this.http.put<T>(`${this.url}/${id}`, data);
  }

  /**
   * Remove a record
   */
  remove(id: number | string): Observable<T> {
    return this.http.delete<T>(`${this.url}/${id}`);
  }

  /**
   * Build HTTP params from query object
   */
  protected buildParams(query?: Record<string, unknown>): HttpParams {
    let params = new HttpParams();

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        if (Array.isArray(value)) {
          value.forEach(v => {
            params = params.append(`${key}[]`, String(v));
          });
        } else if (typeof value === 'object' && !(value instanceof Date)) {
          // Flatten simple objects for Feathers/Express: key[subKey]=value
          // This supports operators like { $gte: '...' } -> key[$gte]=...
          Object.entries(value as Record<string, unknown>).forEach(([subKey, subValue]) => {
            if (subValue !== undefined && subValue !== null) {
              params = params.append(`${key}[${subKey}]`, String(subValue));
            }
          });
        } else {
          params = params.set(key, String(value));
        }
      });
    }

    return params;
  }
}
