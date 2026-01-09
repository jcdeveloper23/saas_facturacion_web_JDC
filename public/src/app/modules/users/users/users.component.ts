import { Component, OnInit, ViewChild } from '@angular/core';
import { FormControl, NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { Users } from 'app/interfaces/users';
import { UsersService } from "../../../services/users/users.service";
import { Vehicle } from 'app/interfaces/vehicle';
import Swal from 'sweetalert2';
declare var $: any;

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css']
})
export class UsersComponent implements OnInit {

  // Form and validation
  public isValidForm = false;
  public isEdit = false;
  public isEditVehicle = false;

  // User data
  public user: Users = {};
  public array_user: Array<Users> = [];
  public filteredUsers: Array<Users> = [];
  public infoUser: Users;

  public vehicleSelected: Vehicle;
  public arrayVehicles: Vehicle[] = [];
  public documentsList: any[] = [];
  public personalDocumentsList: any[] = []; // DNI only
  public selectedVehicleIndex: number = 0;

  // Tables
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('tableUsers') paginator: MatPaginator;
  public dataSource: MatTableDataSource<Users>;
  public displayedColumns: string[] = [
    'avatar',
    'identification',
    'name',
    'userType',
    // 'email',
    'phone',
    'documentsStatus',
    'state',
    'actions',
  ];

  // Filters
  public searchTerm: string = '';
  public selectedUserType: string = '';
  public selectedDocStatus: string = '';
  public selectedAccountStatus: string = '';

  // Stats
  public stats = {
    totalUsers: 0,
    totalClients: 0,
    totalDrivers: 0,
    pendingDocs: 0,
    blockedAccounts: 0,
    activeDrivers: 0
  };

  // User types and statuses
  public userTypes = [
    { value: 'all', label: 'Todos', icon: 'nc-circle-10' },
    { value: 'client', label: 'Clientes', icon: 'nc-single-02', color: '#3b82f6' },
    { value: 'driver', label: 'Conductores', icon: 'nc-bus-front-12', color: '#f59e0b' }
  ];

  public docStatuses = [
    { value: 'all', label: 'Todos' },
    { value: 'verified', label: 'Verificados' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'missing', label: 'Sin documentos' },
    { value: 'admin_verified', label: 'Validado Admin' },
    { value: 'admin_pending', label: 'Pendiente Admin' }
  ];

  // Lightbox
  public lightboxImage: string = '';
  public currentDocument: any = null;
  public isLightboxOpen: boolean = false;

  // Zoom Control
  public zoomLevel: number = 1;

  // Rejection Logic
  public isRejecting: boolean = false;
  public rejectionReason: string = '';
  public predefinedReasons: string[] = [
    'Documento ilegible o borroso',
    'El documento está vencido',
    'Los datos no coinciden',
    'Documento incompleto',
    'No es el documento solicitado'
  ];

