import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { take } from 'rxjs/operators';
import { UtilsService } from 'app/services/utils/utils.service';
import Swal from 'sweetalert2';
import { StorageService } from 'app/services/storage/storage.service';


/// *** Usado para datatables ***
/// *** Debo importar los mat en el module.ts ***
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { SchoolService } from 'app/services/school/school.service';
import { School } from 'app/interfaces/school';
import { Levels } from 'app/interfaces/levels';
import { Parallels } from 'app/interfaces/parallels';
import {LectiveYearService} from '../../../services/lective-year/lective-year.service';
import {LectiveYear} from '../../../interfaces/lective_year';
/// *** #Usado para datatables ***
declare var $: any;

@Component({
  selector: 'app-school',
  templateUrl: './school.component.html',
  styleUrls: ['./school.component.css']
})
export class SchoolComponent implements OnInit {
  /// *** Usado para datatables ***
  public dataSource: MatTableDataSource<School>;
  public isEditSchool = false;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('tableSchools') paginator: MatPaginator;

  public displayedColumns: string[] = [
    'code',
    'name',
    'phone',
    'email',
    'address',
    'country',
    'city',
    'status',
    'edit',
    'admin',
    'delete',
  ];
  /// *** #Usado para datatables ***
  public school_id: string;
  public array_schools: Array<School>;
  public school: School;
  public isEdit: boolean;
  public fileDataImage: File = null;
  public previe_url_image: any = null;
  public isEditLevel = false;
  public level: Levels;
  public array_levels: Levels[];
  public isEditParallel = false;
  public parallel: Parallels;
  public array_parallels: Parallels[];
  public levelSelected: Levels;
  public lectiveYears: LectiveYear[] = [];
  public lectiveYear: LectiveYear;
  constructor(private schoolService: SchoolService,
    private storageService: StorageService,
    public utilsService: UtilsService,
    public lectiveService: LectiveYearService) { }

  ngOnInit(): void {
    this.school = {};
    this.level = {};
    this.parallel = {};
    this.array_parallels = [];
    this.levelSelected = {
      level_id: ''
    };
    this.lectiveYear = {};
    this.getSchools();
    $('#multiCollapseSchool').collapse('hide');
    $('#modalAdminLectiveYear').on('hidden.bs.modal', () => {
      this.getAllLectiveYearFromSchool(this.school.school_id);
    });
  }

  /**
   * *** Function para obtener todos los años lectivos
   */
  public async getAllLectiveYearFromSchool(schoolId: string) {
    this.lectiveYears = [];
    const resp = await this.lectiveService.getAllLectiveYearFromSchool(schoolId).toPromise()
    resp.docs.forEach((year) => {
      this.lectiveYears.push(year.data());
    });
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
   * *** Obtenemos las UEs de la DB ***
   */
  public getSchools() {
    this.schoolService.getSchools().pipe(take(1)).subscribe((school) => {
      this.array_schools = school;
      this.dataSource = new MatTableDataSource<School>(school);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    })
  }

  /**
   * *** Para iniciar la creacion de la nueva UE limpiamos la UD ***
   * *** Editar = false ***
   * *** Moastramos el formulario ***
   * *** Creamos e nuevo id ***
   */
  public newSchool() {
    this.school = {}
    this.isEditSchool = false;
    $('#multiCollapseSchool').collapse('show');
    this.school.school_id = new Date().getTime().toString();
  }

  /**
   * Dejar de visualizar formulario
   */
  public cancelViewForm() {
    this.school = {};
    $('#multiCollapseSchool').collapse('hide');
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
      this.previe_url_image = reader.result;
    }
  }

  /**
   * Metodo para visualizar formulario y asignar la linea a editar a la variable line
   * @param school
   */
  public editSchool(school: School) {
    this.isEditSchool = true;
    this.school = school;
    this.getAllLectiveYearFromSchool(this.school.school_id);
    $('#multiCollapseSchool').collapse('show');
  }

