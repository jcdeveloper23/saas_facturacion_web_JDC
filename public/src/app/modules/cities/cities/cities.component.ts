import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { CityService } from 'app/services/city/city.service';
import { CountriesService } from 'app/services/countries/countries.service';
import { CategoriesService } from 'app/services/categories/categories.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { UtilsService } from 'app/services/utils/utils.service';
import Swal from 'sweetalert2';

declare const $: any;

@Component({
  selector: 'app-cities',
  templateUrl: './cities.component.html',
  styleUrls: ['./cities.component.css']
})
export class CitiesComponent implements OnInit {

  /// *** Usado para datatables ***
  public dataSource: MatTableDataSource<City>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableProviders") paginator: MatPaginator;
  public displayedColumns: string[] = [
    "code",
    "name",
    "phone",
    "currency",
    "services",
    "coverage",
    "status",
    "edit",
    "delete",
  ];
  /// *** #Usado para datatables ***

  public arrayCities: City[] = [];
  public city: City = {
    cityLat: 7.7677778,
    cityLng: -72.234686
  };
  public isEdit: boolean;
  public isLoading: boolean;

  public arrayCountries: Array<Country> = [];
  public country: Country = {};

  public arrayServices: Categories[] = [];
  public selectedServices: ServicePricing[] = [];

  constructor(
    public utilsService: UtilsService,
    public cityService: CityService,
    public loadingService: LoadingService,
    public countriesService: CountriesService,
    public categoriesService: CategoriesService,

  ) {
  }

  ngOnInit(): void {
    this.loadingService.show('Cargando...');
    this.getCities();
    this.getCountries();
    this.getServices();
  }

  public getCities() {
    this.cityService.getCities().subscribe(cities => {
      this.arrayCities = cities;
      console.log(JSON.stringify(this.arrayCities, null, 3));
      this.dataSource = new MatTableDataSource<City>(cities);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.loadingService.hide();
    });
  }

  public getCountries() {
    this.countriesService.getCountries().subscribe(countries => {
      this.arrayCountries = countries;
      console.log(this.arrayCountries);
      this.loadingService.hide();
    });
  }

  public getServices() {
    this.categoriesService.getCategoriesByType('service').subscribe(services => {
      this.arrayServices = services;
      console.log('Servicios cargados:', this.arrayServices);
      this.loadingService.hide();
    });
  }

  public newCity() {
    this.city = {
      cityLat: 7.7677778,
      cityLng: -72.234686,
      cityServicePricing: []
    }
    this.isEdit = false;
    this.city.cityId = new Date().getTime().toString();
    this.city.cityState = true;
    this.city.cityRegisterDate = new Date().toISOString();
    $('#modalNewCity').modal('show');
  }

