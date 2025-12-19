import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UsersService } from '../../../services/users/users.service';
import { StorageService } from '../../../services/storage/storage.service';
import { Users } from 'app/interfaces/users';
import { Vehicle } from 'app/interfaces/vehicle';
import { NgForm } from '@angular/forms';
import { takeUntil, take } from 'rxjs/operators';
import { Subject } from 'rxjs';
import Swal from 'sweetalert2';
declare var $: any;

/**
 * User Edit Component
 * Permite editar toda la información del usuario incluyendo documentos y metadatos
 */
@Component({
  selector: 'app-user-edit',
  templateUrl: './user-edit.component.html',
  styleUrls: ['./user-edit.component.css']
})
export class UserEditComponent implements OnInit, OnDestroy {

  // Data
  public user: Users = {};
  public userOriginal: Users = {}; // Backup para cancelar
  public arrayVehicles: Vehicle[] = [];
  public vehiclesOriginal: Vehicle[] = []; // Backup para cancelar
  public infoUser: Users; // Admin logueado

  // File handling
  public pendingFiles: Map<string, File> = new Map(); // key: documentType, value: File
  public previewUrls: Map<string, string> = new Map(); // key: documentType, value: dataURL
  public documentsToUnverify: Set<string> = new Set(); // documentTypes que se deben marcar como no verificados

  // UI state
  public isSaving: boolean = false;
  public isLoading: boolean = true;
  public userNotFound: boolean = false;
  public selectedVehicleIndex: number = 0;

  // License types
  public licenseTypes = ['A', 'B', 'C', 'D', 'E', 'F'];

  // Country codes
  public countryCodes = [
    { code: '+58', country: 'Venezuela' },
    { code: '+1', country: 'USA/Canadá' },
    { code: '+34', country: 'España' },
    { code: '+52', country: 'México' },
    { code: '+57', country: 'Colombia' }
  ];

