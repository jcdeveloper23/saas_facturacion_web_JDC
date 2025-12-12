import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TutorialService } from '../../../services/tutorial/tutorial.service';
import { StorageService } from '../../../services/storage/storage.service';
import { TutorialSection, TutorialSubSection, Quiz } from '../../../interfaces/tutorial';


@Component({
    selector: 'app-admin-tutorial-editor',
    templateUrl: './admin-tutorial-editor.component.html',
    styleUrls: ['./admin-tutorial-editor.component.css']
})
export class AdminTutorialEditorComponent implements OnInit {


    section: TutorialSection = {
        title: '',
        icon: 'info-circle',
        locked: true,
        active: true,
        order: 0,
        subsections: [],
        quiz: {
            question: '',
            options: ['', '', '', ''],
            correctAnswerIndex: 0
        }
    };

    isNew = true;
    loading = false;
    uploadingImage = false;

    // Store pending images to upload on save: { tempUrl: string, file: File }
    pendingImages: { tempUrl: string, file: File }[] = [];



    public iconOptions = [
        { value: 'info-circle', label: 'Información General' },
        { value: 'car', label: 'Vehículos / Gestión' },
        { value: 'route', label: 'Viajes / Rutas' },
        { value: 'money-bill-wave', label: 'Ganancias' },
        { value: 'wallet', label: 'Billetera Digital' },
        { value: 'user', label: 'Pasajero / Perfil' },
        { value: 'history', label: 'Historial' },
        { value: 'map-marker-alt', label: 'Ubicación (GPS)' },
        { value: 'camera', label: 'Cámara / Fotos' },
        { value: 'bell', label: 'Notificaciones' },
        { value: 'folder-open', label: 'Documentos / Almacenamiento' },
        { value: 'list-ul', label: 'Pasos / Lista' },
        { value: 'id-card', label: 'Identificación' },
        { value: 'download', label: 'Descarga / Obtener App' },
        { value: 'search', label: 'Búsqueda' },
        { value: 'sign-in-alt', label: 'Inicio de Sesión / Login' },
        { value: 'door-open', label: 'Bienvenida' },
        { value: 'list-ol', label: 'Pasos Numerados' },
        { value: 'check-circle', label: 'Completado / Éxito' },
        { value: 'question-circle', label: 'Ayuda / Preguntas' }
    ];

    constructor(
        private tutorialService: TutorialService,
        private storageService: StorageService,
        private route: ActivatedRoute,
        private router: Router
    ) { }

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.isNew = false;
            this.loading = true;
            this.tutorialService.getSection(id).subscribe(
                data => {
                    if (data) {
                        this.section = { id, ...data };
                        if (!this.section.quiz) {
                            this.section.quiz = {
                                question: '',
                                options: ['', '', '', ''],
                                correctAnswerIndex: 0
                            };
                        }
                        if (!this.section.subsections) {
                            this.section.subsections = [];
                        }
                    }
                    this.loading = false;
                },
                error => {
                    console.error('Error loading section', error);
                    this.loading = false;
                }
            );
        } else {
            this.section.order = 99;
        }
    }

    async saveSection() {
        this.loading = true;

        // Process pending images before saving
        if (this.pendingImages.length > 0) {
            try {
                await this.uploadPendingImages();
            } catch (error) {
                console.error('Error uploading images', error);
                alert('Error al subir las imágenes pendientes. Intenta de nuevo.');
                this.loading = false;
                return;
            }
        }

        const promise = this.isNew
            ? this.tutorialService.createSection(this.section)
            : this.tutorialService.updateSection(this.section.id!, this.section);

        promise.then(() => {
            console.log('Section saved');
            this.pendingImages = []; // Clear pending images
            this.router.navigate(['/admin-tutorial']);
        }).catch(err => {
            console.error('Error saving section', err);
            this.loading = false;
            alert('Error al guardar la sección: ' + err.message);
        });
    }

    async uploadPendingImages() {
        // Loop through subsections and replace temp URLs with real Storage URLs
        for (const imgData of this.pendingImages) {
            const path = `tutorial_images/${Date.now()}_${imgData.file.name}`;
            const url = await this.storageService.uploadFile(path, imgData.file);

            // Find where this tempURL is used and replace it
            if (this.section.subsections) {
                this.section.subsections.forEach(sub => {
                    if (sub.content && sub.content.includes(imgData.tempUrl)) {
                        // Create the final HTML structure using the real URL
                        // Note: The tempUrl was inserted into a src attribute or similar
                        sub.content = sub.content.split(imgData.tempUrl).join(url);
                    }
                });
            }
        }
    }

    addSubsection() {
        this.section.subsections!.push({
            id: 'sub-' + Date.now(),
            title: 'Nuevo Subtítulo',
            content: ''
        });
    }

    removeSubsection(index: number) {
        this.section.subsections!.splice(index, 1);
    }



    uploadImageForSubsection(event: any, subsectionIndex: number) {
        const file = event.target.files[0];
        if (!file) return;

        // Create a local blob URL for preview
        const tempUrl = URL.createObjectURL(file);

        // Add to pending images
        this.pendingImages.push({ tempUrl, file });

        // Insert image placeholder with temp URL into the content
        // We add a class or style to make it look decent
        const imgTag = `<p><img src="${tempUrl}" class="img-fluid rounded border-theme shadow-sm" alt="Tutorial Image" style="max-width: 100%;"></p>`;

        // Append to content (or insert at cursor if we tracked it, but appending is safer for now)
        const currentContent = this.section.subsections![subsectionIndex].content || '';
        this.section.subsections![subsectionIndex].content = currentContent + `\n${imgTag}`;
    }

    trackByIndex(index: number, obj: any): any {
        return index;
    }
}
