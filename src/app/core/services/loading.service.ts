import { Injectable, signal, computed } from '@angular/core';

/**
 * Loading Service - Manages global loading state using Angular signals
 */
@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private loadingCount = signal(0);
  private loadingText = signal('');

  readonly isLoading = computed(() => this.loadingCount() > 0);
  readonly text = computed(() => this.loadingText());

  show(text: string = 'Cargando...'): void {
    this.loadingCount.update(count => count + 1);
    this.loadingText.set(text);
  }

  hide(): void {
    this.loadingCount.update(count => Math.max(0, count - 1));
    if (this.loadingCount() === 0) {
      this.loadingText.set('');
    }
  }

  reset(): void {
    this.loadingCount.set(0);
    this.loadingText.set('');
  }
}