  // Destroy subject
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private usersService: UsersService,
    private storageService: StorageService
  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem('infoUser'));

    // Get userId from route params and load user data
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const userId = params.get('userId');
      if (userId) {
        this.loadUserData(userId);
      } else {
        this.userNotFound = true;
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load user data from Firestore
   */
  private loadUserData(userId: string): void {
    this.isLoading = true;
    this.userNotFound = false;

    this.usersService.getUserByIdRealtime(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (user) => {
          if (user) {
            this.user = user;
            this.userOriginal = JSON.parse(JSON.stringify(user)); // Deep copy

            // Load vehicles if driver
            if (this.hasDriverProfile()) {
              this.loadVehicles(userId);
            } else {
              this.isLoading = false;
            }
          } else {
            this.userNotFound = true;
            this.isLoading = false;
          }
        },
        (error) => {
          console.error('Error loading user:', error);
          this.userNotFound = true;
          this.isLoading = false;
        }
      );
  }

  public vehiclesLoaded: boolean = false;

  /**
   * Load vehicles for driver
   */
  private loadVehicles(userId: string): void {
    if (this.vehiclesLoaded) return; // Prevent reload

    this.usersService.getVehiclesByUser(userId)
      .pipe(take(1))
      .subscribe(
        (vehicles: any) => {
          console.log('[DEBUG] Loaded vehicles:', JSON.stringify(vehicles, null, 2,));
          this.arrayVehicles = vehicles;
          this.vehiclesOriginal = JSON.parse(JSON.stringify(vehicles)); // Deep copy
          this.isLoading = false;
          this.vehiclesLoaded = true;
        },
        (error) => {
          console.error('Error loading vehicles:', error);
          this.isLoading = false;
        }
      );
  }

  /**
   * Check if user has driver profile
   */
  public hasDriverProfile(): boolean {
    return this.user.userRol === 9 || this.user.userDriverAccountIsVerify === true;
  }

  /**
   * Handle file selection for a document
   */
  public async handleFileChange(file: File, documentType: string): Promise<void> {
    // Validar archivo
    if (!this.validateFile(file)) {
      this.showNotification('top', 'right', 'nc-simple-remove',
        'Archivo inválido. Solo se permiten imágenes JPG/PNG menores a 5MB', 'danger');
      return;
    }

    // Verificar si está verificado
    const isVerified = this.isDocumentVerified(documentType);
    if (isVerified) {
      const result = await Swal.fire({
        title: 'Documento Verificado',
        text: 'Este documento está verificado. Al cambiar la imagen se marcará como no verificado. ¿Continuar?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, cambiar',
        cancelButtonText: 'Cancelar'
      });

      if (!result.isConfirmed) return;

      // Marcar para resetear verificación
      this.documentsToUnverify.add(documentType);
    }

    // Guardar archivo pendiente
    this.pendingFiles.set(documentType, file);

    // Generar preview
    this.generatePreview(file, documentType);
  }

  /**
   * Generate preview for image
   */
  private generatePreview(file: File, documentType: string): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.previewUrls.set(documentType, e.target.result as string);
    };
    reader.readAsDataURL(file);
  }

  /**
   * Validate file (type and size)
   */
  private validateFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
      return false;
    }

    if (file.size > maxSize) {
      return false;
    }

    return true;
  }

  /**
   * Check if document is verified
   */
  private isDocumentVerified(documentType: string): boolean {
    switch (documentType) {
      case 'dni': return this.user.userDniVerified;
      case 'licence': return this.user.userLicenceVerified;
      case 'userCarDoc': return this.user.userDocumentCarVerified;
      case `vehicleInsurance-${this.selectedVehicleIndex}`:
        return this.arrayVehicles[this.selectedVehicleIndex]?.vehicleSureVerified;
      case `vehicleRegistration-${this.selectedVehicleIndex}`:
        return this.arrayVehicles[this.selectedVehicleIndex]?.vehicleDocumentVerified;
      default: return false;
    }
  }

  /**
   * Get preview URL (new file or existing)
   */
  public getPreviewUrl(documentType: string, currentUrl: string): string {
    return this.previewUrls.get(documentType) || currentUrl || './assets/img/icons/gallery.png';
  }

  /**
   * Save all changes
   */
  public async saveChanges(isValid: boolean, form: NgForm): Promise<void> {
    if (!isValid) {
      this.showNotification('top', 'right', 'nc-alert-circle-i',
        'Por favor, completa todos los campos requeridos', 'warning');
      return;
    }

    // Confirmación
    const confirmResult = await Swal.fire({
      title: '¿Guardar cambios?',
      text: 'Se actualizará la información del usuario',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirmResult.isConfirmed) return;

    this.isSaving = true;

    // Loading
    Swal.fire({
      title: 'Guardando cambios',
      html: 'Por favor espera...',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      // 1. Upload new images
      await this.uploadPendingFiles();

      // 2. Reset verification for changed documents
      this.resetVerificationStatus();

      // 3. Add audit trail
      this.user.userLastUpdated = new Date().toISOString();
      this.user.userLastUpdatedBy = this.infoUser?.userEmail || 'Admin';

      // 4. Update user in Firestore
      await this.usersService.updateUser(this.user);

      // 5. Update vehicles (if any changed)
      console.log('[DEBUG] Step 5: Checking vehicle changes');
      if (this.hasVehicleChanges()) {
        console.log('[DEBUG] Vehicle changes detected, calling updateVehicles');
        await this.updateVehicles();
      } else {
        console.log('[DEBUG] No vehicle changes detected');
      }

      // Success
      Swal.close();
      this.showNotification('top', 'right', 'nc-check-2',
        'Cambios guardados correctamente', 'success');
      this.pendingFiles.clear(); // Clear pending files after success

      // Navigate back to detail
      this.router.navigate(['/users', this.user.userUid]);

    } catch (error) {
      console.error('Error saving changes:', error);
      Swal.close();
      this.showNotification('top', 'right', 'nc-simple-remove',
        'Error al guardar cambios: ' + error.message, 'danger');
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Upload all pending files to Firebase Storage
   */
  private async uploadPendingFiles(): Promise<void> {
    const uploadPromises: Promise<void>[] = [];

    this.pendingFiles.forEach((file, documentType) => {
      const promise = this.uploadDocument(documentType, file);
      uploadPromises.push(promise);
    });

    await Promise.all(uploadPromises);
  }

  /**
   * Upload single document
   */
  private async uploadDocument(documentType: string, file: File): Promise<void> {
    const timestamp = Date.now();
    const path = `users/${this.user.userUid}/documents/${documentType}-${timestamp}.png`;
    console.log(`Starting upload for ${documentType} to path: ${path}`);

    // Get old URL to delete later
    const oldUrl = this.getDocumentUrl(documentType);

    // Upload new file
    const downloadURL = await this.storageService.uploadFile(path, file);
    console.log(`Upload successful for ${documentType}. URL: ${downloadURL}`);

    // Update URL in user/vehicle object
    this.setDocumentUrl(documentType, downloadURL);

    // Delete old file if exists and is different
    // Excluir gallery.png (default) y profileImages (legacy/error source)
    if (oldUrl && oldUrl !== downloadURL && !oldUrl.includes('gallery.png') && !oldUrl.includes('profileImages')) {
      try {
        await this.storageService.deleteFileByURL(oldUrl);
      } catch (error) {
        console.warn('Could not delete old file:', oldUrl, error);
        // No bloqueamos el flujo si falla el borrado
      }
    }
  }

  /**
   * Get document URL based on type
   */
  private getDocumentUrl(documentType: string): string {
    if (documentType.startsWith('vehicleInsurance-')) {
      const index = parseInt(documentType.split('-')[1]);
      return this.arrayVehicles[index]?.vehicleDocumentCarSureURL;
    }
    if (documentType.startsWith('vehicleRegistration-')) {
      const index = parseInt(documentType.split('-')[1]);
      return this.arrayVehicles[index]?.vehicleDocumentCarURL;
    }

    switch (documentType) {
      case 'dni': return this.user.userDniURL;
      case 'licence': return this.user.userLicenceURL;
      case 'userCarDoc': return this.user.userDocumentCarURL;
      default: return null;
    }
  }

  /**
   * Set document URL based on type
   */
  private setDocumentUrl(documentType: string, url: string): void {
    console.log(`Setting document URL. Type: ${documentType}, URL: ${url}`);
    if (documentType.startsWith('vehicleInsurance-')) {
      const index = parseInt(documentType.split('-')[1]);
      this.arrayVehicles[index].vehicleDocumentCarSureURL = url;
      this.arrayVehicles[index].vehicleDocumentCarSureUploaded = true;
      console.log(`Updated vehicle ${index} insurance URL`);
      return;
    }
    if (documentType.startsWith('vehicleRegistration-')) {
      const index = parseInt(documentType.split('-')[1]);
      this.arrayVehicles[index].vehicleDocumentCarURL = url;
      this.arrayVehicles[index].vehicleDocumentUploaded = true;
      console.log(`Updated vehicle ${index} registration URL`);
      return;
    }

    switch (documentType) {
      case 'dni':
        this.user.userDniURL = url;
        this.user.userDniUploaded = true;
        break;
      case 'licence':
        this.user.userLicenceURL = url;
        this.user.userLicenseUploaded = true;
        break;
      case 'userCarDoc':
        this.user.userDocumentCarURL = url;
        this.user.userDocumentCarUploaded = true;
        break;
    }
  }

  /**
   * Reset verification status for changed documents
   */
  private resetVerificationStatus(): void {
    this.documentsToUnverify.forEach((documentType) => {
      if (documentType.startsWith('vehicleInsurance-')) {
        const index = parseInt(documentType.split('-')[1]);
        this.arrayVehicles[index].vehicleSureVerified = false;
        this.arrayVehicles[index].vehicleSureRejectionReason = null;
        return;
      }
      if (documentType.startsWith('vehicleRegistration-')) {
        const index = parseInt(documentType.split('-')[1]);
        this.arrayVehicles[index].vehicleDocumentVerified = false;
        this.arrayVehicles[index].vehicleDocumentRejectionReason = null;
        return;
      }

      switch (documentType) {
        case 'dni':
          this.user.userDniVerified = false;
          this.user.userDniRejectionReason = null;
          break;
        case 'licence':
          this.user.userLicenceVerified = false;
          this.user.userLicenceRejectionReason = null;
          break;
        case 'userCarDoc':
          this.user.userDocumentCarVerified = false;
          this.user.userDocumentCarRejectionReason = null;
          break;
      }
    });
  }

  /**
   * Update vehicles in Firestore
   */
  private async updateVehicles(): Promise<void> {
    const updatePromises: Promise<any>[] = [];

    for (let i = 0; i < this.arrayVehicles.length; i++) {
      const vehicle = this.arrayVehicles[i];
      const original = this.vehiclesOriginal[i];

      // Check if this vehicle has changes
      if (JSON.stringify(vehicle) !== JSON.stringify(original)) {
        if (!vehicle.vehicleId) {
          console.error('Cannot update vehicle without ID:', vehicle);
          continue;
        }
        console.log('Updating vehicle:', vehicle.vehicleId);
        console.log('Vehicle data being sent:', JSON.stringify(vehicle, null, 2));
        const promise = this.usersService.updateVehicleState(this.user.userUid || '', vehicle);
        updatePromises.push(promise);
      }
    }

    await Promise.all(updatePromises);
  }

  /**
   * Check if any vehicle has changes
   */
  private hasVehicleChanges(): boolean {
    for (let i = 0; i < this.arrayVehicles.length; i++) {
      const current = JSON.stringify(this.arrayVehicles[i]);
      const original = JSON.stringify(this.vehiclesOriginal[i]);
      if (current !== original) {
        console.log(`[DEBUG] Change detected in vehicle ${i}`);
        console.log('Original:', original);
        console.log('Current:', current);
        return true;
      }
    }
    return false;
  }

  /**
   * Cancel edit and go back
   */
  public async cancelEdit(): Promise<void> {
    const result = await Swal.fire({
      title: '¿Descartar cambios?',
      text: 'Se perderán todos los cambios no guardados',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#6c757d',
      cancelButtonColor: '#10b981',
      confirmButtonText: 'Sí, descartar',
      cancelButtonText: 'Seguir editando'
    });

    if (result.isConfirmed) {
      this.router.navigate(['/users', this.user.userUid]);
    }
  }

  /**
   * Navigate back to users list
   */
  public navigateBack(): void {
    this.router.navigate(['/users']);
  }

  /**
   * Select vehicle by index
   */
  public selectVehicle(index: number): void {
    this.selectedVehicleIndex = index;
  }

  /**
   * Eliminar vehículo con confirmación
   */
  public async deleteVehicle(index: number): Promise<void> {
    const vehicle = this.arrayVehicles[index];

    if (!vehicle || !vehicle.vehicleId) {
      this.showNotification('top', 'right', 'nc-simple-remove', 'Error: No se puede identificar el vehículo', 'danger');
      return;
    }

    const confirmResult = await Swal.fire({
      title: '¿Eliminar vehículo?',
      html: `
        <div class="text-left">
          <p>Estás a punto de eliminar permanentemente este vehículo:</p>
          <ul>
            <li><strong>Marca:</strong> ${vehicle.vehicleBrandName}</li>
            <li><strong>Modelo:</strong> ${vehicle.vehicleModelName}</li>
            <li><strong>Año:</strong> ${vehicle.vehicleYearName || vehicle.vehicleYear}</li>
            <li><strong>Placa:</strong> ${vehicle.vehiclePlateNumber}</li>
          </ul>
          <p class="text-danger font-weight-bold">Esta acción no se puede deshacer.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirmResult.isConfirmed) return;

    Swal.fire({
      title: 'Eliminando...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      await this.usersService.deleteVehicle(vehicle.vehicleId);

      this.arrayVehicles.splice(index, 1);
      this.vehiclesOriginal.splice(index, 1); // Update backup too

      // Adjust selected index if needed
      if (this.selectedVehicleIndex >= this.arrayVehicles.length) {
        this.selectedVehicleIndex = Math.max(0, this.arrayVehicles.length - 1);
      }

      Swal.close();
      this.showNotification('top', 'right', 'nc-check-2', 'Vehículo eliminado correctamente', 'success');

    } catch (error) {
      console.error('Error deleting vehicle:', error);
      Swal.close();
      this.showNotification('top', 'right', 'nc-simple-remove', 'Error al eliminar vehículo', 'danger');
    }
  }

  /**
   * Show notification
   */
  private showNotification(from: string, align: string, icon: string, message: string, type: string): void {
    $.notify({
      icon: icon,
      message: message,
    }, {
      type: type,
      timer: 4000,
      placement: { from: from, align: align },
      template: '<div data-notify="container" class="col-11 col-md-4 alert alert-{0} alert-with-icon" role="alert"><button mat-button type="button" aria-hidden="true" class="close mat-button" data-notify="dismiss"><i class="material-icons">close</i></button><i class="material-icons" data-notify="icon">' + icon + '</i> <span data-notify="title">{1}</span> <span data-notify="message">{2}</span><div class="progress" data-notify="progressbar"><div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div></div><a href="{3}" target="{4}" data-notify="url"></a></div>'
    });
  }
}
