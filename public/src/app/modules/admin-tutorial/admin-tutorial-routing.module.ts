import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AdminTutorialListComponent } from './admin-tutorial-list/admin-tutorial-list.component';
import { AdminTutorialEditorComponent } from './admin-tutorial-editor/admin-tutorial-editor.component';

const routes: Routes = [
    { path: '', component: AdminTutorialListComponent },
    { path: 'new', component: AdminTutorialEditorComponent },
    { path: 'edit/:id', component: AdminTutorialEditorComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AdminTutorialRoutingModule { }
