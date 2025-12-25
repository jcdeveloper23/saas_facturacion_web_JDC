import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SelectionModel } from '@angular/cdk/collections';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { UsersService } from 'app/services/users/users.service';
import { NotificationService } from 'app/services/notifications/notification.service';
import { Users } from 'app/interfaces/users';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-notifications',
    templateUrl: './notifications.component.html',
    styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {

    public notificationForm: FormGroup;
    public currentStep: number = 1; // 1: Content, 2: Audience, 3: Review

    // Audience handling
    public targetType: 'individual' | 'group' = 'group';
    public userList: Users[] = [];
    public dataSource = new MatTableDataSource<Users>([]);
    public selection = new SelectionModel<Users>(true, []);
    public displayedColumns: string[] = ['select', 'avatar', 'name', 'userType', 'phone'];

    // Image handling
    public selectedFile: File = null;
    public imagePreview: string | ArrayBuffer = null;
    public isUploading = false;
    public existingImageUrl: string = '';

    // Templates
    public templates: any[] = [];
    public showTemplates = false;

    public loading = false;

    // Campaign Report
    public campaignReport: {
        success: number;
        failed: number;
        details: any[];
    } = { success: 0, failed: 0, details: [] };

    @ViewChild(MatPaginator) paginator: MatPaginator;
    @ViewChild(MatSort) sort: MatSort;
    @ViewChild('fileInput') fileInput: ElementRef;

    constructor(
        private fb: FormBuilder,
        private usersService: UsersService,
        private notificationService: NotificationService
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        this.loadUsers();
        this.loadTemplates();
    }

    private initForm() {
        this.notificationForm = this.fb.group({
            title: ['', [Validators.required, Validators.maxLength(50)]],
            body: ['', [Validators.required, Validators.maxLength(200)]],
            role: [9], // Default to Drivers
            image: [''],
            data: ['']
        });
    }

    private loadUsers() {
        this.usersService.getAllUsers().subscribe((users: Users[]) => {
            this.userList = users;
            this.dataSource.data = users;
            setTimeout(() => {
                this.dataSource.paginator = this.paginator;
                this.dataSource.sort = this.sort;
            });
        });
    }

    private loadTemplates() {
        this.notificationService.getTemplates().subscribe((templates: any[]) => {
            this.templates = templates;
        });
    }

    // Workflow Methods
    public goToStep(step: number) {
        if (step > this.currentStep && this.currentStep < 4) {
            if (this.currentStep === 1 && this.notificationForm.invalid) {
                Swal.fire('Atención', 'Por favor completa el título y mensaje de la notificación.', 'warning');
                return;
            }
            if (this.currentStep === 2 && this.targetType === 'individual' && this.selection.selected.length === 0) {
                Swal.fire('Atención', 'No has seleccionado ningún destinatario.', 'warning');
                return;
            }
        }
        this.currentStep = step;
    }

    // Audience Filtering
    public applyFilter(event: Event) {
        const filterValue = (event.target as HTMLInputElement).value;
        this.dataSource.filter = filterValue.trim().toLowerCase();
    }

    isAllSelected() {
        const numSelected = this.selection.selected.length;
        const numRows = this.dataSource.data.length;
        return numSelected === numRows;
    }

    masterToggle() {
        this.isAllSelected() ?
            this.selection.clear() :
            this.dataSource.data.forEach(row => this.selection.select(row));
    }

    // Image Methods
    public onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                Swal.fire('Imagen muy pesada', 'La imagen no debe superar los 2MB para un envío óptimo.', 'warning');
                return;
            }
            this.selectedFile = file;
            this.existingImageUrl = '';
            const reader = new FileReader();
            reader.onload = () => {
                this.imagePreview = reader.result;
            };
            reader.readAsDataURL(file);
        }
    }

    public removeImage() {
        this.selectedFile = null;
        this.imagePreview = null;
        this.existingImageUrl = '';
        this.notificationForm.patchValue({ image: '' });
        if (this.fileInput) {
            this.fileInput.nativeElement.value = '';
        }
    }

    // Template Methods
    public saveAsTemplate() {
        if (this.notificationForm.invalid) {
            Swal.fire('Error', 'Complete el título y mensaje primero', 'warning');
            return;
        }

        Swal.fire({
            title: 'Nombre de la plantilla',
            input: 'text',
            inputPlaceholder: 'Ej: Promo Fin de Semana',
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                const template = {
                    name: result.value,
                    title: this.notificationForm.value.title,
                    body: this.notificationForm.value.body,
                    image: this.existingImageUrl || '',
                    createdAt: new Date()
                };

                this.notificationService.saveTemplate(template).then(() => {
                    Swal.fire('Guardado', 'Plantilla guardada correctamente', 'success');
                });
            }
        });
    }

    public useTemplate(template: any) {
        this.notificationForm.patchValue({
            title: template.title,
            body: template.body
        });

        if (template.image) {
            this.existingImageUrl = template.image;
            this.imagePreview = template.image;
            this.selectedFile = null;
        } else {
            this.removeImage();
        }

        this.showTemplates = false;
        this.currentStep = 1;
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'Plantilla cargada',
            showConfirmButton: false,
            timer: 2000
        });
    }

    public deleteTemplate(id: string, event: Event) {
        event.stopPropagation();
        Swal.fire({
            title: '¿Eliminar plantilla?',
            text: 'Esta acción no se puede deshacer',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonColor: '#F93C65'
        }).then((result) => {
            if (result.isConfirmed) {
                this.notificationService.deleteTemplate(id);
            }
        });
    }

    // Final Action
    public async sendNotification() {
        const { title, body, role } = this.notificationForm.value;
        this.loading = true;
        this.campaignReport = { success: 0, failed: 0, details: [] };

        try {
            let imageUrl = this.existingImageUrl;
            if (this.selectedFile) {
                this.isUploading = true;
                imageUrl = await this.notificationService.uploadNotificationImage(this.selectedFile);
                this.isUploading = false;
            }

            if (this.targetType === 'group') {
                const response: any = await this.notificationService.sendNotificationToRole(Number(role), title, body, imageUrl).toPromise();

                // Parse group response (Cloud function sendEachForMulticast returns success/failure counts)
                if (response.results) {
                    response.results.forEach((r: any) => {
                        this.campaignReport.success += r.successCount;
                        this.campaignReport.failed += r.failureCount;
                    });
                } else {
                    this.campaignReport.success = response.totalWithTokens || 0;
                }

                this.campaignReport.details.push({
                    name: this.targetType === 'group' ? (role == 9 ? 'Todos los Conductores' : 'Todos los Clientes') : 'Grupo',
                    status: this.campaignReport.failed === 0 ? 'success' : 'warning',
                    message: `Enviados: ${this.campaignReport.success}, Fallidos: ${this.campaignReport.failed}`
                });

            } else {
                // Individual sends with tracking
                const recipients = this.selection.selected;
                for (const user of recipients) {
                    try {
                        await this.notificationService.sendNotificationToUser(user.userUid, title, body, imageUrl).toPromise();
                        this.campaignReport.success++;
                        this.campaignReport.details.push({
                            name: user.userName,
                            avatar: user.userPhotoURL,
                            status: 'success',
                            message: 'Enviado correctamente'
                        });
                    } catch (error) {
                        this.campaignReport.failed++;
                        this.campaignReport.details.push({
                            name: user.userName,
                            avatar: user.userPhotoURL,
                            status: 'error',
                            message: error.error?.message || 'Error desconocido'
                        });
                    }
                }
            }

            this.currentStep = 4; // Move to Report Step
            this.selection.clear();
        } catch (error) {
            console.error(error);
            Swal.fire('Error Crítico', 'No se pudo procesar la campaña. Intenta de nuevo.', 'error');
        } finally {
            this.loading = false;
            this.isUploading = false;
        }
    }

    public finishCampaign() {
        this.resetForm();
    }

    private resetForm() {
        this.notificationForm.reset({ role: 9 });
        this.removeImage();
        this.selection.clear();
        this.currentStep = 1;
        this.campaignReport = { success: 0, failed: 0, details: [] };
    }
}
