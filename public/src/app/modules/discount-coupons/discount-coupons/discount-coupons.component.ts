import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { take } from 'rxjs/operators';
import { Coupon } from 'app/interfaces/coupon';
import { CouponsService } from 'app/services/coupons/coupons.service';
import Swal from 'sweetalert2';
declare var $: any;

import { CityService } from 'app/services/city/city.service';
import { StorageService } from 'app/services/storage/storage.service';

@Component({
  selector: 'app-discount-coupons',
  templateUrl: './discount-coupons.component.html',
  styleUrls: ['./discount-coupons.component.css']
})
export class DiscountCouponsComponent implements OnInit, AfterViewInit {

  // Form and validation
  public isEdit = false;

  // Coupon data
  public coupon: Coupon = {};
  public arrayCoupons: Array<Coupon> = [];
  public filteredCoupons: Array<Coupon> = [];
  public infoUser: any;

  // Catalogs
  public cities: any[] = [];
  public serviceTypes: Categories[] = [];

  // Advanced fields
  public tempCityId: string = '';
  public tempServiceTypeId: string = '';
  public tempUserId: string = '';
  public tempTag: string = '';
  public selectedDays: boolean[] = [false, false, false, false, false, false, false]; // Dom-Sab
  public selectedPrefix: string = ''; // Prefix for code generation

  // Image upload
  public uploadingImage: boolean = false;
  public imagePreview: string | null = null;

  // Prefix options
  public prefixOptions = [
    { value: '', label: 'Sin prefijo' },
    { value: 'IMOVE', label: 'IMOVE (Marca)' },
    { value: 'PROMO', label: 'PROMO (Promoción)' },
    { value: 'DESCUENTO', label: 'DESCUENTO (Descuento)' }
  ];

  // Suggested tags
  public suggestedTags = [
    'navidad',
    'año_nuevo',
    'black_friday',
    'cyber_monday',
    'verano',
    'invierno',
    'fin_de_semana',
    'lunes',
    'martes',
    'miercoles',
    'jueves',
    'viernes',
    'primer_viaje',
    'bienvenida',
    'fidelidad',
    'referido',
    'premium',
    'economico',
    'express',
    'nocturno',
    'diurno',
    'marketing',
    'campaña',
    'promocion'
  ];

  // Suggested coupon names
  public suggestedNames = [
    'Primer viaje gratis',
    '50% de descuento',
    'Bienvenida a iMove',
    'Black Friday',
    'Cyber Monday',
    'Descuento fin de semana',
    'Viernes de descuento',
    'Promoción especial',
    'Descuento Premium',
    'Ahorra en tu viaje',
    'Cupón de fidelidad',
    'Referido especial',
    'Navidad 2024',
    'Año Nuevo 2025',
    'Verano iMove',
    'Descuento nocturno',
    'Express económico'
  ];

  // Emoji options for marketing
  public emojiOptions = [
    { emoji: '🎉', label: 'Celebración' },
    { emoji: '🔥', label: 'Fuego' },
    { emoji: '⭐', label: 'Estrella' },
    { emoji: '💰', label: 'Dinero' },
    { emoji: '🎁', label: 'Regalo' },
    { emoji: '🚗', label: 'Auto' },
    { emoji: '🎊', label: 'Fiesta' },
    { emoji: '💯', label: '100' },
    { emoji: '✨', label: 'Brillos' },
    { emoji: '🎈', label: 'Globo' },
    { emoji: '🌟', label: 'Estrella brillante' },
    { emoji: '🏆', label: 'Trofeo' }
  ];

  // Bulk creation
  public showBulkModal = false;
  public bulkCount: number = 10;
  public bulkPrefix: string = '';
  public bulkTemplate: Coupon = {};

  // Tables
  @ViewChild(MatSort, { static: false }) sort: MatSort;
  @ViewChild('tableCoupons', { static: false }) paginator: MatPaginator;
  public dataSource: MatTableDataSource<Coupon> = new MatTableDataSource<Coupon>([]);
  public displayedColumns: string[] = [
    'couponCode',
    'couponName',
    'discountType',
    'discountValue',
    'usage',
    'validDates',
    'status',
    'actions'
  ];

  // Filters
  public searchTerm: string = '';
  public selectedDiscountType: string = '';
  public selectedStatus: string = '';
  public selectedType: string = '';

  // Stats
  public stats = {
    total: 0,
    active: 0,
    inactive: 0,
    expired: 0,
    totalUsage: 0
  };

