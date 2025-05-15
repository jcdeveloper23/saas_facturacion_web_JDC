import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Group } from 'app/interfaces/group';
import { Lines } from 'app/interfaces/lines';
import { GroupsService } from 'app/services/groups/groups.service';
import { LinesService } from 'app/services/lines/lines.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';

declare var $: any;


@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.css']
})
export class GroupsComponent implements OnInit {

  public provider_id: string = '1623809758117';
  public array_groups: Array<Group> = [];
  public array_lines: Array<Lines> = [];
  public group?: Group;
  public isEditGroup = false;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableGroups") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Group>;
  public displayedColumns: string[] = [
    "code",
    "name",
    "status",
    "line",
    "edit",
    "delete",
  ];
  constructor(private groupsService: GroupsService,
    private linesServices: LinesService) { }

  ngOnInit(): void {
    this.getLines();
    this.group = {}
  }

  /**
   * Metodo para obtener las lineas que corresponden a un proveedor.
   * 1. Se espera a obtener los datos de la consulta de bd para luego consultar los grupos.
   */
  public async getLines() {
    this.array_lines = await this.linesServices.getLinesByProvider(this.provider_id).pipe(take(1)).toPromise()
    if(this.array_lines) {
      this.getGroups();
    }

  }
  /**
   * Metodo para consultar grupos correspondientes a una linea.
   * 1. Se recorreo el array de lineas para obtener el id de linea y setear el nombre de linea correspondiente a cada grupo.
   * 2. Se reccorren los grupos obtenidos de la base de datos.
   * 3.Se agregar al array de grupos cada grupo individualmente para posteriormente mostrar en la tabla.
   */
  public getGroups() {
    this.array_groups = [];
    for (let index = 0; index < this.array_lines.length; index++) {
      const element = this.array_lines[index];
      this.groupsService.getGroups(element.category_id).pipe(take(1)).subscribe((groups: Group[]) => {
        for (let i = 0; i < groups.length; i++) {
          const group = groups[i];
          group.group_line_name = element.category_name
          this.array_groups.push(group)
        }
        if (index + 1 === this.array_lines.length) {
          this.dataSource = new MatTableDataSource<Group>(this.array_groups);
          this.dataSource.paginator = this.paginator;
          this.dataSource.sort = this.sort;
        }
      })
    }
  }


  /**
   * 
   * Metodo para visualizar el formulario, generar un nuevo codigo y asignar el estado el true
   */
  public newGroup() {
    this.isEditGroup = false;
    $('#multiCollapseGroup').collapse('show');
    this.group = {}
    this.group.group_code = new Date().getTime().toString();
    this.group.group_state = true;
    this.group.group_line = null
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
    * Metodo para registrar o actualizar un nuevo grupo.
    * @param group 
    * @param isValid 
    */
  public saveGroup(group: Group, isValid: boolean, form: NgForm) {
    if (isValid) {
      if (this.isEditGroup) {
        this.groupsService.updateGroup(group).then(() => {
          this.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getGroups();
          form.resetForm()
          $('#multiCollapseGroup').collapse('hide');
        })
      } else {
        this.groupsService.saveGroup(group).then(() => {
          this.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getGroups();
          form.resetForm()
          $('#multiCollapseGroup').collapse('hide');
        })
      }
    }
  }

  /**
  * Metodo para visualizar formulario y asignar la linea a editar a la variable line
  * @param group 
  */
  public editGroup(group: Group) {
    this.isEditGroup = true;
    this.group = group;
    $('#multiCollapseGroup').collapse('show');

  }

  /**
 * Metodo para eliminar un grupo en especifico, se solicita confirmación para proceder a 
 * la eliminación.
 * @param group 
 */
  public async deleteGroup(group: Group) {
    Swal.fire({
      text: "¿Confirma que desea eliminar el grupo seleccionado?",
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
        this.groupsService.deleteGroup(group.group_code);
        this.showNotification('top', 'right', 'nc-check-2', 'Se eliminó correctamente el grupo.', 'success');
        this.getGroups()
      }
    })
  }

  /**
   * Dejar de visualizar formulario
   */
  public cancelViewForm() {
    $('#multiCollapseGroup').collapse('hide');

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
