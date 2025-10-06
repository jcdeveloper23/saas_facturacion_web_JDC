import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { CategoriesService } from 'app/services/categories/categories.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { StorageService } from 'app/services/storage/storage.service';
import { UtilsService } from 'app/services/utils/utils.service';
import Swal from 'sweetalert2';
import { read, utils, WorkBook, WorkSheet } from 'xlsx';
import * as XLSX from 'xlsx';
declare var $: any;

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.css']
})
export class CategoriesComponent implements OnInit {

  /// *** Usado para datatables ***
  public dataSource: MatTableDataSource<Categories>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableProviders") paginator: MatPaginator;
  public displayedColumns: string[] = [
    "code",
    "name",
    "description",
    "status",
    "statusCange",
    "edit",
    "delete",
  ];
  /// *** #Usado para datatables ***
  public arrayCategory: Array<Categories> = [];


  public isEdit: boolean = false;
  public categories: Categories = {
    categoriesIsMain: false,
  };

  public previewImage: any = null;
  public fileDataImage: File = null;
  public viewAll: boolean = false;

  constructor(
    public utilsService: UtilsService,
    public categoriesService: CategoriesService,
    private storageService: StorageService,
    public loadingService: LoadingService,

  ) { }

  ngOnInit(): void {
    this.selectedOnlyMain(true);
    // this.getCategories();
  }

  public getCategories() {
    this.categoriesService.getCategories().subscribe(categories => {
      this.arrayCategory = categories;
      console.log(JSON.stringify(this.arrayCategory, null, 3));
      this.arrayCategory = categories;
      console.log(this.arrayCategory);
      this.dataSource = new MatTableDataSource<Categories>(categories);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.loadingService.hide()
    });
  }


  public newCategories() {
    this.categories = {}
    this.isEdit = false;
    this.categories.categoriesId = new Date().getTime().toString();
    this.categories.categoriesCode = `0${(this.arrayCategory.length + 1).toString()}`;
    this.categories.categoriesState = true;
    $('#modalNewCategories').modal('show');
  }