  // Discount types
  public discountTypes = [
    { value: '', label: 'Todos' },
    { value: 'percentage', label: 'Porcentaje' },
    { value: 'fixed_amount', label: 'Monto Fijo' }
  ];

  // Coupon types
  public couponTypes = [
    { value: '', label: 'Todos' },
    { value: 'public', label: 'Público' },
    { value: 'private', label: 'Privado' },
    { value: 'automatic', label: 'Automático' }
  ];

  // Status options
  public statusOptions = [
    { value: '', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' },
    { value: 'expired', label: 'Expirados' }
  ];

  // Days of week
  public daysOfWeek = [
    { value: 0, label: 'Domingo', abbr: 'Dom' },
    { value: 1, label: 'Lunes', abbr: 'Lun' },
    { value: 2, label: 'Martes', abbr: 'Mar' },
    { value: 3, label: 'Miércoles', abbr: 'Mié' },
    { value: 4, label: 'Jueves', abbr: 'Jue' },
    { value: 5, label: 'Viernes', abbr: 'Vie' },
    { value: 6, label: 'Sábado', abbr: 'Sáb' }
  ];

  // Hours
  public hours = Array.from({ length: 24 }, (_, i) => ({ value: i, label: `${i.toString().padStart(2, '0')}:00` }));

  constructor(
    private couponsService: CouponsService,
    private cityService: CityService,
    private storageService: StorageService
  ) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem('infoUser'));
    if (this.infoUser) {
      this.loadCoupons();
      this.loadCatalogs();
    }
  }

  /**
   * Load auxiliary catalogs
   */
  public loadCatalogs() {
    // Load Cities
    this.cityService.getCities().pipe(take(1)).subscribe(cities => {
      this.cities = cities || [];
    });

    // Load Service Types
    this.couponsService.getServiceTypes().pipe(take(1)).subscribe(types => {
      this.serviceTypes = types || [];
    });
  }

  ngAfterViewInit(): void {
    if (this.dataSource) {
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    }
  }

  /**
   * Load all coupons
   */
  public loadCoupons() {
    this.couponsService.getAllCoupons().pipe(take(1)).subscribe(
      (coupons) => {
        console.log('Cupones cargados:', coupons);
        console.log(JSON.stringify(coupons, null, 2));
        
        this.arrayCoupons = coupons || [];
        this.filteredCoupons = coupons || [];
        this.calculateStats();
        this.updateDataSource();
      },
      (error) => {
        console.error('Error al cargar cupones:', error);
        this.arrayCoupons = [];
        this.filteredCoupons = [];
        this.calculateStats();
        this.updateDataSource();
      }
    );
  }

  /**
   * Calculate statistics
   */
  private calculateStats() {
    const now = new Date();

    this.stats.total = this.arrayCoupons.length;
    this.stats.active = this.arrayCoupons.filter(c => c.couponIsActive === true).length;
    this.stats.inactive = this.arrayCoupons.filter(c => c.couponIsActive === false).length;
    this.stats.expired = this.arrayCoupons.filter(c => {
      if (!c.couponEndDate) return false;
      const endDate = this.toDate(c.couponEndDate);
      return endDate < now;
    }).length;
    this.stats.totalUsage = this.arrayCoupons.reduce((sum, c) => sum + (c.couponCurrentUses || 0), 0);
  }

  /**
   * Filter coupons
   */
  public filterCoupons() {
    const search = this.searchTerm.toLowerCase().trim();

    this.filteredCoupons = this.arrayCoupons.filter(coupon => {
      // Search filter
      const matchesSearch = !search ||
        coupon.couponCode?.toLowerCase().includes(search) ||
        coupon.couponName?.toLowerCase().includes(search) ||
        coupon.couponDescription?.toLowerCase().includes(search);

      // Discount type filter
      const matchesDiscountType = !this.selectedDiscountType ||
        coupon.couponDiscountType === this.selectedDiscountType;

      // Type filter
      const matchesType = !this.selectedType ||
        coupon.couponType === this.selectedType;

      // Status filter
      let matchesStatus = true;
      if (this.selectedStatus) {
        const now = new Date();
        if (this.selectedStatus === 'active') {
          matchesStatus = coupon.couponIsActive === true &&
            (!coupon.couponEndDate || this.toDate(coupon.couponEndDate) >= now);
        } else if (this.selectedStatus === 'inactive') {
          matchesStatus = coupon.couponIsActive === false;
        } else if (this.selectedStatus === 'expired') {
          matchesStatus = coupon.couponEndDate ? this.toDate(coupon.couponEndDate) < now : false;
        }
      }

      return matchesSearch && matchesDiscountType && matchesType && matchesStatus;
    });

    this.updateDataSource();
  }

  /**
   * Clear all filters
   */
  public clearFilters() {
    this.searchTerm = '';
    this.selectedDiscountType = '';
    this.selectedStatus = '';
    this.selectedType = '';
    this.filterCoupons();
  }

  /**
   * Update data source
   */
  private updateDataSource() {
    this.dataSource = new MatTableDataSource<Coupon>(this.filteredCoupons);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  /**
   * Get discount display text
   */
  public getDiscountDisplay(coupon: Coupon): string {
    if (!coupon.couponDiscountValue) return '-';

    if (coupon.couponDiscountType === 'percentage') {
      return `${coupon.couponDiscountValue}%`;
    } else {
      return `$${coupon.couponDiscountValue}`;
    }
  }

  /**
   * Get usage display
   */
  public getUsageDisplay(coupon: Coupon): string {
    const current = coupon.couponCurrentUses || 0;
    const max = coupon.couponMaxTotalUses;

    return max ? `${current} / ${max}` : `${current}`;
  }

  /**
   * Check if coupon is expired
   */
  public isExpired(coupon: Coupon): boolean {
    if (!coupon.couponEndDate) return false;
    const endDate = this.toDate(coupon.couponEndDate);
    return endDate < new Date();
  }

  /**
   * Get status badge class
   */
  public getStatusClass(coupon: Coupon): string {
    if (this.isExpired(coupon)) return 'badge-danger';
    if (coupon.couponIsActive) return 'badge-success';
    return 'badge-secondary';
  }

  /**
   * Get status text
   */
  public getStatusText(coupon: Coupon): string {
    if (this.isExpired(coupon)) return 'Expirado';
    if (coupon.couponIsActive) return 'Activo';
    return 'Inactivo';
  }

  /**
   * Format date
   */
  public formatDate(date: any): string {
    if (!date) return '-';
    const d = this.toDate(date);
    return d.toLocaleDateString('es-ES');
  }

  /**
   * Convert to Date
   */
  private toDate(date: any): Date {
    if (date?.toDate) return date.toDate();
    if (date instanceof Date) return date;
    return new Date(date);
  }

  /**
   * Open create coupon modal
   */
  public openCreateModal() {
    this.isEdit = false;
    this.coupon = {
      couponIsActive: true,
      couponDiscountType: 'percentage',
      couponType: 'public',
      couponCurrentUses: 0,
      couponMaxUsesPerUser: 1,
      couponValidDaysOfWeek: [],
      couponTags: [],
      couponValidCities: [],
      couponValidServiceTypes: [],
      couponValidUserIds: []
    };

    // Reset temporary fields
    this.selectedDays = [false, false, false, false, false, false, false];
    this.tempCityId = '';
    this.tempServiceTypeId = '';
    this.tempUserId = '';
    this.tempTag = '';
    this.selectedPrefix = '';
    this.imagePreview = null;

    $('#modalCoupon').modal('show');
  }

  /**
   * Open edit coupon modal
   */
  public editCoupon(coupon: Coupon) {
    this.isEdit = true;
    this.coupon = { ...coupon };

    // Convert Dates/Timestamps to string YYYY-MM-DD for input
    if (this.coupon.couponStartDate) {
      const d = this.toDate(this.coupon.couponStartDate);
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      this.coupon.couponStartDate = `${year}-${month}-${day}`;
    }
    if (this.coupon.couponEndDate) {
      const d = this.toDate(this.coupon.couponEndDate);
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      this.coupon.couponEndDate = `${year}-${month}-${day}`;
    }

    // Initialize temporary fields from coupon data
    this.selectedDays = [false, false, false, false, false, false, false];
    if (this.coupon.couponValidDaysOfWeek) {
      this.coupon.couponValidDaysOfWeek.forEach(day => {
        if (day >= 0 && day <= 6) this.selectedDays[day] = true;
      });
    }

    if (!this.coupon.couponTags) this.coupon.couponTags = [];
    if (!this.coupon.couponValidCities) this.coupon.couponValidCities = [];
    if (!this.coupon.couponValidServiceTypes) this.coupon.couponValidServiceTypes = [];
    if (!this.coupon.couponValidUserIds) this.coupon.couponValidUserIds = [];

    // Load image preview if exists
    this.imagePreview = this.coupon.couponImageUrl || null;

    $('#modalCoupon').modal('show');
  }

  /**
   * Save coupon (create or update)
   */
  public async saveCoupon() {
    // Validar campos requeridos
    if (!this.coupon.couponCode || !this.coupon.couponName || !this.coupon.couponDiscountValue) {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Completa todos los campos requeridos', 'warning');
      return;
    }

    // Process selected days
    this.coupon.couponValidDaysOfWeek = [];
    this.selectedDays.forEach((isSelected, index) => {
      if (isSelected) {
        this.coupon.couponValidDaysOfWeek.push(index);
      }
    });

    // Validar y convertir tipos de datos
    if (this.coupon.couponDiscountValue) this.coupon.couponDiscountValue = Number(this.coupon.couponDiscountValue);
    if (this.coupon.couponMaxDiscount) this.coupon.couponMaxDiscount = Number(this.coupon.couponMaxDiscount);
    if (this.coupon.couponMinTripAmount) this.coupon.couponMinTripAmount = Number(this.coupon.couponMinTripAmount);
    if (this.coupon.couponMaxTotalUses) this.coupon.couponMaxTotalUses = Number(this.coupon.couponMaxTotalUses);
    if (this.coupon.couponMaxUsesPerUser) this.coupon.couponMaxUsesPerUser = Number(this.coupon.couponMaxUsesPerUser);

    // Convertir fechas a objetos Date (para que Firestore las guarde como Timestamp)
    if (this.coupon.couponStartDate && typeof this.coupon.couponStartDate === 'string') {
      const parts = (this.coupon.couponStartDate as string).split('-');
      // Crear fecha a las 00:00 del día local
      this.coupon.couponStartDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }

    if (this.coupon.couponEndDate && typeof this.coupon.couponEndDate === 'string') {
      const parts = (this.coupon.couponEndDate as string).split('-');
      // Crear fecha a las 23:59:59 del día local
      this.coupon.couponEndDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59);
    }

    try {
      if (this.isEdit) {
        await this.couponsService.updateCoupon(this.coupon.couponId, this.coupon);
        this.showNotification('top', 'right', 'nc-check-2', 'Cupón actualizado correctamente', 'success');
      } else {
        // Verificar si el código ya existe
        const exists = await this.couponsService.checkCouponCodeExists(this.coupon.couponCode);
        if (exists) {
          this.showNotification('top', 'right', 'nc-alert-circle-i', 'El código del cupón ya existe', 'warning');
          return;
        }

        this.coupon.couponCreatedBy = this.infoUser.userUid;
        await this.couponsService.createCoupon(this.coupon);
        this.showNotification('top', 'right', 'nc-check-2', 'Cupón creado correctamente', 'success');
      }

      $('#modalCoupon').modal('hide');
      this.loadCoupons();
    } catch (error) {
      console.error(error);
      this.showNotification('top', 'right', 'nc-simple-remove', 'Error al guardar el cupón', 'danger');
    }
  }

  // ==================== TAGS MANAGEMENT ====================

  public addTag() {
    if (this.tempTag && this.tempTag.trim() !== '') {
      if (!this.coupon.couponTags) this.coupon.couponTags = [];
      if (!this.coupon.couponTags.includes(this.tempTag.trim())) {
        this.coupon.couponTags.push(this.tempTag.trim());
      }
      this.tempTag = '';
    }
  }

  public removeTag(index: number) {
    if (this.coupon.couponTags) {
      this.coupon.couponTags.splice(index, 1);
    }
  }

  public addSuggestedTag(tag: string) {
    if (!this.coupon.couponTags) this.coupon.couponTags = [];
    if (!this.coupon.couponTags.includes(tag)) {
      this.coupon.couponTags.push(tag);
    }
  }

  // ==================== LISTS MANAGEMENT ====================

  public addItem(listName: 'couponValidCities' | 'couponValidServiceTypes' | 'couponValidUserIds', value: string) {
    if (value && value.trim() !== '') {
      if (!this.coupon[listName]) this.coupon[listName] = [];
      if (!this.coupon[listName].includes(value.trim())) {
        this.coupon[listName].push(value.trim());
      }
    }
  }

  public removeItem(listName: 'couponValidCities' | 'couponValidServiceTypes' | 'couponValidUserIds', index: number) {
    if (this.coupon[listName]) {
      this.coupon[listName].splice(index, 1);
    }
  }

  public addTempItem(type: 'city' | 'service' | 'user') {
    if (type === 'city') {
      this.addItem('couponValidCities', this.tempCityId);
      this.tempCityId = '';
    } else if (type === 'service') {
      this.addItem('couponValidServiceTypes', this.tempServiceTypeId);
      this.tempServiceTypeId = '';
    } else if (type === 'user') {
      this.addItem('couponValidUserIds', this.tempUserId);
      this.tempUserId = '';
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Get city name by ID
   */
  public getCityName(cityId: string): string {
    const city = this.cities.find(c => c.cityId === cityId);
    return city ? city.cityName : cityId;
  }

  /**
   * Get service name by ID
   */
  public getServiceName(serviceId: string): string {
    const service = this.serviceTypes.find(s => s.categoriesId === serviceId);
    return service ? (service.categoriesName || serviceId) : serviceId;
  }

  /**
   * Toggle coupon status
   */
  public async toggleStatus(coupon: Coupon) {
    const newStatus = !coupon.couponIsActive;
    const action = newStatus ? 'activar' : 'desactivar';

    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} cupón?`,
      text: `Se ${action}á el cupón ${coupon.couponCode}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: newStatus ? '#10b981' : '#6b7280',
      cancelButtonColor: '#6c757d',
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await this.couponsService.toggleCouponStatus(coupon.couponId, newStatus);
        this.showNotification('top', 'right', 'nc-check-2', `Cupón ${action}do correctamente`, 'success');
        this.loadCoupons();
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al cambiar estado', 'danger');
      }
    }
  }

  /**
   * Delete coupon
   */
  public async deleteCoupon(coupon: Coupon) {
    const result = await Swal.fire({
      title: '¿Eliminar cupón?',
      text: `Esta acción no se puede deshacer. Se eliminará el cupón ${coupon.couponCode}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await this.couponsService.deleteCoupon(coupon.couponId);
        this.showNotification('top', 'right', 'nc-check-2', 'Cupón eliminado correctamente', 'success');
        this.loadCoupons();
      } catch (error) {
        this.showNotification('top', 'right', 'nc-simple-remove', 'Error al eliminar cupón', 'danger');
      }
    }
  }

  /**
   * Generate random coupon code
   */
  public generateCode() {
    const prefix = this.selectedPrefix || undefined;
    this.coupon.couponCode = this.couponsService.generateCouponCode(8, prefix);
  }

  /**
   * Handle image file selection
   */
  public async onImageSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Por favor selecciona una imagen válida', 'warning');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'La imagen no debe superar 2MB', 'warning');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.imagePreview = e.target.result;
    };
    reader.readAsDataURL(file);

    // Upload to Firebase Storage
    await this.uploadCouponImage(file);
  }

  /**
   * Upload coupon image to Firebase Storage
   */
  private async uploadCouponImage(file: File) {
    try {
      this.uploadingImage = true;
      const timestamp = new Date().getTime();
      const fileName = `coupons/${timestamp}_${file.name}`;

      const downloadURL = await this.storageService.uploadFile(fileName, file);
      this.coupon.couponImageUrl = downloadURL;

      this.showNotification('top', 'right', 'nc-check-2', 'Imagen cargada correctamente', 'success');
    } catch (error) {
      console.error('Error uploading image:', error);
      this.showNotification('top', 'right', 'nc-simple-remove', 'Error al cargar la imagen', 'danger');
    } finally {
      this.uploadingImage = false;
    }
  }

  /**
   * Remove coupon image
   */
  public async removeCouponImage() {
    if (this.coupon.couponImageUrl) {
      try {
        await this.storageService.deleteFileByURL(this.coupon.couponImageUrl);
        this.coupon.couponImageUrl = undefined;
        this.imagePreview = null;
        this.showNotification('top', 'right', 'nc-check-2', 'Imagen eliminada', 'success');
      } catch (error) {
        console.error('Error deleting image:', error);
        // Even if delete fails, clear the reference
        this.coupon.couponImageUrl = undefined;
        this.imagePreview = null;
      }
    }
  }

  /**
   * Close modal
   */
  public closeModal() {
    $('#modalCoupon').modal('hide');
    this.coupon = {};
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
}
