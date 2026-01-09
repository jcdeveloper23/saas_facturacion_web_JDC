import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { CountriesService } from 'app/services/countries/countries.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { read, utils, WorkBook, WorkSheet } from 'xlsx';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import * as ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import { LoadingService } from 'app/services/loading/loading.service';
import { Country } from 'app/interfaces/country';
import { Users } from 'app/interfaces/users';

declare var $: any;

@Component({
  selector: 'app-countries',
  templateUrl: './countries.component.html',
  styleUrls: ['./countries.component.css']
})
export class CountriesComponent implements OnInit {

  /// *** Usado para datatables ***
  public dataSource: MatTableDataSource<Country>;
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

  public Editor = ClassicEditor;  // Asegúrate de que el Editor se inicializa correctamente
  public editorConfig = {
    toolbar: ['bold', 'italic', 'underline']
  };
  public arrayCountries: Array<Country> = [];

  public isEdit: boolean = false;
  public country: Country = {};
  data: any[][] = [[1, 2], [3, 4]];

  dropdownList = [];
  selectedItems = [];
  validUsers: Users[] = [];

  public toolbar: ['bold', 'italic', null, 'underline']


  constructor(
    public utilsService: UtilsService,
    public countriesService: CountriesService,
    public loadingService: LoadingService,
  ) { }

  ngOnInit(): void {
    this.loadingService.show('Cargando...');
    this.getCountries();
  }

  public getRequest() {
    // Legacy logic commented out as it references deleted CountriesService methods
    /*
    this.countriesService.getRequest().subscribe(resp => {
      resp.forEach(element => {
        if (element.requestDriverUid != undefined) {
           // Standard logic removed for cleanup
        }
      });
    });
    */
  }


  public getCountries() {
    this.countriesService.getCountries().subscribe(countries => {
      this.arrayCountries = countries;
      console.log(this.arrayCountries);
      this.dataSource = new MatTableDataSource<Country>(countries);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.loadingService.hide();
    });
  }

  public newCountry() {
    this.country = {}
    this.isEdit = false;
    this.country.countryId = new Date().getTime().toString();
    this.country.countryState = true;
    $('#modalNewCountry').modal('show');
  }

  public async saveCountry(isValid: boolean, form: NgForm) {
    if (isValid) {
      if (this.isEdit) {
        this.countriesService.editCountry(this.country).subscribe(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'País editado correctamente', 'success');
          $('#modalNewCountry').modal('hide');
        });
      } else {
        this.countriesService.saveCountry(this.country).subscribe(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'País creado correctamente', 'success');
          form.resetForm();
          $('#modalNewCountry').modal('hide');
        }, (e) => {
          console.log(JSON.stringify(e, null, 3));
        });
      }
    } else {
    }
  }

  editCountry(country: Country) {
    this.isEdit = true;
    this.country = country;
    $('#modalNewCountry').modal('show');
  }

  public cancelViewForm(form: NgForm) {
    form.resetForm();
    $('#modalNewCountry').modal('hide');
  }

  async importUsers
    (evt: any) {
    /* wire up file reader */
    const target: DataTransfer = <DataTransfer>(evt.target);
    if (target.files.length !== 1) throw new Error('Cannot use multiple files');
    const reader: FileReader = new FileReader();
    reader.onload = (e: any) => {
      /* read workbook */
      const ab: ArrayBuffer = e.target.result;
      const wb: WorkBook = read(ab);

      /* grab first sheet */
      const wsname: string = wb.SheetNames[0];
      const ws: WorkSheet = wb.Sheets[wsname];

      /* save data */
      this.data = (utils.sheet_to_json(ws, { header: 1 }));

      this.setData();

    };
    reader.readAsArrayBuffer(target.files[0]);

  }

  setData() {
    this.data.forEach((element, i) => {
      var array = element[1].split(' ');
      var name = '';

      array.forEach((e, ii) => {
        if (ii > 0) name = name + e + ' ';
      });

      element[0] = array[0];
      element[1] = name;
    });
  }

  saveUsersImports() {
    var countryAux: Country = {};
    this.data.forEach((element, i) => {

      if (i > 0) {
        var countryId = `${new Date().getTime().toString()}${i}`;
        countryAux.countryId = countryId;
        countryAux.countryCode = element[0];
        countryAux.countryName = element[1];
        countryAux.countryState = true;

        this.countriesService.saveCountry(countryAux).subscribe(() => { });
      }
    });
  }



  deleteCountry(country: Country) {
    this.countriesService.deleteCountry(country.countryId).subscribe(() => {
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'País eliminado correctamente', 'success');
    });
  }

  onItemSelect(item: any) {
  }
  onSelectAll(items: any) {
  }

}
