import { Component, OnInit } from '@angular/core';
import { TutorialService } from '../../../services/tutorial/tutorial.service';
import { TutorialSection } from '../../../interfaces/tutorial';
import { Router } from '@angular/router';

@Component({
    selector: 'app-admin-tutorial-list',
    templateUrl: './admin-tutorial-list.component.html',
    styleUrls: ['./admin-tutorial-list.component.css']
})
export class AdminTutorialListComponent implements OnInit {
    sections: TutorialSection[] = [];
    loading = true;

    constructor(
        private tutorialService: TutorialService,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.loadSections();
    }

    loadSections() {
        this.loading = true;
        this.tutorialService.getSections().subscribe(
            data => {
                this.sections = data;
                this.loading = false;
            },
            error => {
                console.error('Error loading sections', error);
                this.loading = false;
            }
        );
    }

    editSection(id: string) {
        this.router.navigate(['/admin-tutorial/edit', id]);
    }

    deleteSection(id: string) {
        if (confirm('¿Estás seguro de que deseas eliminar esta sección?')) {
            this.tutorialService.deleteSection(id)
                .then(() => console.log('Sección eliminada'))
                .catch(err => console.error('Error al eliminar', err));
        }
    }

    createNew() {
        this.router.navigate(['/admin-tutorial/new']);
    }

    toggleActive(section: TutorialSection) {
        this.tutorialService.updateSection(section.id!, { active: !section.active });
    }

    moveUp(index: number) {
        if (index > 0) {
            this.swapOrder(index, index - 1);
        }
    }

    moveDown(index: number) {
        if (index < this.sections.length - 1) {
            this.swapOrder(index, index + 1);
        }
    }

    private swapOrder(index1: number, index2: number) {
        const sections = [...this.sections];
        const tempOrder = sections[index1].order;
        sections[index1].order = sections[index2].order;
        sections[index2].order = tempOrder;

        // Optimistic update
        const temp = sections[index1];
        sections[index1] = sections[index2];
        sections[index2] = temp;

        this.tutorialService.updateSectionsOrder(sections)
            .catch(err => console.error('Error updating order', err));
    }
}
