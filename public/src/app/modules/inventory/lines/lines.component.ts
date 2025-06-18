import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Group } from 'app/interfaces/group';
import { Lines } from 'app/interfaces/lines';
import { Users } from 'app/interfaces/users';
import { GroupsService } from 'app/services/groups/groups.service';
import { LinesService } from 'app/services/lines/lines.service';
import { take } from 'rxjs/operators';
import { LoadingService } from 'app/services/loading/loading.service';

import Swal from 'sweetalert2';

declare var $: any;


@Component({
  selector: 'app-lines',
  templateUrl: './lines.component.html',
  styleUrls: ['./lines.component.css']
})
export class LinesComponent implements OnInit {
  public infoUser: Users;
  public provider_id: string = '1624925525724';
  public array_lines: Array<Lines>;
  public line?: Lines;
  public isEditLine = false;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableLines") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Lines>;
  public displayedColumns: string[] = [
    "code",
    "name",
    "status",
    "edit",
    "delete",
  ];
  public isMenu: Array<boolean> = [];

  constructor(
    private lineService: LinesService,
    private groupsService: GroupsService,
    public loadingService: LoadingService,

  ) { }
  ngOnInit(): void {
    this.loadingService.show('Cargando...');
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.provider_id = this.infoUser.user_id;
    }
    this.line = {}
    this.getLines()
  }

  /**
   * Metodo para visualizar formulario y setear el id de la categoría y el estado.
   */
  public newLine() {
    this.line = {}
    this.isEditLine = false;
    $('#modalAdmin').modal('show');
    this.line.category_id = new Date().getTime().toString();
    this.line.category_state = true;
    this.line.category_provider_id = this.provider_id;
  }

  /**
   * Metodo para consultar las lineas registradas
   */
  public getLines() {
    this.lineService.getLinesByProvider(this.provider_id).pipe(take(1)).subscribe((lines: Array<Lines>) => {
      for (let index = 0; index < lines.length; index++) {
        const element = lines[index];
        if (element.category_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'menu') {
          element.category_is_menu = true
        } else {
          element.category_is_menu = false
        }
      }
      this.array_lines = lines;
      this.dataSource = new MatTableDataSource<Lines>(lines);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.loadingService.hide();
    })
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
   * Metodo para registrar o actualizar una nueva linea.
   * @param line 
   * @param isValid 
   */
  public saveLine(line: Lines, isValid: boolean, form: NgForm) {
    if (isValid) {
      this.loadingService.show('Cargando...');
      if (this.isEditLine) {
        this.lineService.updateLine(this.line).then(() => {
          this.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getLines();
          form.resetForm()
          $('#modalAdmin').modal('hide');
          this.loadingService.hide();
        })
      } else {
        this.lineService.saveLine(this.line).then(() => {
          this.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getLines()
          form.resetForm()
          $('#modalAdmin').modal('hide');
          this.loadingService.hide();
        })
      }
    }
  }

  /**
   * Metodo para visualizar formulario y asignar la linea a editar a la variable line
   * @param line 
   */
  public editLine(line: Lines) {
    this.isEditLine = true;
    this.line = line;
    $('#modalAdmin').modal('show');
  }

  /**
   * Metodo para eliminar una linea en especifico, se solicita confirmación para proceder a 
   * la eliminación luego se consulta si la linea contiene grupos relacionados de ser así se 
   * elimina primero los grupos y luego la linea, de lo contrario se elimina la linea.
   * @param line 
   */
  public async deleteLine(line: Lines) {
    Swal.fire({
      text: "¿Confirma que desea eliminar la categoría seleccionada?",
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
        this.loadingService.show('Cargando...');
        this.groupsService.getGroups(line.category_id).pipe(take(1)).subscribe((groups) => {
          if (groups && groups.length > 0) {
            for (let index = 0; index < groups.length; index++) {
              const element: Group = groups[index];
              this.groupsService.deleteGroup(element.group_code);
              if (index + 1 === groups.length) {
                this.lineService.deleteLine(line).then(() => {
                  this.showNotification('top', 'right', 'nc-check-2', 'Se eliminó correctamente la linea.', 'success');
                  this.getLines();
                })
              }

            }

          } else {
            this.lineService.deleteLine(line).then(() => {
              this.showNotification('top', 'right', 'nc-check-2', 'Se eliminó correctamente la linea.', 'success');
              this.getLines();
            })
          }
        })
      }
    })
  }

  /**
   * Dejar de visualizar formulario
   */
  public cancelViewForm() {
    $('#modalAdmin').modal('hide');

  }
  /**
   * Metodo para mostrar notificaciones.
   * @param from 
   * @param align 
   * @param icon 
   * @param message 
   * @param type 
   */
  public showNotification(from, align, icon, message, type) {

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
