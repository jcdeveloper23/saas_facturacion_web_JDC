import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { CityService } from 'app/services/city/city.service';
import { CountriesService } from 'app/services/countries/countries.service';
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

  constructor(
    public utilsService: UtilsService,
    public cityService: CityService,
    public loadingService: LoadingService,
    public countriesService: CountriesService,

  ) {
  }

  ngOnInit(): void {
    this.loadingService.show('Cargando...');
    this.getCities();
    this.getCountries();
  }

  public getCities() {
    this.cityService.getCities().subscribe(cities => {
      this.arrayCities = cities;
      console.log(this.arrayCities);
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

  public newCity() {
    this.city = {}
    this.isEdit = false;
    this.city.cityId = new Date().getTime().toString();
    this.city.cityState = true;
    $('#modalNewCity').modal('show');
  }

  public async saveCity(isValid: boolean, form: NgForm) {
    if (isValid) {
      if (this.isEdit) {
        this.cityService.editCity(this.city).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'País editado correctamente', 'success');
          $('#modalNewCity').modal('hide');
        })
      } else {
        this.cityService.saveCity(this.city).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'País creado correctamente', 'success');
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
    this.city = city;
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
  onMapClick(e) {
    console.log(JSON.stringify(e, null, 3));

    // this.cityForm.get('cityLat').setValue(e.coords.lat);
    // this.cityForm.get('cityLng').setValue(e.coords.lng);
    this.city.cityLat = e.coords.lat;
    this.city.cityLng = e.coords.lng;
  }

}