  constructor(
    private usersService: UsersService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem('infoUser'));
    if (this.infoUser) {
      this.getUsersList();
    }
  }

  /**
   * Get all users list
   */
  public getUsersList() {
    this.usersService.getAllUsers().pipe(take(1)).subscribe((users) => {
      // Filtrar super admins (userCurrentRole === 0)
      this.array_user = users.filter((u: Users) => u.userCurrentRole !== 0);
      this.filteredUsers = this.array_user;
      this.calculateStats();
      this.filterUsers();
    });
  }

  /**
   * Calculate statistics
   * Actualizado para considerar cambios de rol entre cliente y conductor
   */
  private calculateStats() {
    this.stats.totalUsers = this.array_user.length;
    // Contar por rol actual
    this.stats.totalClients = this.array_user.filter(u => u.userCurrentRole === 1).length;
    this.stats.totalDrivers = this.array_user.filter(u => u.userCurrentRole === 9).length;
    this.stats.blockedAccounts = this.array_user.filter(u => !u.state).length;
    this.stats.activeDrivers = this.array_user.filter(u => u.userCurrentRole === 9 && u.state).length;

    // Count pending documents - consider as 0 for now until new logic is defined
    this.stats.pendingDocs = 0;
  }

  /**
   * Filter users
   * Actualizado para considerar cambios de rol
   */
  public filterUsers() {
    const search = this.searchTerm.toLowerCase().trim();

    this.filteredUsers = this.array_user.filter(user => {
      // Search filter
      const matchesSearch = !search ||
        user.userFullName?.toLowerCase().includes(search) ||
        user.userLastName?.toLowerCase().includes(search) ||
        user.userEmail?.toLowerCase().includes(search) ||
        user.userPhone?.toLowerCase().includes(search);

      // User type filter - basado en rol actual
      const matchesUserType = !this.selectedUserType || this.selectedUserType === 'all' ||
        (this.selectedUserType === 'client' && user.userCurrentRole === 1) ||
        (this.selectedUserType === 'driver' && user.userCurrentRole === 9);

      // Document status filter - Logic removed as fields are legacy
      let matchesDocStatus = true;

      // Account status filter
      const matchesAccountStatus = !this.selectedAccountStatus ||
        (this.selectedAccountStatus === 'active' && user.state) ||
        (this.selectedAccountStatus === 'inactive' && !user.state) ||
        (this.selectedAccountStatus === 'blocked' && !user.state);

      return matchesSearch && matchesUserType && matchesDocStatus && matchesAccountStatus;
    });

    this.updateDataSource();
  }

  /**
   * Clear all filters
   */
  public clearFilters() {
    this.searchTerm = '';
    this.selectedUserType = '';
    this.selectedDocStatus = '';
    this.selectedAccountStatus = '';
    this.filterUsers();
  }

  /**
   * Update data source
   */
  private updateDataSource() {
    this.dataSource = new MatTableDataSource<Users>(this.filteredUsers);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  /**
   * Get user type info
   * Los usuarios pueden cambiar de cliente a conductor y viceversa
   */
  public getUserType(user: Users): any {
    if (user.userCurrentRole == undefined) user.userCurrentRole = 1;

    // userCurrentRole 1 = Cliente, userCurrentRole 9 = Conductor
    // Priorizar rol de conductor si tiene ese rol actualmente
    if (user.userCurrentRole === 9) {
      return this.userTypes[2]; // Conductor
    } else if (user.userCurrentRole === 1) {
      return this.userTypes[1]; // Cliente
    }

    return this.userTypes[0]; // Todos (default)
  }

  public hasDriverProfile(user: Users): boolean {
    return user.userCurrentRole === 9; // Only role check as uploads are legacy
  }

  /**
   * Determinar si el usuario tiene perfil de cliente
   */
  public hasClientProfile(user: Users): boolean {
    return user.userCurrentRole === 1 || !this.hasDriverProfile(user);
  }

  /**
   * Get documents status
   * Ahora considera que un usuario puede tener documentos de conductor aunque su rol sea cliente
  public getDocumentsStatus(user: Users): string {
    return 'N/A'; // Legacy fields removed
  }

  /**
   * Navigate to user detail page
   */
  public viewUserProfile(user: Users) {
    // Navigate to detail component
    this.router.navigate(['/users', user.userUuid]);
  }

  /**
   * Load user vehicles
   */
  private loadUserVehicles(userUuid: string) {
    this.usersService.getVehiclesByUser(userUuid).pipe(take(1)).subscribe((vehicles) => {
      this.arrayVehicles = vehicles;
      if (vehicles.length > 0) {
        this.selectVehicle(vehicles[0], 0);
      }
    });
  }

  /**
   * Select vehicle
   */
  public selectVehicle(vehicle: Vehicle, index: number) {
    this.vehicleSelected = vehicle;
    this.selectedVehicleIndex = index;
    this.updateDocumentsList();
  }

  /**
   * Update documents list (Replaces vehicleDocuments getter)
   * Update local documents list based on user and vehicle selection
   */
  public updateDocumentsList() {
    if (!this.user) return;

    // Previously managed DNI and License. Now removed.
    // Logic can be restored if new fields (e.g., inside 'Vehicle' or new User docs structure) are added.
    this.documentsList = [];
    this.personalDocumentsList = [];

    // Si hay vehículo seleccionado, agregar sus documentos (SI SE MANTIENEN EN VEHICLE)
    if (this.vehicleSelected && this.vehicleSelected.vehicleId) {
      const driverDocs = [];

      if (this.vehicleSelected.vehicleDocumentCarSureURL) {
        driverDocs.push({
          label: 'Seguro del Vehículo',
          url: this.vehicleSelected.vehicleDocumentCarSureURL,
          type: 'insurance',
          verified: this.vehicleSelected.vehicleSureVerified,
          uploaded: this.vehicleSelected.vehicleDocumentCarSureUploaded, // Check if this exists in Vehicle interface
          description: 'Póliza de seguro del vehículo'
        });
      }

      if (this.vehicleSelected.vehicleDocumentCarURL) {
        driverDocs.push({
          label: 'Matrícula del Vehículo',
          url: this.vehicleSelected.vehicleDocumentCarURL,
          type: 'registration',
          verified: this.vehicleSelected.vehicleDocumentVerified,
          uploaded: this.vehicleSelected.vehicleDocumentUploaded, // Check if this exists in Vehicle interface
          description: 'Matrícula del vehículo'
        });
      }
      this.documentsList = driverDocs;
    }
  }

  /**
   * Open document lightbox with verification options
   */
  public openDocumentLightbox(doc: any) {
    if (!doc.url) return;

    this.lightboxImage = doc.url;
    this.currentDocument = doc;
    this.isLightboxOpen = true;
    this.zoomLevel = 1; // Reset zoom
    this.cancelRejection(); // Reset rejection state
  }

  /**
   * Open image lightbox for viewing (profile picture or any image)
   */
  public openImageLightbox(imageUrl: string, title: string = 'Imagen') {
    if (!imageUrl) return;

    this.lightboxImage = imageUrl;
    this.currentDocument = {
      label: title,
      url: imageUrl,
      uploaded: true,
      verified: false
      // No incluimos 'description' para que no muestre los botones de verificación
    };
    this.isLightboxOpen = true;
    this.zoomLevel = 1; // Reset zoom
    this.cancelRejection(); // Reset rejection state
  }

  /**
   * Close lightbox overlay
   */
  public closeLightbox() {
    this.isLightboxOpen = false;
    this.lightboxImage = '';
    this.zoomLevel = 1;
    this.cancelRejection(); // Clean up on close

    // Solo limpiar referencia después de animación si fuera necesario, 
    // pero por ahora lo mantenemos simple.
    // setTimeout(() => {
    //   this.currentDocument = null; 
    // }, 300);
  }

  /**
   * Zoom In
   */
  public zoomIn(event?: any) {
    if (event) event.stopPropagation();
    this.zoomLevel += 0.25;
  }

  /**
   * Zoom Out
   */
  public zoomOut(event?: any) {
    if (event) event.stopPropagation();
    if (this.zoomLevel > 0.5) {
      this.zoomLevel -= 0.25;
    }
  }

  /**
   * Verify document
   */
  public async verifyDocument() {
    if (!this.currentDocument || !this.user) return;

    const result = await Swal.fire({
      title: '¿Verificar documento?',
      text: `Se marcará el ${this.currentDocument.label} como verificado`,
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

        // Verificación individual para cada tipo de documento
        console.log(this.currentDocument.type);

        switch (this.currentDocument.type) {
          case 'identificationFront':
            updateData.userIdentificationFrontVerified = true;
            updateData.userIdentificationFrontRejectionReason = null;
            break;
          case 'identificationBack':
            updateData.userIdentificationBackVerified = true;
            updateData.userIdentificationBackRejectionReason = null;
            break;
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
            // Update vehicle
            this.vehicleSelected.vehicleSureVerified = true;
            this.vehicleSelected.vehicleSureRejectionReason = null;
            await this.usersService.updateVehicleState(this.vehicleSelected);
            this.showNotification('top', 'right', 'nc-check-2', 'Documento verificado correctamente', 'success');
            this.currentDocument.verified = true;
            // Update docs list
            this.updateDocumentsList();
            this.closeLightbox();
            return;
          case 'registration':
            // Update vehicle
            this.vehicleSelected.vehicleDocumentVerified = true;
            this.vehicleSelected.vehicleDocumentRejectionReason = null;
            await this.usersService.updateVehicleState(this.vehicleSelected);
            this.showNotification('top', 'right', 'nc-check-2', 'Documento verificado correctamente', 'success');
            this.currentDocument.verified = true;
            // Update docs list
            this.updateDocumentsList();
            this.closeLightbox();
            return;
        }

        if (Object.keys(updateData).length > 0) {
          await this.usersService.updateUser({ ...this.user, ...updateData });
          Object.assign(this.user, updateData);
          this.currentDocument.verified = true;
          this.showNotification('top', 'right', 'nc-check-2', 'Documento verificado correctamente', 'success');
          // Update docs list
          this.updateDocumentsList();
          this.closeLightbox();
          this.getUsersList();
        }
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al verificar documento', 'danger');
      }
    }
  }

  /**
   * Set rejection reason from predefined list
   */
  public setRejectionReason(reason: string) {
    this.rejectionReason = reason;
  }

  /**
   * Start rejection process (show inline form)
   */
  public rejectDocument() {
    this.isRejecting = true;
    this.rejectionReason = '';
  }

  /**
   * Cancel rejection process
   */
  public cancelRejection() {
    this.isRejecting = false;
    this.rejectionReason = '';
  }

  /**
   * Confirm rejection
   */
  public async confirmRejection() {
    if (!this.currentDocument || !this.user) return;

    if (!this.rejectionReason || this.rejectionReason.trim().length === 0) {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Por favor ingresa un motivo', 'warning');
      return;
    }

    const reason = this.rejectionReason; // Usa la variable de clase

    // No Swal.fire here, use inline UI

    try {
      const updateData: any = {};
      // ... (rest of logic remains similar but uses 'reason' variable)

      // Rechazo individual para cada tipo de documento
      switch (this.currentDocument.type) {
        // Legacy document types removed
        case 'insurance':
          this.vehicleSelected.vehicleSureVerified = false;
          this.vehicleSelected.vehicleSureRejectionReason = reason;

          await this.usersService.updateVehicleState(this.vehicleSelected);
          this.showNotification('top', 'right', 'nc-check-2', 'Documento rechazado', 'info');
          this.currentDocument.verified = false;
          // Update docs list
          this.updateDocumentsList();
          this.closeLightbox();
          return;
        case 'registration':
          this.vehicleSelected.vehicleDocumentVerified = false;
          this.vehicleSelected.vehicleDocumentRejectionReason = reason;

          await this.usersService.updateVehicleState(this.vehicleSelected);
          this.showNotification('top', 'right', 'nc-check-2', 'Documento rechazado', 'info');
          this.currentDocument.verified = false;
          // Update docs list
          this.updateDocumentsList();
          this.closeLightbox();
          return;
      }

      if (Object.keys(updateData).length > 0) {
        await this.usersService.updateUser({ ...this.user, ...updateData });
        Object.assign(this.user, updateData);
        this.currentDocument.verified = false;
        this.showNotification('top', 'right', 'nc-check-2', `Documento rechazado: ${reason}`, 'info');
        // Update docs list
        this.updateDocumentsList();
        this.closeLightbox();
        this.getUsersList();
      }
    } catch (error) {
      this.showNotification('top', 'right', 'nc-simple-remove', 'Error al rechazar documento', 'danger');
    }
  }

  /* OLD METHOD REMOVED - Logic moved to confirmRejection */
  /*
  public async rejectDocument() {
     ... old swal logic ...
  }
  */

  /**
   * Toggle account verification status
   * */
  // Method toggleAccountVerification removed (legacy fields)

  /**
   * Update user state
   * Block/Unblock
   */
  public async toggleUserState(user: Users, event: any) {
    event.stopPropagation();
    const newState = !user.state;
    const action = newState ? 'activar' : 'desactivar';

    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} usuario?`,
      text: `Se ${action}á la cuenta de ${user.userFullName}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: newState ? '#10b981' : '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await this.usersService.updateUserState(user.userUuid, newState);
        user.state = newState;
        this.showNotification('top', 'right', 'nc-check-2', `Usuario ${action}do correctamente`, 'success');
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar estado', 'danger');
      }
    }
  }

  /**
   * Toggle location sharing state
   */
  public async toggleLocationSharing(user: Users, event: any) {
    event.stopPropagation();
    // Feature disabled as it depends on legacy fields (userStateShareLocation)
    this.showNotification('top', 'right', 'nc-icon nc-alert-circle-i',
      'La función de compartir ubicación se está migrando al nuevo sistema de dispositivos.', 'info');
  }

  /**
   * Toggle vehicle state (active/inactive)
   */
  /*
   * Update vehicle state con confirmación y validación
   */
  public async toggleVehicleState(vehicle: Vehicle) {
    if (!vehicle || !this.user) return;

    const newState = !vehicle.vehicleState;

    // VALIDATION: removed call to userLicenceVerified
    /*
    if (newState === true) {
       // Legacy check removed
    }
    */

    // CONFIRMATION Dialog
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

        await this.usersService.updateVehicleState(vehicle);
        this.showNotification('top', 'right', 'nc-check-2', `Vehículo ${action}do correctamente`, 'success');
      } catch (error) {
        console.error(error);
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar vehículo', 'danger');
        vehicle.vehicleState = !newState; // Revert
      }
    } else {
      // Cancelled
    }
  }

  /**
   * Toggle Admin Verification Status
   */
  // Method toggleAdminVerification removed (legacy fields)


  /**
   * Block/Unblock user account con modal intuitivo
   */
  public async toggleBlockUser(user: Users) {
    const newState = !user.state;
    const action = newState ? 'activar' : 'bloquear';

    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} cuenta?`,
      text: `El usuario ${user.userFullName} será ${action}do`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: newState ? '#10b981' : '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await this.usersService.updateUserState(user.userUuid, newState);
        user.state = newState;
        this.showNotification('top', 'right', 'nc-check-2', `Cuenta ${action}da correctamente`, 'success');
        this.getUsersList();
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar estado', 'danger');
      }
    }
  }

  /**
   * Delete user
   * Elimina el usuario de forma segura:
   * - Crea respaldo en colección deleted_users
   * - Elimina credenciales de Firebase Authentication
   * - Elimina documento de Firestore
   */
  public async deleteUser(user: Users, event: any) {
    event.stopPropagation();

    const result = await Swal.fire({
      title: '¿Eliminar usuario?',
      html: `
        <p>Esta acción no se puede deshacer.</p>
        <p><strong>Usuario:</strong> ${user.userFullName}</p>
        <p><strong>Email:</strong> ${user.userEmail}</p>
        <br>
        <p style="font-size: 12px; color: #666;">
          Se creará un respaldo en la colección deleted_users y se eliminarán las credenciales de autenticación.
        </p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      // Mostrar loader
      Swal.fire({
        title: 'Eliminando usuario...',
        html: 'Por favor espera mientras se completa la operación',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      this.usersService.deleteUser(user.userUuid).subscribe({
        next: (response) => {
          console.log('*** Respuesta de eliminación ***', response);
          Swal.close();

          if (response.success) {
            this.showNotification('top', 'right', 'nc-check-2',
              `Usuario eliminado correctamente`, 'success');
            this.getUsersList();
          } else {
            this.showNotification('top', 'right', 'nc-simple-remove',
              response.message || 'Error al eliminar usuario', 'danger');
          }
        },
        error: (error) => {
          console.error('*** Error eliminando usuario ***', error);
          Swal.close();
          this.showNotification('top', 'right', 'nc-simple-remove',
            error.error?.message || 'Error al eliminar usuario', 'danger');
        }
      });
    }
  }


  /**
   * Show notification
   */
  public showNotification(from: string, align: string, icon: string, message: string, type: string) {
    $.notify({
      icon: icon,
      message: message,
    }, {
      type: type,
      timer: 4000,
      placement: {
        from: from,
        align: align
      },
      template: '<div data-notify="container" class="col-11 col-md-4 alert alert-{0} alert-with-icon" role="alert"><button type="button" aria-hidden="true" class="close" data-notify="dismiss"><i class="nc-icon nc-simple-remove"></i></button><span data-notify="icon" class="nc-icon {{icon}}"></span> <span data-notify="title">{1}</span> <span data-notify="message">{2}</span><div class="progress" data-notify="progressbar"><div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div></div><a href="{3}" target="{4}" data-notify="url"></a></div>'
    });
  }

  /**
   * Close profile modal
   */
  /**
   * Close profile modal manually
   */
  public closeProfileModal() {
    $('#modalUserProfile').modal('hide');
    this.resetUserProfileData();
  }

  /**
   * Reset all user profile related data
   * Called automatically when modal closes
   */
  public resetUserProfileData() {
    this.user = {};
    this.arrayVehicles = [];
    this.vehicleSelected = {};
    this.documentsList = [];
    this.personalDocumentsList = [];
  }

  // Commission management methods removed (legacy fields)
}
