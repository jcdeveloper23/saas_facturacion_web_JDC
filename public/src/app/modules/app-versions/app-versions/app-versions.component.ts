import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { AppVersionsService } from 'app/services/appVersions/app-versions.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { UtilsService } from 'app/services/utils/utils.service';
declare var $: any;

@Component({
  selector: 'app-app-versions',
  templateUrl: './app-versions.component.html',
  styleUrls: ['./app-versions.component.css']
})
export class AppVersionsComponent implements OnInit {

public arrayInstruction: Array<AppVersions> = [];

  /// *** Usado para datatables ***
  public dataSource: MatTableDataSource<AppVersions>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableProviders") paginator: MatPaginator;
  public displayedColumns: string[] = [
    "code",
    "name",
    "phone",
    "so",
    "status",
    "edit",
    "delete",
  ];
  /// *** #Usado para datatables ***


  public isEdit: boolean = false;
  public appVersions: AppVersions = {};

  dropdownList = [];
  selectedItems = [];


  constructor(
    public utilsService: UtilsService,
    public appVersionsService: AppVersionsService,
    public loadingService: LoadingService,
  ) { }

  ngOnInit(): void {
    this.loadingService.show('Cargando');
    this.getAppVersions();
  }

  public getAppVersions() {
    this.appVersionsService.getAppVersions().subscribe(appVersions => {
      this.arrayInstruction = appVersions;
      console.log(JSON.stringify(this.arrayInstruction, null, 3));
      if (appVersions && appVersions.length > 0) {
        this.arrayInstruction = appVersions;
        this.dataSource = new MatTableDataSource<AppVersions>(appVersions);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loadingService.hide();
      } else {
        this.arrayInstruction = []
        this.dataSource = new MatTableDataSource<AppVersions>(this.arrayInstruction);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loadingService.hide();
      }
    });
  }

  public newAppVersions() {
    this.appVersions = {}
    this.isEdit = false;
    this.appVersions.appVersionsId = new Date().getTime().toString();
    this.appVersions.appVersionsState = true;
    $('#modalNewAppVersions').modal('show');
  }


  public async saveAppVersions(isValid: boolean, form: NgForm) {
    if (isValid) {
      if (this.isEdit) {
        this.appVersions.appVersionsReleaseDate = `${this.utilsService.getDateCurrent()} - ${this.utilsService.getTimeCurrent()}`

        this.appVersionsService.editAppVersions(this.appVersions).then(() => {


          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Data editada correctamente', 'success');
          $('#modalNewAppVersions').modal('hide');
        })
      } else {
        this.appVersions.appVersionsReleaseDate = `${this.utilsService.getDateCurrent()} - ${this.utilsService.getTimeCurrent()}`
        this.appVersionsService.saveAppVersions(this.appVersions).then(() => {


          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Data procesada correctamente', 'success');
          form.resetForm();
          $('#modalNewAppVersions').modal('hide');
        }).catch((e) => {
          console.log(JSON.stringify(e, null, 3));
        });
      }
    } else {
    }
  }

  editAppVersions(appVersions: AppVersions) {
    this.isEdit = true;
    this.appVersions = appVersions;
    $('#modalNewAppVersions').modal('show');
  }

  importAppVersions() {
    $('#modalImport').modal('show');
  }

  public cancelViewForm(form: NgForm) {
    form.resetForm();
    $('#modalNewAppVersions').modal('hide');
  }

  deleteAppVersions(appVersions: AppVersions) {
    this.appVersionsService.deleteAppVersions(appVersions.appVersionsId).then(() => {
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Data eliminada correctamente', 'success');
    });
  }

}