  /**
   * Metodo para registrar o actualizar una nueva Unidad Educativa.
   * @param school
   * @param isValid
   */
  public async saveSchool(isValid: boolean, form: NgForm) {
    if (isValid) {
      if (this.fileDataImage) {
        await this.storageService.uploadFile(`school/school_id${this.school.school_id}/image${this.school.school_id}.png`, this.fileDataImage).then((result) => {
          this.school.school_image = result;
        })
      }
      if (this.isEditSchool) {
        this.schoolService.editSchool(this.school).then(() => {
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getSchools();
          this.previe_url_image = null;
          form.resetForm()
          $('#multiCollapseSchool').collapse('hide');
          this.school = {};
        })
      } else {
        this.school.school_register_date = this.utilsService.getDateCurrent();
        this.school.school_register_time = this.utilsService.getTimeCurrent();
        this.school.school_active_lective_year = '';
        this.schoolService.saveSchool(this.school).then(() => {
          this.lectiveYear.lective_year_name = '--';
          this.lectiveYear.lective_year_init_date = '--';
          this.lectiveYear.lective_year_finish_date = '--';
          this.lectiveService.saveLectiveYear(this.lectiveYear, this.school.school_id);
          this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getSchools()
          form.resetForm()
          $('#multiCollapseSchool').collapse('hide');
          this.school = {};
        })
      }
    }
  }

  /**
   * *** Elimina unidad educativa ***
   * @param school
   */
  public deleteSchool(school: School) {
    Swal.fire({
      text: '¿Confirma que desea eliminar la unidad educativa seleccionada?',
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
        this.schoolService.deleteSchool(school);
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se eliminó correctamente la Unidad Educativa.', 'success');
        this.getSchools();
      }
    })
  }

  public adminSchool(school: School) {
    this.school = school;
    this.level.level_id_school = this.school.school_id;
    this.schoolService.getSchoolsLevel(school).subscribe((level) => {
      this.array_levels = level;
      this.getSchoolParallels(this.array_levels);
    });
    $('#modalAdmin').modal('show');
  }

  public getSchoolParallels(array_levels: Levels[]) {
    array_levels.forEach((level: Levels) => {
      this.array_parallels[level.level_id] = [];
      this.schoolService.getSchoolParallels(level.level_id).subscribe((parallel) => {
        this.array_parallels[level.level_id] = parallel;
      });
    });
  }

  public saveLevel(level, valid, form: NgForm) {
    if (valid) {
      if (!this.isEditLevel) {
        this.level.level_state = true;
        this.level.level_id = new Date().getTime().toString();
        this.schoolService.saveLevel(this.level);
        this.level.level_id_school = this.school.school_id;
        this.level.level_id = '';
        this.level.level_name = '';
      } else {
        this.schoolService.editLevel(this.level);
        this.level.level_id_school = this.school.school_id;
        this.level.level_id = '';
        this.level.level_name = '';
        this.isEditLevel = false;
      }
    }
  }

  public editLevel(level: Levels) {
    this.isEditLevel = true;
    this.level = level;
  }

  public deleteLevel(level: Levels) {
    this.array_parallels[level.level_id].forEach(parallel => {
      this.schoolService.deleteParallel(parallel);
    });
    this.schoolService.deleteLevel(level);
  }

  public saveParallel (level: Levels, parallel: Parallels) {
    parallel.parallel_level_id = level.level_id;
    parallel.parallel_state = true;
    this.schoolService.saveParallel(parallel);
  }

  public addParallel (level: Levels) {
    let parallel: Parallels = {
      parallel_id: new Date().getTime().toString(),
    };
    this.array_parallels[level.level_id].push(
      parallel
    );
  }

  public selectLevel(e) {
  }

  public deleteParallel (level: Levels, parallel: Parallels) {
    this.schoolService.deleteParallel(parallel);
  }

  public adminLectiveYear() {
    $('#modalAdminLectiveYear').modal('show');
  }

  public saveLectiveYear(isValid: boolean, form: NgForm) {
    console.log(form.value)
  }
}