  public async saveCategories(isValid: boolean, form: NgForm) {
    if (isValid) {

      Swal.fire({
        title: "Espere por favor",
        html: "Estamos procesando la información",
        timerProgressBar: true,
        allowOutsideClick: false, // Deshabilita el cierre al hacer clic fuera
        allowEscapeKey: false,   // Deshabilita el cierre con la tecla Escape
        showConfirmButton: false, // Oculta el botón de confirmación
        didOpen: () => {
          Swal.showLoading();
          const timer = Swal.getPopup().querySelector("b");
        },
        willClose: () => {
        }
      }).then((result) => {
        /* Read more about handling dismissals below */
        if (result.dismiss === Swal.DismissReason.timer) {
        }
      });

      if (this.fileDataImage) {
        await this.storageService.uploadFile(`categories/category-${this.categories.categoriesId}/img-${this.categories.categoriesId}.png`, this.fileDataImage).then((result) => {
          this.categories.categoriesIcon = result;
        }).catch((e) => {
          console.log(JSON.stringify(e, null, 3));
        })
      }

      if (this.isEdit) {
        this.categoriesService.editCategories(this.categories).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría editada correctamente', 'success');
          $('#modalNewCategories').modal('hide');
        })
        Swal.close();
      } else {
        this.categories.categoriesDateRegister = this.utilsService.getDateCurrent();
        this.categories.categoriesTimeRegister = this.utilsService.getTimeCurrent();

        this.categoriesService.saveCategories(this.categories).then(() => {

          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría creada correctamente', 'success');
          form.resetForm();
          $('#modalNewCategories').modal('hide');
        }).catch((e) => {
          console.log(JSON.stringify(e, null, 3));
        });
      }
      Swal.close();
    } else {
    }
  }

  editCategories(categories: Categories) {
    this.isEdit = true;
    this.categories = categories;
    $('#modalNewCategories').modal('show');
  }

  importCategories() {
    $('#modalImport').modal('show');
  }

  public cancelViewForm(form: NgForm) {
    form.resetForm();
    $('#modalNewCategories').modal('hide');
  }

  deleteCategories(categories: Categories) {
    this.categoriesService.deleteCategories(categories.categoriesId).then(() => {
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría - eliminado correctamente', 'success');
    });
  }


  /**
   * Metodo para obtener el archivo de imagen seleccinado.
   * @param fileInput
   */
  public fileProgress(fileInput: any) {
    this.fileDataImage = (<File>fileInput.target.files[0]);
    this.previewUrlImage()
  }

  /**
   * Metodo para visualizar imagen previa.
   * @returns
   */
  private previewUrlImage() {
    let mimeType = this.fileDataImage.type;
    if (mimeType.match(/image\/*/) == null) {
      return;
    }
    let reader = new FileReader();
    reader.readAsDataURL(this.fileDataImage);
    reader.onload = (_event) => {
      this.previewImage = reader.result;
    }
  }

  selectedOnlyMain(categoriesIsMain) {
    console.log(categoriesIsMain);
    if (categoriesIsMain) {
      this.getCategoriesMain(categoriesIsMain);
    } else {
      this.getCategories();
    }
  }

  public getCategoriesMain(categoriesIsMain) {
    this.categoriesService.getCategoriesMain(categoriesIsMain).subscribe(categories => {
      console.log(JSON.stringify(this.arrayCategory, null, 3));
      this.arrayCategory = categories;
      console.log(this.arrayCategory);
      this.dataSource = new MatTableDataSource<Categories>(categories);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.loadingService.hide()
    });
  }

  importData() {
    $('#modalImportCategory').modal('show');
  }

  readExcel(event: any): void {
    const file = event.target.files[0];

    if (file) {
      const reader: FileReader = new FileReader();

      reader.onload = (e: any) => {
        const data: Uint8Array = new Uint8Array(e.target.result);
        const workbook: XLSX.WorkBook = XLSX.read(data, { type: 'array' });

        const firstSheetName: string = workbook.SheetNames[1];
        const worksheet: XLSX.WorkSheet = workbook.Sheets[firstSheetName];

        const allRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Omitimos la primera fila (encabezados)
        // this.dataSource = allRows.slice(1);
      };

      reader.readAsArrayBuffer(file);
    }
  }

  // saveDataImports() {
  //   var categoriesAux: Categories = {};
  //   this.data.forEach((element, i) => {

  //     var categoriesId = `${new Date().getTime().toString()}${i}`;
  //     var categoriesDateRegister = this.utilsService.getDateCurrent();
  //     var categoriesTimeRegister = this.utilsService.getTimeCurrent();
  //     categoriesAux.categoriesId = categoriesId;
  //     categoriesAux.categoriesCode = categoriesId;
  //     categoriesAux.categoriesIcon = '';
  //     categoriesAux.categoriesDateRegister = categoriesDateRegister;
  //     categoriesAux.categoriesTimeRegister = categoriesTimeRegister;
  //     categoriesAux.categoriesParent = element[0];
  //     categoriesAux.categoriesParentName = element[1];
  //     categoriesAux.categoriesName = element[2];
  //     categoriesAux.categoriesDescription = element[3];
  //     categoriesAux.categoriesState = true;
  //     categoriesAux.categoriesIsMain = false;
  //     categoriesAux.categoriesIsPremium = false;

  //     console.log(JSON.stringify(categoriesAux, null, 3));

  //     this.categoriesService.saveCategories(categoriesAux).then(() => { });
  //   });
  // }

  onPremiumChange(value: boolean, categories) {
    console.log('Nuevo valor de premium:', value, categories);
    this.categoriesService.editCategories(categories).then(() => {
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría editada correctamente', 'success');
    })
  }

}
