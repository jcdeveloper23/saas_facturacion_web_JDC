import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Action, ActionInput, PaginatedResponse } from '../interfaces/permission.interface';

@Injectable({
  providedIn: 'root'
})
export class ActionsService {
  private http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiGpsUrl}/actions`;

  /**
   * Get all actions
   */
  getActions(activeOnly = true): Observable<Action[]> {
    const params: Record<string, string> = {};
    if (activeOnly) {
      params['state'] = 'true';
    }

    return this.http.get<PaginatedResponse<Action> | Action[]>(this.apiUrl, { params }).pipe(
      map(response => {
        if (Array.isArray(response)) {
          return response;
        }
        return response.data || [];
      }),
      catchError(error => {
        console.error('Error loading actions:', error);
        return of([]);
      })
    );
  }

  /**
   * Get a single action by ID
   */
  getAction(id: number): Observable<Action> {
    return this.http.get<Action>(`${this.apiUrl}/${id}`);
  }

  /**
   * Create a new action
   */
  createAction(action: ActionInput): Observable<Action> {
    return this.http.post<Action>(this.apiUrl, action);
  }

  /**
   * Update an action
   */
  updateAction(id: number, action: Partial<ActionInput>): Observable<Action> {
    return this.http.patch<Action>(`${this.apiUrl}/${id}`, action);
  }

  /**
   * Delete an action
   */
  deleteAction(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /**
   * Get actions as options for select
   */
  getActionsAsOptions(): Observable<{ value: number; label: string }[]> {
    return this.getActions(true).pipe(
      map(actions => actions.map(a => ({
        value: a.id,
        label: a.name
      })))
    );
  }
}
