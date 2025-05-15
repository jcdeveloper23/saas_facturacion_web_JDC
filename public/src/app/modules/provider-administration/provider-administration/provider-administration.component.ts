import { Component, OnInit, ViewChild } from '@angular/core';
import { ProviderService } from 'app/services/provider/provider.service';
import { take } from 'rxjs/operators';
/// *** Usado para datatables ***
/// *** Debo importar los mat en el module.ts ***
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
/// *** #Usado para datatables ***
import { Provider } from 'app/interfaces/provider';
import Swal from 'sweetalert2';
import { UtilsService } from 'app/services/utils/utils.service';


declare var $: any;


@Component({
  selector: 'app-provider-administration',
  templateUrl: './provider-administration.component.html',
  styleUrls: ['./provider-administration.component.css'],
  moduleId: module.id,
})
export class ProviderAdministrationComponent implements OnInit {
  /// *** Usado para datatables ***
  public dataSource: MatTableDataSource<Provider>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableProviders") paginator: MatPaginator;
  public displayedColumns: string[] = [
    "code",
    "ruc",
    "name",
    "phone",
    "status",
    "statusPeymentMethod",
    "edit",
    "delete",
  ];
  /// *** #Usado para datatables ***

  /**
   * *** Lista de proveedores, usado para listar la dat en la tabla ***
   */
  public array_providers: Array<Provider>;
  public provider: Provider;


  constructor(
    public providerServices: ProviderService,
    public utilsService: UtilsService,
  ) { }

  ngOnInit(): void {
    this.provider = {};
    this.getProviders();
    $('#multiCollapseLine').collapse('hide');
  }


  /**
 * *** Metodo para consultar los proveedores ***
 * *** Setea la data de los proveedores en la datatable ***
 */
  public getProviders() {
    this.providerServices.getProviders().subscribe((provider) => {
      this.array_providers = provider;
      this.dataSource = new MatTableDataSource<Provider>(provider);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    })
  }

  /**
   * *** Elimina proveedor ***
   * @param provider 
   */
  public deleteProvider(provider: Provider) {
    Swal.fire({
      text: "¿Confirma que desea eliminar el proveedor seleccionado?",
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
        this.providerServices.deleteProvider(provider);
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Se eliminó correctamente el proveedor.', 'success');
        // this.getProviders();
      }
    })
  }

  public editProvider(provider: Provider) {
    this.provider = provider;
    $('#multiCollapseLine').collapse('show');
  }
  /**
 * Dejar de visualizar formulario
 */
  public cancelViewForm() {
    $('#multiCollapseLine').collapse('hide');
  }

  upDatePercentage () {
    this.providerServices.activateProvider(this.provider, this.provider.provider_state);
  }

  public activateProvider( valid: boolean) {
    if (valid) {
      if (this.provider.provider_state) {
        this.provider.provider_id_school = this.provider.provider_id_school.toString();
        this.providerServices.activateProvider(this.provider, false);
        this.cancelViewForm();
      } else {
        this.providerServices.activateProvider(this.provider, true);
        this.cancelViewForm();
      }
      this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Estado cambiado correctamente.', 'success');
  
    }
    
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
}
