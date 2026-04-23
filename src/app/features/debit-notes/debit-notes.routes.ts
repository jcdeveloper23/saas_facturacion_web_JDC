import { Routes } from '@angular/router';
import { moduleGuard } from '../../core/guards';

export const DEBIT_NOTES_ROUTES: Routes = [
  {
    path: '',
    canActivate: [moduleGuard],
    data: { module: 'debitNotes', title: 'Notas de Débito' },
    loadComponent: () =>
      import('./debit-notes-list.component').then(m => m.DebitNotesListComponent)
  },
  {
    path: 'new',
    canActivate: [moduleGuard],
    data: { module: 'debitNotes', title: 'Nueva Nota de Débito' },
    loadComponent: () =>
      import('./debit-note-form.component').then(m => m.DebitNoteFormComponent)
  },
  {
    path: ':id/edit',
    canActivate: [moduleGuard],
    data: { module: 'debitNotes', title: 'Editar Nota de Débito' },
    loadComponent: () =>
      import('./debit-note-form.component').then(m => m.DebitNoteFormComponent)
  }
];
