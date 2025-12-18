import { Component, OnInit, ViewChild } from '@angular/core';
import { FormControl, NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
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
    'commission',
    'actions',
  ];

  // Filters
  public searchTerm: string = '';
  public selectedUserType: string = '';
  public selectedDocStatus: string = 'admin_pending';
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

  // Commission Management
  public isEditingCommission: boolean = false;
  public newCommissionRate: number = 20; // Default 20%
  public commissionChangeReason: string = '';
  public readonly DEFAULT_COMMISSION_RATE = 20; // Constante para el valor por defecto

  // Commission Modal
  public showCommissionModal: boolean = false;
  public commissionModalUser: Users | null = null;

  constructor(
    private usersService: UsersService
  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem('infoUser'));
    if (this.infoUser) {
      this.getUsersList();
    }

    // Ensure cleanup when modal is closed by any means (X button, backdrop, Esc)
    $('#modalUserProfile').on('hidden.bs.modal', () => {
      this.resetUserProfileData();
    });
  }

  /**
   * Get all users list
   */
  public getUsersList() {
    this.usersService.getAllUsers().pipe(take(1)).subscribe((users) => {
      // Filtrar super admins (userRol === 0)
      this.array_user = users.filter((u: Users) => u.userRol !== 0);
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
    this.stats.totalClients = this.array_user.filter(u => u.userRol === 1).length;
    this.stats.totalDrivers = this.array_user.filter(u => u.userRol === 9).length;
    this.stats.blockedAccounts = this.array_user.filter(u => u.userAccountBlock).length;
    this.stats.activeDrivers = this.array_user.filter(u => u.userRol === 9 && u.userState).length;

    // Count pending documents - considerar cualquier usuario con perfil de conductor
    this.stats.pendingDocs = this.array_user.filter(u =>
      this.hasDriverProfile(u) && (
        !u.userDniVerified ||
        !u.userLicenceVerified ||
        !u.userDniUploaded ||
        !u.userLicenseUploaded
      )
    ).length;
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
        user.userName?.toLowerCase().includes(search) ||
        user.userEmail?.toLowerCase().includes(search) ||
        user.userIdentification?.toLowerCase().includes(search) ||
        user.userPhone?.toLowerCase().includes(search);

      // User type filter - basado en rol actual
      const matchesUserType = !this.selectedUserType || this.selectedUserType === 'all' ||
        (this.selectedUserType === 'client' && user.userRol === 1) ||
        (this.selectedUserType === 'driver' && user.userRol === 9);

      // Document status filter - aplicar solo si tiene perfil de conductor
      let matchesDocStatus = true;
      if (this.selectedDocStatus && this.selectedDocStatus !== 'all') {
        // Solo filtrar si el usuario tiene perfil de conductor
        if (this.hasDriverProfile(user)) {
          if (this.selectedDocStatus === 'verified') {
            matchesDocStatus = user.userDniVerified && user.userLicenceVerified;
          } else if (this.selectedDocStatus === 'pending') {
            matchesDocStatus = (user.userDniUploaded || user.userLicenseUploaded) &&
              (!user.userDniVerified || !user.userLicenceVerified);
          } else if (this.selectedDocStatus === 'admin_verified') {
            matchesDocStatus = user.userAdminDocumentVerified === true;
          } else if (this.selectedDocStatus === 'admin_pending') {
            matchesDocStatus = !user.userAdminDocumentVerified;
          } else if (this.selectedDocStatus === 'missing') {
            matchesDocStatus = !user.userDniUploaded || !user.userLicenseUploaded;
          }
        } else {
          // Si no tiene perfil de conductor, no coincide con filtros de documentos
          matchesDocStatus = false;
        }
      }

      // Account status filter
      const matchesAccountStatus = !this.selectedAccountStatus ||
        (this.selectedAccountStatus === 'active' && user.userState && !user.userAccountBlock) ||
        (this.selectedAccountStatus === 'inactive' && !user.userState) ||
        (this.selectedAccountStatus === 'blocked' && user.userAccountBlock);

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
    if (user.userRol == undefined) user.userRol = 1;

    // userRol 1 = Cliente, userRol 9 = Conductor
    // Priorizar rol de conductor si tiene ese rol actualmente
    if (user.userRol === 9) {
      return this.userTypes[2]; // Conductor
    } else if (user.userRol === 1) {
      return this.userTypes[1]; // Cliente
    }

    return this.userTypes[0]; // Todos (default)
  }

  /**
   * Determinar si el usuario tiene perfil de conductor
   * (ha subido documentos de conductor o tiene rol 9)
   */
  public hasDriverProfile(user: Users): boolean {
    return user.userRol === 9 ||
      user.userDniUploaded === true ||
      user.userLicenseUploaded === true ||
      user.userDocumentCarUploaded === true;
  }

  /**
   * Determinar si el usuario tiene perfil de cliente
   */
  public hasClientProfile(user: Users): boolean {
    return user.userRol === 1 || !this.hasDriverProfile(user);
  }

  /**
   * Get documents status
   * Ahora considera que un usuario puede tener documentos de conductor aunque su rol sea cliente
   */
  public getDocumentsStatus(user: Users): string {
    // Si no tiene perfil de conductor, no aplica
    if (!this.hasDriverProfile(user)) return 'N/A';

    // Si tiene perfil de conductor, verificar documentos
    if (!user.userDniUploaded || !user.userLicenseUploaded) {
      return 'missing';
    }
    if (user.userDniVerified && user.userLicenceVerified) {
      return 'verified';
    }
    return 'pending';
  }

  /**
   * Open user profile modal
   * Cargar vehículos si tiene perfil de conductor
   */
  public viewUserProfile(user: Users) {
    this.isEdit = true;
    this.user = { ...user };

    // Cargar vehículos si tiene perfil de conductor (independiente del rol actual)
    if (this.hasDriverProfile(user)) {
      this.loadUserVehicles(user.userUid);
      // Start with user documents even if no vehicle yet
      this.updateDocumentsList();
    }

    $('#modalUserProfile').modal('show');
  }

  /**
   * Load user vehicles
   */
  private loadUserVehicles(userUid: string) {
    this.usersService.getVehiclesByUser(userUid).pipe(take(1)).subscribe((vehicles) => {
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

    // Personal Documents (DNI) - Visible for all users
    const personalDocs = [];

    personalDocs.push({
      label: 'DNI (Identidad)',
      url: this.user.userDniURL, // Prioritize DNI URL if separate, otherwise fallback to Identification if needed, but per request DNI is key
      type: 'dni',
      verified: this.user.userDniVerified,
      uploaded: this.user.userDniUploaded,
      description: 'Documento Nacional de Identidad'
    });

    this.personalDocumentsList = personalDocs;


    // Driver Documents - Visible only if driver profile
    const driverDocs = [];

    // 1. Licencia
    driverDocs.push({
      label: 'Licencia de Conducir',
      url: this.user.userLicenceURL,
      type: 'license',
      verified: this.user.userLicenceVerified,
      uploaded: this.user.userLicenseUploaded, // Note: userLicenseUploaded vs userLicenceUploaded check interface
      description: 'Licencia de conducir'
    });

    // 2. Documento del Carro (User level - sometimes legacy, but keeping if needed or moving to vehicle)
    // If requirement says separate DNI from driver docs, license is definitely driver doc.
    // If user has 'userDocumentCarURL' distinct from vehicle, keep it. 
    // Assuming 'userDocumentCarURL' is the "Certificado Médico" or generic car doc? 
    // Usually standard is License + Vehicle Docs. 
    // Let's keep existing logic but split list.

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

    // Si hay vehículo seleccionado, agregar sus documentos
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
            await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
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
            await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
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
        case 'identificationFront':
          updateData.userIdentificationFrontVerified = false;
          updateData.userIdentificationFrontRejectionReason = reason;
          break;
        case 'identificationBack':
          updateData.userIdentificationBackVerified = false;
          updateData.userIdentificationBackRejectionReason = reason;
          break;
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
          this.showNotification('top', 'right', 'nc-check-2', 'Documento rechazado', 'info');
          this.currentDocument.verified = false;
          // Update docs list
          this.updateDocumentsList();
          this.closeLightbox();
          return;
        case 'registration':
          this.vehicleSelected.vehicleDocumentVerified = false;
          this.vehicleSelected.vehicleDocumentRejectionReason = reason;

          await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
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
  public async toggleAccountVerification(type: 'client' | 'driver', event: any) {
    // Prevent default to control the state change manually if needed, 
    // but typically for checkboxes we let it change and revert on error.
    // Here getting the new value from the model which ngModel should have updated.

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
      this.showNotification('top', 'right', 'nc-check-2', `Cuenta de ${role} ${status}`, 'success');
    } catch (error) {
      console.error(error);
      this.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar estado', 'danger');
      // Revert change
      if (type === 'client') {
        this.user.userClientAccountIsVerify = !isChecked;
      } else {
        this.user.userDriverAccountIsVerify = !isChecked;
      }
    }
  }

  /**
   * Update user state
   * Block/Unblock
   */
  public async toggleUserState(user: Users, event: any) {
    event.stopPropagation();
    const newState = !user.userState;
    const action = newState ? 'activar' : 'desactivar';

    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} usuario?`,
      text: `Se ${action}á la cuenta de ${user.userName}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: newState ? '#10b981' : '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await this.usersService.updateUserState(user.userUid, newState);
        user.userState = newState;
        this.showNotification('top', 'right', 'nc-check-2', `Usuario ${action}do correctamente`, 'success');
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar estado', 'danger');
      }
    }
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

    // VALIDATION: Cannot activate if documents are not verified
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

        await this.usersService.updateVehicleState(this.user.userUid, vehicle);
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
  public async toggleAdminVerification(user: Users, event?: any) {
    if (!user) return;

    const newState = !user.userAdminDocumentVerified;
    const action = newState ? 'validar' : 'invalidar';

    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} documentación?`,
      text: `Se marcará la documentación de ${user.userName} como ${newState ? 'VALIDADA' : 'PENDIENTE'} por administración.`,
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
          userAdminDocumentVerifiedBy: this.infoUser.userEmail // Tracking who did it
        };

        await this.usersService.updateUser({ ...user, ...updateData });

        // Update local state
        user.userAdminDocumentVerified = newState;
        user.userAdminDocumentVerifiedDate = updateData.userAdminDocumentVerifiedDate;

        this.showNotification('top', 'right', 'nc-check-2', `Documentación ${newState ? 'validada' : 'pendiente'} correctamente`, 'success');

        // Refresh stats/view
        this.updateDataSource();

      } catch (error) {
        console.error(error);
        if (event) event.target.checked = !newState; // Revert on error
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar estado', 'danger');
      }
    } else {
      // Cancelled - Revert UI
      if (event) event.target.checked = !newState;
    }
  }

  /**
   * Block/Unblock user account con modal intuitivo
   */
  public async toggleBlockUser(user: Users) {
    const isBlocking = !user.userAccountBlock;

    if (isBlocking) {
      // Mostrar modal de bloqueo con opciones predefinidas
      const { value: formValues } = await Swal.fire({
        title: 'Bloquear Cuenta de Usuario',
        html: `
          <div class="text-left">
            <p class="mb-3"><strong>Usuario:</strong> ${user.userName}</p>
            <p class="mb-3"><strong>Email:</strong> ${user.userEmail}</p>
            <hr>
            <label class="font-weight-bold mb-2">Motivo del bloqueo:</label>
            <select id="swal-reason" class="form-control mb-3">
              <option value="">Selecciona un motivo...</option>
              <option value="Violación de términos de servicio">Violación de términos de servicio</option>
              <option value="Comportamiento inapropiado">Comportamiento inapropiado</option>
              <option value="Fraude o actividad sospechosa">Fraude o actividad sospechosa</option>
              <option value="Documentos falsos o adulterados">Documentos falsos o adulterados</option>
              <option value="Múltiples quejas de usuarios">Múltiples quejas de usuarios</option>
              <option value="Otro">Otro (especificar abajo)</option>
            </select>
            <label class="font-weight-bold mb-2">Detalles adicionales:</label>
            <textarea id="swal-details" class="form-control" rows="3" placeholder="Escribe detalles adicionales (opcional)..."></textarea>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Bloquear Cuenta',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
          const reason = (document.getElementById('swal-reason') as HTMLSelectElement).value;
          const details = (document.getElementById('swal-details') as HTMLTextAreaElement).value;

          if (!reason) {
            Swal.showValidationMessage('Por favor selecciona un motivo');
            return false;
          }

          return { reason, details };
        }
      });

      if (formValues) {
        try {
          const blockMotive = formValues.details
            ? `${formValues.reason} - ${formValues.details}`
            : formValues.reason;

          const updateData: any = {
            userAccountBlock: true,
            userBlockAccountMotive: blockMotive,
            userBlockAccountDate: new Date().toLocaleDateString(),
            userBlockAccountTime: new Date().toLocaleTimeString()
          };

          await this.usersService.updateUser({ ...user, ...updateData });
          Object.assign(user, updateData);
          this.showNotification('top', 'right', 'nc-check-2', 'Cuenta bloqueada correctamente', 'success');
          this.getUsersList();
        } catch (error) {
          this.showNotification('top', 'right', 'nc-simple-remove', 'Error al bloquear cuenta', 'danger');
        }
      }
    } else {
      // Desbloquear cuenta
      const result = await Swal.fire({
        title: 'Desbloquear Cuenta',
        html: `
          <p><strong>Usuario:</strong> ${user.userName}</p>
          <p><strong>Bloqueado por:</strong> ${user.userBlockAccountMotive || 'No especificado'}</p>
          <p><strong>Fecha:</strong> ${user.userBlockAccountDate} ${user.userBlockAccountTime}</p>
          <hr>
          <p>¿Estás seguro de desbloquear esta cuenta?</p>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, desbloquear',
        cancelButtonText: 'Cancelar'
      });

      if (result.isConfirmed) {
        try {
          const updateData: any = {
            userAccountBlock: false,
            userBlockAccountMotive: '',
            userBlockAccountDate: '',
            userBlockAccountTime: ''
          };

          await this.usersService.updateUser({ ...user, ...updateData });
          Object.assign(user, updateData);
          this.showNotification('top', 'right', 'nc-check-2', 'Cuenta desbloqueada correctamente', 'success');
          this.getUsersList();
        } catch (error) {
          this.showNotification('top', 'right', 'nc-simple-remove', 'Error al desbloquear cuenta', 'danger');
        }
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
        <p><strong>Usuario:</strong> ${user.userName}</p>
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

      this.usersService.deleteUser(user.userUid).subscribe({
        next: (response) => {
          console.log('*** Respuesta de eliminación ***', response);
          Swal.close();

          if (response.success) {
            this.showNotification('top', 'right', 'nc-check-2',
              `Usuario ${response.data.userName} eliminado correctamente`, 'success');
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
    this.isEditingCommission = false;
    this.newCommissionRate = this.DEFAULT_COMMISSION_RATE;
    this.commissionChangeReason = '';
    this.commissionModalUser = null;
  }

  /**
   * ============================================
   * COMMISSION MANAGEMENT METHODS
   * ============================================
   */

  /**
   * Get user commission rate
   * Returns custom rate if set, otherwise default 20%
   */
  public getUserCommissionRate(user: Users): number {
    if (!user) return this.DEFAULT_COMMISSION_RATE;

    // Si tiene comisión personalizada, usarla
    if (user.userCommissionCustomEnabled && user.userCommissionRate !== undefined) {
      return user.userCommissionRate;
    }

    // Si tiene comisión configurada pero no personalizada
    if (user.userCommissionRate !== undefined) {
      return user.userCommissionRate;
    }

    // Valor por defecto
    return this.DEFAULT_COMMISSION_RATE;
  }

  /**
   * Start editing commission
   */
  public startEditingCommission() {
    this.isEditingCommission = true;
    this.newCommissionRate = this.getUserCommissionRate(this.user);
    this.commissionChangeReason = '';
  }

  /**
   * Cancel editing commission
   */
  public cancelEditingCommission() {
    this.isEditingCommission = false;
    this.newCommissionRate = this.getUserCommissionRate(this.user);
    this.commissionChangeReason = '';
  }

  /**
   * Validate commission input
   */
  public isCommissionValid(): boolean {
    if (this.newCommissionRate === null || this.newCommissionRate === undefined) {
      return false;
    }

    // Validar rango (0-100)
    if (this.newCommissionRate < 0 || this.newCommissionRate > 100) {
      return false;
    }

    // Validar que sea diferente al valor actual
    if (this.newCommissionRate === this.getUserCommissionRate(this.user)) {
      return false;
    }

    return true;
  }

  /**
   * Save commission change
   */
  public async saveCommissionChange() {
    if (!this.isCommissionValid()) {
      this.showNotification('top', 'right', 'nc-simple-remove',
        'Por favor ingresa un porcentaje válido entre 0% y 100%', 'danger');
      return;
    }

    // Confirm change
    const result = await Swal.fire({
      title: 'Cambiar comisión',
      html: `
        <p>¿Estás seguro de cambiar la comisión del conductor?</p>
        <div style="background: rgba(72, 128, 255, 0.1); padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="margin: 5px 0;"><strong>Comisión actual:</strong> ${this.getUserCommissionRate(this.user)}%</p>
          <p style="margin: 5px 0;"><strong>Nueva comisión:</strong> ${this.newCommissionRate}%</p>
          ${this.commissionChangeReason ? `<p style="margin: 5px 0;"><strong>Motivo:</strong> ${this.commissionChangeReason}</p>` : ''}
        </div>
        <p style="font-size: 13px; color: #9A9A9A;">El cambio se aplicará a partir del próximo viaje</p>
      `,
      icon: 'question',
      showCancelButton: true,
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, cambiar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const previousRate = this.getUserCommissionRate(this.user);
      const currentDate = new Date();

      // Create history entry
      const historyEntry = {
        date: currentDate.toISOString().split('T')[0],
        time: currentDate.toTimeString().split(' ')[0],
        previousRate: previousRate,
        newRate: this.newCommissionRate,
        updatedBy: 'Admin', // TODO: Get from auth service
        reason: this.commissionChangeReason || 'Sin motivo especificado'
      };

      // Update user object
      const updatedUser: Users = {
        ...this.user,
        userCommissionRate: this.newCommissionRate,
        userCommissionType: 'percentage' as const,
        userCommissionCustomEnabled: this.newCommissionRate !== this.DEFAULT_COMMISSION_RATE,
        userCommissionLastUpdate: currentDate.toISOString(),
        userCommissionUpdatedBy: 'Admin', // TODO: Get from auth service
        userCommissionHistory: [
          historyEntry,
          ...(this.user.userCommissionHistory || [])
        ].slice(0, 50) // Keep last 50 changes
      };

      // Save to Firestore
      await this.usersService.updateUser(updatedUser);

      // Update local user object
      this.user = updatedUser;

      // Close edit mode
      this.isEditingCommission = false;
      this.commissionChangeReason = '';

      // Show success message
      this.showNotification('top', 'right', 'nc-check-2',
        `Comisión actualizada correctamente a ${this.newCommissionRate}%`, 'success');

    } catch (error) {
      console.error('Error updating commission:', error);
      this.showNotification('top', 'right', 'nc-simple-remove',
        'Error al actualizar la comisión', 'danger');
    }
  }

  /**
   * Open commission modal for a specific user
   */
  public openCommissionModal(user: Users) {
    if (!this.hasDriverProfile(user)) {
      this.showNotification('top', 'right', 'nc-simple-remove',
        'Solo los conductores tienen comisión', 'warning');
      return;
    }

    this.commissionModalUser = user;
    this.newCommissionRate = this.getUserCommissionRate(user);
    this.commissionChangeReason = '';
    this.isEditingCommission = false;
    this.showCommissionModal = true;
  }

  /**
   * Close commission modal
   */
  public closeCommissionModal() {
    this.showCommissionModal = false;
    this.commissionModalUser = null;
    this.isEditingCommission = false;
    this.commissionChangeReason = '';
  }

  /**
   * Save commission change from dedicated modal
   */
  public async saveCommissionFromModal() {
    if (!this.commissionModalUser) return;

    // Temporary swap user to use existing saveCommissionChange logic
    const originalUser = this.user;
    this.user = this.commissionModalUser;

    await this.saveCommissionChange();

    // Restore original user and close modal
    this.user = originalUser;

    // Update the user in the table
    const index = this.array_user.findIndex((u: Users) => u.userId === this.commissionModalUser.userId);
    if (index !== -1) {
      this.array_user[index] = { ...this.commissionModalUser };
      this.dataSource.data = [...this.array_user];
    }

    this.closeCommissionModal();
  }
}
