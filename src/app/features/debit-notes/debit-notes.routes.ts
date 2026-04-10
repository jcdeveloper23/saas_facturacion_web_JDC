import { Routes } from '@angular/router';

export const DEBIT_NOTES_ROUTES: Routes = [
  {
    path: '',
    data: { title: 'Notas de Débito' },
    loadComponent: () =>
      import('./debit-notes-list.component').then(m => m.DebitNotesListComponent)
  },
  {
    path: 'new',
    data: { title: 'Nueva Nota de Débito' },
    loadComponent: () =>
      import('./debit-note-form.component').then(m => m.DebitNoteFormComponent)
  },
  {
    path: ':id/edit',
    data: { title: 'Editar Nota de Débito' },
    loadComponent: () =>
      import('./debit-note-form.component').then(m => m.DebitNoteFormComponent)
  }
];
