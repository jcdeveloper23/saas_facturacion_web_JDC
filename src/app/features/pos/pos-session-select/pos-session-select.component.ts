import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, SpinnerModule,
  FormModule, AlertModule, BadgeModule, ModalModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PosCashService }    from '../services/pos-cash.service';
import { PosSessionService } from '../services/pos-session.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService }         from '../../../core/services/auth.service';
import { PosTerminal, PosSession } from '../models/pos.interface';

@Component({
  selector: 'app-pos-session-select',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, SpinnerModule,
    FormModule, AlertModule, BadgeModule, ModalModule,
    IconModule
  ],
  templateUrl: './pos-session-select.component.html',
  styleUrl: './pos-session-select.component.scss'
})
export class PosSessionSelectComponent implements OnInit, OnDestroy {
  private destroy$    = new Subject<void>();
  private cashService = inject(PosCashService);
  private posSession  = inject(PosSessionService);
  private router      = inject(Router);
  private notify      = inject(NotificationService);
  private auth        = inject(AuthService);

  readonly terminals   = signal<PosTerminal[]>([]);
  readonly loading     = signal(true);
  readonly saving      = signal(false);
  readonly errorMsg    = signal('');

  // Paso 1: seleccionar terminal
  readonly selectedTerminal = signal<PosTerminal | null>(null);

  // Si hay sesión abierta para el terminal seleccionado
  readonly existingSession = signal<PosSession | null>(null);
  readonly checkingSession = signal(false);

  // Paso 2: apertura de caja
  openingBalance = 0;
  openingNotes   = '';

  ngOnInit(): void {
    // Si ya hay sesión activa, ir directo al POS
    if (this.posSession.hasActiveSession()) {
      this.router.navigate(['/pos/main']);
      return;
    }

    this.cashService.getTerminals()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  t  => { this.terminals.set(t); this.loading.set(false); },
        error: () => { this.loading.set(false); this.errorMsg.set('Error cargando terminales'); }
      });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  async selectTerminal(terminal: PosTerminal): Promise<void> {
    this.selectedTerminal.set(terminal);
    this.checkingSession.set(true);
    this.existingSession.set(null);

    try {
      const session = await firstValueFrom(this.cashService.getOpenSession(terminal.id));
      // Siempre mostrar confirmación si hay sesión abierta — nunca navegar silenciosamente.
      // Esto cubre también sesiones huérfanas (terminal.currentSessionId = null pero
      // pos-sessions aún tiene status 'open' para este terminal).
      if (session) {
        this.existingSession.set(session);
      }
    } catch {
      // Sin sesión abierta
    } finally {
      this.checkingSession.set(false);
    }
  }

  /** Retomar una sesión ya abierta (propia o de otro). Repara currentSessionId si es necesario. */
  async resumeSession(): Promise<void> {
    const terminal = this.selectedTerminal()!;
    const session  = this.existingSession()!;
    this.saving.set(true);
    try {
      // Reparar inconsistencia: terminal puede tener currentSessionId=null pero sesión sigue abierta
      if (!terminal.currentSessionId) {
        const user = this.auth.user();
        await this.cashService.updateTerminal(terminal.id, {
          currentSessionId: session.id,
          currentUserId:    user?.uid ?? '',
          currentUserName:  user?.displayName ?? user?.email ?? '',
        });
      }
      this.posSession.setTerminalAndSession(terminal, session);
      this.posSession.setDefaultCustomer();
      await this.router.navigate(['/pos/main']);
    } catch (err: any) {
      this.errorMsg.set(err.message ?? 'Error al retomar sesión');
    } finally {
      this.saving.set(false);
    }
  }

  /** Abrir nueva sesión de caja */
  async openSession(): Promise<void> {
    const terminal = this.selectedTerminal();
    if (!terminal) return;
    if (this.saving()) return;

    this.saving.set(true);
    this.errorMsg.set('');

    try {
      const session = await this.cashService.openSession(
        terminal.id,
        terminal.name,
        this.openingBalance,
        this.openingNotes || undefined
      );
      this.posSession.setTerminalAndSession(terminal, session);
      this.posSession.setDefaultCustomer();
      this.notify.success('Caja abierta', `Sesión iniciada en ${terminal.name}`);
      await this.router.navigate(['/pos/main']);
    } catch (err: any) {
      this.errorMsg.set(err.message ?? 'Error abriendo caja');
    } finally {
      this.saving.set(false);
    }
  }

  showTerminalInfo = false;

  back(): void { this.selectedTerminal.set(null); this.existingSession.set(null); }

  goToTerminals(): void { this.router.navigate(['/pos/terminals']); }

  get currentUser() { return this.auth.user(); }
  get isAdmin()     { return this.auth.isAdmin(); }
}
