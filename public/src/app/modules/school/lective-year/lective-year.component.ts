import {Component, Input, OnInit, ViewChild} from '@angular/core';
import {MatTableDataSource} from '@angular/material/table';
import {LectiveYear} from '../../../interfaces/lective_year';
import {MatSort} from '@angular/material/sort';
import {MatPaginator} from '@angular/material/paginator';
import {LectiveYearService} from '../../../services/lective-year/lective-year.service';
import {UtilsService} from '../../../services/utils/utils.service';
import {NgForm} from '@angular/forms';
import Swal from 'sweetalert2';
import {School} from '../../../interfaces/school';

declare var $: any;
@Component({
  selector: 'app-lective-year',
  templateUrl: './lective-year.component.html',
  styleUrls: ['./lective-year.component.css']
})
export class LectiveYearComponent implements OnInit {
  @Input() schoolR: School;
  public dataSource: MatTableDataSource<LectiveYear>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('tableLectiveYears') paginator: MatPaginator;
  public lectiveYears: LectiveYear[] = [];
  public lectiveYear: LectiveYear = {};
  public isEdit: boolean;
  public displayedColumns: string[] = [
    'code',
    'name',
    'initDate',
    'endDate',
    'edit',
    'delete',
  ];
  selectedSchool: School;

  constructor(public lectiveService: LectiveYearService,
              public utilsService: UtilsService, ) { }

  ngOnInit(): void {
    this.selectedSchool = this.schoolR;
    this.getAllLectiveYears();
  }

  /**
   * Function obtiene la coleccion de años lectivos
   * */
  public async getAllLectiveYears() {
    this.lectiveYears = [];
    const resp = await this.lectiveService.getAllLectiveYearFromSchool(this.selectedSchool.school_id).toPromise();
    resp.docs.forEach((year) => {
      this.lectiveYears.push(year.data());
    });
    console.log(this.lectiveYears);
    this.dataSource = new MatTableDataSource<any>(this.lectiveYears);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  /**
   * *** Para iniciar la creacion del nuevo año lectivo ***
   * *** Editar = false ***
   * *** Moastramos el formulario ***
   * *** Creamos e nuevo id ***
   */
  public newLectiveYear() {
    this.lectiveYear = {}
    this.isEdit = false;
    $('#multiCollapseLectiveYear').collapse('show');
    this.lectiveYear.lective_year_id = new Date().getTime().toString();
  }

  /**
   * Dejar de visualizar formulario
   */
  public cancelViewForm() {
    $('#multiCollapseLectiveYear').collapse('hide');
  }

  /**
   * *** Function para filtar en data table ***
   * @param event
   */
  public applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  /**
   * Metodo para registrar o actualizar un nuevo año lectivo.
   * @param lectiveYear
   * @param isValid
   */
  public async saveLectiveYear(isValid: boolean, form: NgForm) {
    if (isValid) {
      if (this.isEdit) {
        this.lectiveService.editLectiveYear(this.lectiveYear, this.selectedSchool.school_id).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getAllLectiveYears();
          form.resetForm()
          $('#multiCollapseLectiveYear').collapse('hide');
        });
      } else {
        this.lectiveService.saveLectiveYear(this.lectiveYear, this.selectedSchool.school_id).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getAllLectiveYears()
          form.resetForm()
          $('#multiCollapseLectiveYear').collapse('hide');
        });
      }
    }
  }

  /**
   * Metodo para visualizar formulario y asignar la linea a editar a la variable line
   * @param school
   */
  public editLectiveYear(lectiveYear: LectiveYear) {
    this.isEdit = true;
    this.lectiveYear = lectiveYear;
    $('#multiCollapseLectiveYear').collapse('show');
  }

  /**
   * *** Elimina unidad educativa ***
   * @param school
   */
  public deleteLectiveYear(lectiveYear: LectiveYear) {
    if (this.lectiveYears.length > 1) {
      Swal.fire({
        text: '¿Confirma que desea eliminar el año lectivo seleccionado?',
        icon: 'warning',
        showCancelButton: true,
        customClass: {
          confirmButton: 'btn btn-success',
          cancelButton: 'btn btn-danger',
        },
        confirmButtonText: 'Sí, eliminar!',
        buttonsStyling: false
      }).then(async (result) => {
        if (result.value) {
          this.lectiveService.deleteLectiveYear(lectiveYear, this.selectedSchool.school_id);
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se eliminó correctamente el año lectivo.', 'success');
          this.getAllLectiveYears();
        }
      })
    } else {
      Swal.fire({
        text: 'Debe existir al menos un año lectivo activo',
        icon: 'error',
        customClass: {
          confirmButton: 'btn btn-danger',
        },
        confirmButtonText: 'Ok!',
        buttonsStyling: false
      });
    }
  }

}
