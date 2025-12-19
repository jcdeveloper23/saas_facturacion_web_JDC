import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UsersService } from '../../../services/users/users.service';
import { UserStateService } from '../../../services/users/user-state.service';
import { Users } from 'app/interfaces/users';
import { Vehicle } from 'app/interfaces/vehicle';
import { take, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import Swal from 'sweetalert2';
declare var $: any;

/**
 * User Detail Component - Replaces modal with routed component
 * Displays complete user profile with documents, vehicles, and commission management
 */
@Component({
  selector: 'app-user-detail',
  templateUrl: './user-detail.component.html',
  styleUrls: ['./user-detail.component.css']
})
export class UserDetailComponent implements OnInit, OnDestroy {

  // User data
  public user: Users = {};
  public userBackup: Users = {}; // For cancel operation
  public infoUser: Users; // Logged in admin user

  // Vehicles
  public arrayVehicles: Vehicle[] = [];
  public vehicleSelected: Vehicle;
  public selectedVehicleIndex: number = 0;

  // Documents
  public documentsList: any[] = [];
  public personalDocumentsList: any[] = [];

  // Lightbox
  public isLightboxOpen: boolean = false;
  public lightboxImage: string = '';
  public currentDocument: any = null;

  // Edit mode per section
  public editMode = {
    basicInfo: false,
    contact: false,
    address: false
  };

  // Loading state
  public isLoading: boolean = true;
  public userNotFound: boolean = false;

  // User types for display
  public userTypes = [
    { value: 'all', label: 'Todos', icon: 'nc-circle-10' },
    { value: 'client', label: 'Clientes', icon: 'nc-single-02', color: '#3b82f6' },
    { value: 'driver', label: 'Conductores', icon: 'nc-bus-front-12', color: '#f59e0b' }
  ];

  // Destroy subject for unsubscribing
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private usersService: UsersService,
    private userStateService: UserStateService
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
            this.isLoading = false;

            // Load vehicles if user has driver profile
            if (this.hasDriverProfile(user)) {
              this.loadUserVehicles(user.userUid);
              this.updateDocumentsList();
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

  /**
   * Load user vehicles
   */
  private loadUserVehicles(userUid: string): void {
    this.usersService.getVehiclesByUser(userUid).pipe(take(1)).subscribe((vehicles) => {
      this.arrayVehicles = vehicles;
      if (vehicles.length > 0) {
        this.selectVehicle(vehicles[0], 0);
      }
    });
  }

  /**
   * Navigate back to users list
   */
  public navigateBack(): void {
    this.router.navigate(['/users']);
  }

  /**
   * Get user type info
   */
  public getUserType(user: Users): any {
    if (user.userRol == undefined) user.userRol = 1;

    if (user.userRol === 9) {
      return this.userTypes[2]; // Driver
    } else if (user.userRol === 1) {
      return this.userTypes[1]; // Client
    }

    return this.userTypes[0]; // Default
  }

  /**
   * Check if user has driver profile
   */
  public hasDriverProfile(user: Users): boolean {
    return user.userRol === 9 ||
      user.userDniUploaded === true ||
      user.userLicenseUploaded === true ||
      user.userDocumentCarUploaded === true;
  }

  /**
   * Check if user has client profile
   */
  public hasClientProfile(user: Users): boolean {
    return user.userRol === 1 || !this.hasDriverProfile(user);
  }

  /**
   * Select vehicle
   */
  public selectVehicle(vehicle: Vehicle, index: number): void {
    this.vehicleSelected = vehicle;
    this.selectedVehicleIndex = index;
    this.updateDocumentsList();
  }

  /**
   * Update documents list based on user and vehicle selection
   */
  public updateDocumentsList(): void {
    if (!this.user) return;

    // Personal Documents (DNI)
    const personalDocs = [];
    personalDocs.push({
      label: 'DNI (Identidad)',
      url: this.user.userDniURL,
      type: 'dni',
      verified: this.user.userDniVerified,
      uploaded: this.user.userDniUploaded,
      description: 'Documento Nacional de Identidad'
    });
    this.personalDocumentsList = personalDocs;

    // Driver Documents
    const driverDocs = [];

    // License
    driverDocs.push({
      label: 'Licencia de Conducir',
      url: this.user.userLicenceURL,
      type: 'license',
      verified: this.user.userLicenceVerified,
      uploaded: this.user.userLicenseUploaded,
      description: 'Licencia de conducir'
    });

    // User Car Document (if exists)
    if (this.user.userDocumentCarURL) {
      driverDocs.push({
        label: 'Documentos del Vehículo (Usuario)',
        url: this.user.userDocumentCarURL,
        type: 'userCarDocument',
        verified: this.user.userDocumentCarVerified,
        uploaded: this.user.userDocumentCarUploaded,
        description: 'Documento del vehículo del usuario'
      });
    }

    // Vehicle documents (if vehicle selected)
    if (this.vehicleSelected && this.vehicleSelected.vehicleId) {
      driverDocs.push({
        label: 'Seguro del Vehículo',
        url: this.vehicleSelected.vehicleDocumentCarSureURL,
        type: 'insurance',
        verified: this.vehicleSelected.vehicleSureVerified,
        uploaded: this.vehicleSelected.vehicleDocumentCarSureUploaded,
        description: 'Póliza de seguro del vehículo'
      });

      driverDocs.push({
        label: 'Matrícula del Vehículo',
        url: this.vehicleSelected.vehicleDocumentCarURL,
        type: 'registration',
        verified: this.vehicleSelected.vehicleDocumentVerified,
        uploaded: this.vehicleSelected.vehicleDocumentUploaded,
        description: 'Matrícula del vehículo'
      });
    }

    this.documentsList = driverDocs;
  }

  /**
   * Open document lightbox
   */
  public openDocumentLightbox(doc: any): void {
    if (!doc.url) return;

    this.lightboxImage = doc.url;
    this.currentDocument = doc;
    this.isLightboxOpen = true;
  }

  /**
   * Open image lightbox for viewing (profile picture)
   */
  public openImageLightbox(imageUrl: string, title: string = 'Imagen'): void {
    if (!imageUrl) return;

    this.lightboxImage = imageUrl;
    this.currentDocument = {
      label: title,
      url: imageUrl,
      uploaded: true,
      verified: false
    };
    this.isLightboxOpen = true;
  }

  /**
   * Close lightbox
   */
  public closeLightbox(): void {
    this.isLightboxOpen = false;
    this.lightboxImage = '';
    this.currentDocument = null;
  }

  /**
   * Verify document (called from lightbox)
   */
  public async verifyDocument(): Promise<void> {
    if (!this.currentDocument || !this.user) return;

    // Guardar referencia local del documento ANTES de cerrar lightbox
    const docToVerify = { ...this.currentDocument };
    const docLabel = docToVerify.label;
    const docType = docToVerify.type;

    // Cerrar el lightbox PRIMERO para que SweetAlert aparezca encima
    this.closeLightbox();

    // Pequeño delay para que la animación del lightbox se complete
    await new Promise(resolve => setTimeout(resolve, 100));

    const result = await Swal.fire({
      title: '¿Verificar documento?',
      text: `Se marcará el ${docLabel} como verificado`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, verificar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const updateData: any = {};

        switch (docType) {
          case 'dni':
            updateData.userDniVerified = true;
            updateData.userDniRejectionReason = null;
            break;
          case 'license':
            updateData.userLicenceVerified = true;
            updateData.userLicenceRejectionReason = null;
            break;
          case 'userCarDocument':
            updateData.userDocumentCarVerified = true;
            updateData.userDocumentCarRejectionReason = null;
            break;
          case 'insurance':
            this.vehicleSelected.vehicleSureVerified = true;
            this.vehicleSelected.vehicleSureRejectionReason = null;
            await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
            this.showNotification('Documento verificado correctamente', 'success');
            this.updateDocumentsList();
            return;
          case 'registration':
            this.vehicleSelected.vehicleDocumentVerified = true;
            this.vehicleSelected.vehicleDocumentRejectionReason = null;
            await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
            this.showNotification('Documento verificado correctamente', 'success');
            this.updateDocumentsList();
            return;
        }

        if (Object.keys(updateData).length > 0) {
          await this.usersService.updateUser({ ...this.user, ...updateData });
          Object.assign(this.user, updateData);
          this.showNotification('Documento verificado correctamente', 'success');
          this.updateDocumentsList();
        }
      } catch (error) {
        console.error('Error verifying document:', error);
        this.showNotification('Error al verificar documento', 'danger');
      }
    }
  }

  /**
   * Reject document (called from lightbox)
   */
  public async rejectDocument(reason: string): Promise<void> {
    if (!this.currentDocument || !this.user || !reason) return;

    // Guardar referencia local del documento ANTES de cerrar lightbox
    const docToReject = { ...this.currentDocument };
    const docType = docToReject.type;

    // Cerrar el lightbox para evitar problemas de z-index
    this.closeLightbox();

    try {
      const updateData: any = {};

      switch (docType) {
        case 'dni':
          updateData.userDniVerified = false;
          updateData.userDniRejectionReason = reason;
          break;
        case 'license':
          updateData.userLicenceVerified = false;
          updateData.userLicenceRejectionReason = reason;
          break;
        case 'userCarDocument':
          updateData.userDocumentCarVerified = false;
          updateData.userDocumentCarRejectionReason = reason;
          break;
        case 'insurance':
          this.vehicleSelected.vehicleSureVerified = false;
          this.vehicleSelected.vehicleSureRejectionReason = reason;
          await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
          this.showNotification('Documento rechazado', 'info');
          this.updateDocumentsList();
          return;
        case 'registration':
          this.vehicleSelected.vehicleDocumentVerified = false;
          this.vehicleSelected.vehicleDocumentRejectionReason = reason;
          await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
          this.showNotification('Documento rechazado', 'info');
          this.updateDocumentsList();
          return;
      }

      if (Object.keys(updateData).length > 0) {
        await this.usersService.updateUser({ ...this.user, ...updateData });
        Object.assign(this.user, updateData);
        this.showNotification(`Documento rechazado: ${reason}`, 'info');
        this.updateDocumentsList();
      }
    } catch (error) {
      console.error('Error rejecting document:', error);
      this.showNotification('Error al rechazar documento', 'danger');
    }
  }

  /**
   * Toggle account verification status
   */
  public async toggleAccountVerification(type: 'client' | 'driver', event: any): Promise<void> {
    if (!this.user) return;

    const isChecked = event.target.checked;
    const updateData: any = {};

    if (type === 'client') {
      updateData.userClientAccountIsVerify = isChecked;
      this.user.userClientAccountIsVerify = isChecked;
    } else {
      updateData.userDriverAccountIsVerify = isChecked;
      this.user.userDriverAccountIsVerify = isChecked;
    }

    try {
      await this.usersService.updateUser({ ...this.user, ...updateData });
      const role = type === 'client' ? 'Cliente' : 'Conductor';
      const status = isChecked ? 'verificada' : 'desverificada';
      this.showNotification(`Cuenta de ${role} ${status}`, 'success');
    } catch (error) {
      console.error(error);
      this.showNotification('Error al actualizar estado', 'danger');
      // Revert change
      if (type === 'client') {
        this.user.userClientAccountIsVerify = !isChecked;
      } else {
        this.user.userDriverAccountIsVerify = !isChecked;
      }
    }
  }

  /**
   * Toggle admin verification
   */
  public async toggleAdminVerification(event?: any): Promise<void> {
    if (!this.user) return;

    const newState = !this.user.userAdminDocumentVerified;
    const action = newState ? 'validar' : 'invalidar';

    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} documentación?`,
      text: `Se marcará la documentación de ${this.user.userName} como ${newState ? 'VALIDADA' : 'PENDIENTE'} por administración.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: newState ? '#10b981' : '#f59e0b',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const updateData: any = {
          userAdminDocumentVerified: newState,
          userAdminDocumentVerifiedDate: new Date().toISOString(),
          userAdminDocumentVerifiedBy: this.infoUser.userEmail
        };

        await this.usersService.updateUser({ ...this.user, ...updateData });

        // Update local state
        this.user.userAdminDocumentVerified = newState;
        this.user.userAdminDocumentVerifiedDate = updateData.userAdminDocumentVerifiedDate;

        this.showNotification(`Documentación ${newState ? 'validada' : 'pendiente'} correctamente`, 'success');
      } catch (error) {
        console.error(error);
        if (event) event.target.checked = !newState;
        this.showNotification('Error al actualizar estado', 'danger');
      }
    } else {
      if (event) event.target.checked = !newState;
    }
  }

  /**
   * Toggle vehicle state
   */
  public async toggleVehicleState(vehicle: Vehicle): Promise<void> {
    if (!vehicle || !this.user) return;

    const newState = !vehicle.vehicleState;

    // Validation: Cannot activate if documents are not verified
    if (newState === true) {
      const isVehicleDocsVerified = vehicle.vehicleDocumentVerified && vehicle.vehicleSureVerified;
      const isLicenceVerified = this.user.userLicenceVerified;

      if (!isVehicleDocsVerified || !isLicenceVerified) {
        let errorMsg = 'No se puede activar: ';
        if (!isLicenceVerified) errorMsg += 'Licencia de Conducir ';
        if (!isVehicleDocsVerified) errorMsg += (isLicenceVerified ? '' : 'y ') + 'Documentos del vehículo (Matrícula/Seguro) ';
        errorMsg += 'no verificado(s).';

        Swal.fire({
          title: 'No se puede activar',
          text: errorMsg,
          icon: 'warning',
          confirmButtonColor: '#fbc658',
          confirmButtonText: 'Entendido'
        });
        setTimeout(() => vehicle.vehicleState = false, 0);
        return;
      }
    }

    const action = newState ? 'activar' : 'desactivar';
    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} vehículo?`,
      text: `Se ${action}á el vehículo ${vehicle.vehicleBrandName} ${vehicle.vehicleModelName} - ${vehicle.vehiclePlateNumber}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: newState ? '#10b981' : '#ef4444',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        vehicle.vehicleState = newState;
        if (newState) {
          vehicle.vehicleInReview = false;
        }

        await this.usersService.updateVehicleState(this.user.userUid, vehicle);
        this.showNotification(`Vehículo ${action}do correctamente`, 'success');
      } catch (error) {
        console.error(error);
        this.showNotification('Error al actualizar vehículo', 'danger');
        vehicle.vehicleState = !newState;
      }
    }
  }

  /**
   * Handle commission save from commission editor
   */
  public async onCommissionSave(event: any): Promise<void> {
    const { user, rate, reason } = event;

    try {
      const previousRate = this.getUserCommissionRate(user);
      const currentDate = new Date();

      const historyEntry = {
        date: currentDate.toISOString().split('T')[0],
        time: currentDate.toTimeString().split(' ')[0],
        previousRate: previousRate,
        newRate: rate,
        updatedBy: this.infoUser?.userEmail || 'Admin',
        reason: reason
      };

      const updatedUser: Users = {
        ...this.user,
        userCommissionRate: rate,
        userCommissionType: 'percentage' as const,
        userCommissionCustomEnabled: rate !== 20,
        userCommissionLastUpdate: currentDate.toISOString(),
        userCommissionUpdatedBy: this.infoUser?.userEmail || 'Admin',
        userCommissionHistory: [
          historyEntry,
          ...(this.user.userCommissionHistory || [])
        ].slice(0, 50)
      };

      await this.usersService.updateUser(updatedUser);
      this.user = updatedUser;

      this.showNotification(`Comisión actualizada correctamente a ${rate}%`, 'success');
    } catch (error) {
      console.error('Error updating commission:', error);
      this.showNotification('Error al actualizar la comisión', 'danger');
    }
  }

  /**
   * Get user commission rate
   */
  public getUserCommissionRate(user: Users): number {
    if (!user) return 20;

    if (user.userCommissionCustomEnabled && user.userCommissionRate !== undefined) {
      return user.userCommissionRate;
    }

    if (user.userCommissionRate !== undefined) {
      return user.userCommissionRate;
    }

    return 20;
  }

  /**
   * Edit section
   */
  public editSection(section: string): void {
    this.userBackup = { ...this.user };
    this.editMode[section] = true;
  }

  /**
   * Save section
   */
  public async saveSection(section: string): Promise<void> {
    try {
      await this.usersService.updateUser(this.user);
      this.editMode[section] = false;
      this.showNotification('Cambios guardados correctamente', 'success');
    } catch (error) {
      console.error('Error saving section:', error);
      this.user = { ...this.userBackup };
      this.showNotification('Error al guardar cambios', 'danger');
    }
  }

  /**
   * Cancel section edit
   */
  public cancelSection(section: string): void {
    this.user = { ...this.userBackup };
    this.editMode[section] = false;
  }

  /**
   * Show notification
   */
  public showNotification(message: string, type: string): void {
    $.notify({
      icon: type === 'success' ? 'nc-check-2' : type === 'danger' ? 'nc-simple-remove' : 'nc-alert-circle-i',
      message: message,
    }, {
      type: type,
      timer: 4000,
      placement: {
        from: 'top',
        align: 'right'
      },
      template: '<div data-notify="container" class="col-11 col-md-4 alert alert-{0} alert-with-icon" role="alert"><button type="button" aria-hidden="true" class="close" data-notify="dismiss"><i class="nc-icon nc-simple-remove"></i></button><span data-notify="icon" class="nc-icon"></span> <span data-notify="title">{1}</span> <span data-notify="message">{2}</span><div class="progress" data-notify="progressbar"><div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div></div><a href="{3}" target="{4}" data-notify="url"></a></div>'
    });
  }
}