  public async saveCity(isValid: boolean, form: NgForm) {
    if (isValid) {
      // Filter only active services and update category data before saving
      if (this.city.cityServicePricing) {
        this.city.cityServicePricing = this.city.cityServicePricing.filter(s => s.isActive).map(service => {
          const category = this.arrayServices.find(c => c.categoriesId === service.serviceTypeId);
          if (category) {
            // Always use latest values from category for these fields
            service.serviceIcon = category.categoriesIcon;
            service.serviceNumberOfPassengers = category.categoriesNumberOfPassengers;
            service.serviceNumberOfLuggage = category.categoriesNumberOfLuggage;
            service.serviceTypeName = category.categoriesName;
          }
          return service;
        });
      }

      if (this.isEdit) {
        this.city.cityUpdatedAt = new Date().toISOString();
        this.cityService.editCity(this.city).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Ciudad editada correctamente', 'success');
          $('#modalNewCity').modal('hide');
        })
      } else {
        this.city.cityRegisterDate = new Date().toISOString();
        this.cityService.saveCity(this.city).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Ciudad creada correctamente', 'success');
          form.resetForm();
          $('#modalNewCity').modal('hide');
        }).catch((e) => {
          console.log(JSON.stringify(e, null, 3));
        });
      }
    } else {
    }
  }

  editCity(city: City) {
    this.isEdit = true;
    this.city = { ...city };
    // Ensure cityServicePricing is initialized
    if (!this.city.cityServicePricing) {
      this.city.cityServicePricing = [];
    }
    $('#modalNewCity').modal('show');
  }

  public cancelViewForm(form: NgForm) {
    form.resetForm();
    $('#modalNewCity').modal('hide');
  }


  /**
   * set selected city with table info
   * @param city
   * */
  setSelectedCity(city: City) {
    this.isEdit = true;
    this.city = city;
  }


  /**
   * on Map click event
   * @param e
   */
  onMapClick(e: any) {
    console.log(JSON.stringify(e, null, 3));

    // this.cityForm.get('cityLat').setValue(e.coords.lat);
    // this.cityForm.get('cityLng').setValue(e.coords.lng);
    this.city.cityLat = e.coords.lat;
    this.city.cityLng = e.coords.lng;
  }

  /**
   * Check if a service is active in the city
   * @param serviceId
   */
  isServiceActive(serviceId: string): boolean {
    if (!this.city.cityServicePricing) {
      return false;
    }
    const service = this.city.cityServicePricing.find(s => s.serviceTypeId === serviceId);
    return service ? service.isActive : false;
  }

  /**
   * Get service pricing by serviceId
   * @param serviceId
   */
  getServicePricing(serviceId: string): ServicePricing {
    if (!this.city.cityServicePricing) {
      this.city.cityServicePricing = [];
    }
    let service = this.city.cityServicePricing.find(s => s.serviceTypeId === serviceId);
    const category = this.arrayServices.find(s => s.categoriesId === serviceId);

    if (!service) {
      service = {
        serviceTypeId: serviceId,
        serviceTypeName: category ? category.categoriesName : '',
        serviceIcon: category ? category.categoriesIcon : '',
        serviceNumberOfPassengers: category ? category.categoriesNumberOfPassengers : 1,
        serviceNumberOfLuggage: category ? category.categoriesNumberOfLuggage : 0,
        basePrice: 0,
        pricePerKm: 0,
        minimumDistanceIncluded: 0,
        priceRanges: [],
        pricePerMinute: 0,
        nightSurchargePercent: 0,
        nightSurchargeStartHour: '22:00',
        nightSurchargeEndHour: '06:00',
        isActive: false
      };
      this.city.cityServicePricing.push(service);
    } else {
      // Always update icon, passengers and luggage from category
      if (category) {
        service.serviceIcon = category.categoriesIcon;
        service.serviceNumberOfPassengers = category.categoriesNumberOfPassengers;
        service.serviceNumberOfLuggage = category.categoriesNumberOfLuggage;
        service.serviceTypeName = category.categoriesName;
      }
    }
    return service;
  }

  /**
   * Toggle service activation
   * @param serviceId
   */
  toggleServiceActive(serviceId: string) {
    const service = this.getServicePricing(serviceId);
    service.isActive = !service.isActive;
  }

  /**
   * Count active services for a city
   * @param city
   */
  countActiveServices(city: City): number {
    if (!city.cityServicePricing) {
      return 0;
    }
    return city.cityServicePricing.filter(s => s.isActive).length;
  }

  /**
   * Add a new price range to a service
   * @param serviceId
   */
  addPriceRange(serviceId: string) {
    const service = this.getServicePricing(serviceId);
    if (!service.priceRanges) {
      service.priceRanges = [];
    }

    // Get the last range to suggest next values
    const lastRange = service.priceRanges[service.priceRanges.length - 1];
    const newMinKm = lastRange ? lastRange.maxKm : 0;

    service.priceRanges.push({
      minKm: newMinKm,
      maxKm: newMinKm + 10,
      pricePerKm: 0,
      description: ''
    });
  }

  /**
   * Remove a price range from a service
   * @param serviceId
   * @param index
   */
  removePriceRange(serviceId: string, index: number) {
    const service = this.getServicePricing(serviceId);
    if (service.priceRanges && service.priceRanges.length > index) {
      service.priceRanges.splice(index, 1);
    }
  }

  /**
   * Get price ranges for a service
   * @param serviceId
   */
  getPriceRanges(serviceId: string): PriceRange[] {
    const service = this.getServicePricing(serviceId);
    return service.priceRanges || [];
  }

  /**
   * Delete a city
   * @param city
   */
  deleteProvider(city: City) {
    Swal.fire({
      title: '¿Estás seguro?',
      text: `Estás a punto de eliminar la ciudad: ${city.cityName}. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.loadingService.show('Eliminando ciudad...');
        this.cityService.deleteCity(city.cityId).then(() => {
          this.loadingService.hide();
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Ciudad eliminada correctamente', 'success');
        }).catch((error) => {
          this.loadingService.hide();
          console.error('Error al eliminar ciudad:', error);
          this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Error al eliminar la ciudad', 'danger');
        });
      }
    });
  }

}
