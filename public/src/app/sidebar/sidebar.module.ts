import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { DragDropModule } from '@angular/cdk/drag-drop';

@NgModule({
    imports: [RouterModule, CommonModule, NgbModule, DragDropModule],
    declarations: [SidebarComponent],
    exports: [SidebarComponent]
})

export class SidebarModule { }
