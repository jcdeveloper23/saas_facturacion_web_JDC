import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CKEditorModule } from '@ckeditor/ckeditor5-angular';

import { AdminTutorialRoutingModule } from './admin-tutorial-routing.module';
import { AdminTutorialListComponent } from './admin-tutorial-list/admin-tutorial-list.component';
import { AdminTutorialEditorComponent } from './admin-tutorial-editor/admin-tutorial-editor.component';

@NgModule({
    declarations: [
        AdminTutorialListComponent,
        AdminTutorialEditorComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        AdminTutorialRoutingModule,
        RouterModule,
        CKEditorModule
    ]
})
export class AdminTutorialModule { }
