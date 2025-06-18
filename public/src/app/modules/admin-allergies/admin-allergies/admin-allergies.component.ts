import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { AllergiesService } from 'app/services/allergies/allergies.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { read } from 'fs';
import { utils } from 'protractor';
import { WorkBook, WorkSheet } from 'xlsx';
declare var $: any;

@Component({
  selector: 'app-admin-allergies',
  templateUrl: './admin-allergies.component.html',
  styleUrls: ['./admin-allergies.component.css']
})
export class AdminAllergiesComponent implements OnInit {

  /// *** Usado para datatables ***
  public dataSource: MatTableDataSource<Allergies>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableAllegies") paginator: MatPaginator;
  public displayedColumns: string[] = [
    "code",
    "name",
    "phone",
    "status",
    "edit",
    "delete",
  ];
  /// *** #Usado para datatables ***

  public arrayAllergies: Array<Allergies> = [];

  public isEdit: boolean = false;
  public allergies: Allergies = {};
  data: any[][] = [[1, 2], [3, 4]];

  dropdownList = [];
  selectedItems = [];

  constructor(
    public utilsService: UtilsService,
    public allergiesService: AllergiesService,
    public loadingService: LoadingService,

  ) { }

  ngOnInit(): void {
    this.loadingService.show('Cargando...');
    this.getAllergies();
  }


  public getAllergies() {
    console.log('*** getAllergies ***');

    this.allergiesService.getAllergies().subscribe(allergies => {
      this.arrayAllergies = allergies;
      console.log(this.arrayAllergies);
      this.dataSource = new MatTableDataSource<Allergies>(allergies);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.loadingService.hide();
    });
  }

  public newAllergies() {
    this.allergies = {}
    this.isEdit = false;
    this.allergies.allergiesId = new Date().getTime().toString();
    this.allergies.allergiesState = true;
    $('#modalNewAllergies').modal('show');
  }


  public async saveAllergies(isValid: boolean, form: NgForm) {
    if (isValid) {
      if (this.isEdit) {

        this.allergiesService.editAllergies(this.allergies).then(() => {

          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Alergia editada correctamente', 'success');
          $('#modalNewAllergies').modal('hide');
        })
      } else {
        this.allergiesService.saveAllergies(this.allergies).then(() => {

          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Alergia creada correctamente', 'success');
          form.resetForm();
          $('#modalNewAllergies').modal('hide');
        }).catch((e) => {
          console.log(JSON.stringify(e, null, 3));
        });
      }
    } else {
    }
  }

  editAllergies(allergies: Allergies) {
    this.isEdit = true;
    this.allergies = allergies;
    $('#modalNewAllergies').modal('show');
  }

  public cancelViewForm(form: NgForm) {
    form.resetForm();
    $('#modalNewAllergies').modal('hide');
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

  addAllAlergies() {

    var cont = 0;
    this.allergiesData.forEach(async (element: string) => {
      cont++;
      const allergy: Allergies = {
        allergiesId: (new Date().getTime() + cont).toString(),
        allergiesName: element,
        allergiesState: true
      };

      console.log(allergy);
      await this.allergiesService.saveAllergies(allergy).then(() => {

        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Alergia creada correctamente', 'success');
        setTimeout(() => {

        }, 2500);
      }).catch((e) => {
        console.log(JSON.stringify(e, null, 3));
      });

      // Optionally, save or process the allergy object here
    });
  }

  saveUsersImports() {
    var allergiesAux: Allergies = {};
    this.data.forEach((element, i) => {

      if (i > 0) {
        var allergiesId = `${new Date().getTime().toString()}${i}`;
        allergiesAux.allergiesId = allergiesId;
        allergiesAux.allergiesCode = element[0];
        allergiesAux.allergiesName = element[1];
        allergiesAux.allergiesState = true;

        this.allergiesService.saveAllergies(allergiesAux).then(() => { });
      }
    });
  }



  deleteAllergies(allergies: Allergies) {
    this.allergiesService.deleteAllergies(allergies.allergiesId).then(() => {
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Alergia eliminada correctamente', 'success');
    });
  }

  onItemSelect(item: any) {
  }
  onSelectAll(items: any) {
  }

  public allergiesData =
    [
      "Apanadura",
      "Carne de cerdo y derivados",
      "Carne de pavo",
      "Carne de pollo",
      "Carnes rojas",
      "Cereza",
      "Colorante azul",
      "Colorante rojo",
      "Colorantes",
      "Crema de leche",
      "Embutidos",
      "Frutos secos",
      "Garbanzo",
      "Gluten",
      "Granadilla",
      "Guayaba",
      "Habas",
      "Habichuelas",
      "Huevos",
      "Jamaica",
      "Lactosa",
      "Lechuga",
      "Maní",
      "Manzanilla",
      "Mariscos",
      "Mayonesa",
      "Miel de abeja",
      "Mostaza",
      "Mote",
      "Pescados",
      "Piña",
      "Remolacha",
      "Salsa de tomate",
      "Sandía",
      "Soja",
      "Soya",
      "Tomate de árbol",
      "Trigo"
    ]
}

