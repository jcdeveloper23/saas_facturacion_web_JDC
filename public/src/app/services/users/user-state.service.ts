import { Injectable } from '@angular/core';

/**
 * Interface for storing users list state
 */
export interface UsersListState {
  searchTerm?: string;
  selectedUserType?: string;
  selectedDocStatus?: string;
  selectedAccountStatus?: string;
  pageIndex?: number;
  pageSize?: number;
}

/**
 * Service to manage and preserve users list state when navigating
 * between list and detail views
 */
@Injectable({
  providedIn: 'root'
})
export class UserStateService {
  private listState: UsersListState = {};

  constructor() { }

  /**
   * Save the current list state (filters, pagination, etc.)
   * @param state The state to save
   */
  public saveListState(state: UsersListState): void {
    this.listState = { ...state };
  }

  /**
   * Get the previously saved list state
   * @returns The saved list state or empty object if none exists
   */
  public getListState(): UsersListState {
    return { ...this.listState };
  }

  /**
   * Clear the saved list state
   */
  public clearListState(): void {
    this.listState = {};
  }

  /**
   * Check if there's a saved list state
   * @returns true if a list state has been saved
   */
  public hasListState(): boolean {
    return Object.keys(this.listState).length > 0;
  }
}
