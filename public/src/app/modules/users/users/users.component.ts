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

  // Vehicle data
  public arrayVehicles: Array<Vehicle> = [];
  public vehicleSelected: Vehicle = {};
  public selectedVehicleIndex = 0;

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
    { value: 'missing', label: 'Sin documentos' }
  ];

  // Lightbox
  public lightboxImage: string = '';
  public currentDocument: any = null;

  constructor(
    private usersService: UsersService
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
      // Filtrar super admins (userRol === 0)
      this.array_user = users.filter((u: Users) => u.userRol !== 0);
      this.filteredUsers = this.array_user;
      this.calculateStats();
      this.updateDataSource(); 
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
  }

  /**
   * Get vehicle documents
   * Incluye userDocumentCarURL del usuario
   */
  get vehicleDocuments() {
    if (!this.user) return [];

    const docs = [
      {
        label: 'Identificación Frontal',
        url: this.user.userIdentificationFrontImage,
        type: 'identificationFront',
        verified: this.user.userIdentificationFrontVerified,
        uploaded: !!this.user.userIdentificationFrontImage,
        description: 'Foto frontal del documento de identidad'
      },
      {
        label: 'Identificación Trasera',
        url: this.user.userIdentificationBackImage,
        type: 'identificationBack',
        verified: this.user.userIdentificationBackVerified,
        uploaded: !!this.user.userIdentificationBackImage,
        description: 'Foto trasera del documento de identidad'
      },
      {
        label: 'DNI',
        url: this.user.userDniURL,
        type: 'dni',
        verified: this.user.userDniVerified,
        uploaded: this.user.userDniUploaded,
        description: 'Documento de identidad'
      }, 
      {
        label: 'Licencia',
        url: this.user.userLicenceURL,
        type: 'license',
        verified: this.user.userLicenceVerified,
        uploaded: this.user.userLicenseUploaded,
        description: 'Licencia de conducir'
      }
    ];

    // Documento de carro del usuario
    if (this.user.userDocumentCarURL || this.user.userDocumentCarUploaded) {
      docs.push({
        label: 'Documento del Carro',
        url: this.user.userDocumentCarURL,
        type: 'userCarDocument',
        verified: this.user.userDocumentCarVerified,
        uploaded: this.user.userDocumentCarUploaded,
        description: 'Documento del vehículo del usuario'
      });
    }

    // Si hay vehículo seleccionado, agregar sus documentos
    if (this.vehicleSelected && this.vehicleSelected.vehicleId) {
      docs.push({
        label: 'Seguro del Vehículo',
        url: this.vehicleSelected.vehicleDocumentCarSureURL,
        type: 'insurance',
        verified: this.vehicleSelected.vehicleSureVerified,
        uploaded: this.vehicleSelected.vehicleDocumentCarSureUploaded,
        description: 'Póliza de seguro del vehículo'
      });

      docs.push({
        label: 'Matrícula del Vehículo',
        url: this.vehicleSelected.vehicleDocumentCarURL,
        type: 'registration',
        verified: true,
        uploaded: this.vehicleSelected.vehicleDocumentUploaded,
        description: 'Matrícula del vehículo'
      });
    }

    return docs;
  }

  /**
   * Open document lightbox with verification options
   */
  public openDocumentLightbox(doc: any) {
    if (!doc.url) return;

    this.lightboxImage = doc.url;
    this.currentDocument = doc;
    $('#documentLightbox').modal('show');
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
        switch (this.currentDocument.type) {
          case 'identificationFront':
            updateData.userIdentificationFrontVerified = true;
            break;
          case 'identificationBack':
            updateData.userIdentificationBackVerified = true;
            break;
          case 'dni':
            updateData.userDniVerified = true;
            break;
          case 'license':
            updateData.userLicenceVerified = true;
            break;
          case 'userCarDocument':
            updateData.userDocumentCarVerified = true;
            break;
          case 'insurance':
            // Update vehicle
            this.vehicleSelected.vehicleSureVerified = true;
            await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
            this.showNotification('top', 'right', 'nc-check-2', 'Documento verificado correctamente', 'success');
            this.currentDocument.verified = true;
            $('#documentLightbox').modal('hide');
            return;
        }

        if (Object.keys(updateData).length > 0) {
          await this.usersService.updateUser({ ...this.user, ...updateData });
          Object.assign(this.user, updateData);
          this.currentDocument.verified = true;
          this.showNotification('top', 'right', 'nc-check-2', 'Documento verificado correctamente', 'success');
          $('#documentLightbox').modal('hide');
          this.getUsersList();
        }
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al verificar documento', 'danger');
      }
    }
  }

  /**
   * Reject document
   */
  public async rejectDocument() {
    if (!this.currentDocument || !this.user) return;

    const { value: reason } = await Swal.fire({
      icon: 'warning',
      title: 'Motivo del rechazo',
      text: `¿Por qué rechazas el ${this.currentDocument.label}?`,
      input: 'textarea',
      inputPlaceholder: 'Escribe el motivo del rechazo...',
      inputAttributes: {
        'aria-label': 'Escribe el motivo del rechazo'
      },
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Rechazar',
      cancelButtonText: 'Cancelar'
    });

    if (reason) {
      try {
        const updateData: any = {};

        // Rechazo individual para cada tipo de documento
        switch (this.currentDocument.type) {
          case 'identificationFront':
            updateData.userIdentificationFrontVerified = false;
            break;
          case 'identificationBack':
            updateData.userIdentificationBackVerified = false;
            break;
          case 'dni':
            updateData.userDniVerified = false;
            break;
          case 'license':
            updateData.userLicenceVerified = false;
            break;
          case 'userCarDocument':
            updateData.userDocumentCarVerified = false;
            break;
          case 'insurance':
            this.vehicleSelected.vehicleSureVerified = false;
            await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
            this.showNotification('top', 'right', 'nc-check-2', 'Documento rechazado', 'info');
            this.currentDocument.verified = false;
            $('#documentLightbox').modal('hide');
            return;
        }

        if (Object.keys(updateData).length > 0) {
          await this.usersService.updateUser({ ...this.user, ...updateData });
          Object.assign(this.user, updateData);
          this.currentDocument.verified = false;
          this.showNotification('top', 'right', 'nc-check-2', `Documento rechazado: ${reason}`, 'info');
          $('#documentLightbox').modal('hide');
          this.getUsersList();
        }
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al rechazar documento', 'danger');
      }
    }
  }

  /**
   * Update user state
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
        this.getUsersList();
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar estado', 'danger');
      }
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
   */
  public async deleteUser(user: Users, event: any) {
    event.stopPropagation();

    const result = await Swal.fire({
      title: '¿Eliminar usuario?',
      text: `Esta acción no se puede deshacer. Se eliminará a ${user.userName}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await this.usersService.deleteUser(user.userUid);
        this.showNotification('top', 'right', 'nc-check-2', 'Usuario eliminado correctamente', 'success');
        this.getUsersList();
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al eliminar usuario', 'danger');
      }
    }
  }

  /**
   * Update vehicle state con confirmación
   */
  public async updateVehicle(newState: boolean) {
    if (!this.vehicleSelected || !this.user) return;

    const action = newState ? 'activar' : 'desactivar';
    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} vehículo?`,
      text: `Se ${action}á el vehículo ${this.vehicleSelected.vehicleBrandName} ${this.vehicleSelected.vehicleModelName} - ${this.vehicleSelected.vehiclePlateNumber}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: newState ? '#10b981' : '#ef4444',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        this.vehicleSelected.vehicleState = newState;
        if (newState) {
          this.vehicleSelected.vehicleInReview = false;
        }

        await this.usersService.updateVehicleState(this.user.userUid, this.vehicleSelected);
        this.showNotification('top', 'right', 'nc-check-2', `Vehículo ${action}do correctamente`, 'success');
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar vehículo', 'danger');
        // Revertir el estado en caso de error
        this.vehicleSelected.vehicleState = !newState;
      }
    } else {
      // Revertir el estado si se cancela
      this.vehicleSelected.vehicleState = !newState;
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
  public closeProfileModal() {
    $('#modalUserProfile').modal('hide');
    this.user = {};
    this.arrayVehicles = [];
    this.vehicleSelected = {};
  }
}
