import { ViewChild } from '@angular/core';
import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Coupon } from 'app/interfaces/coupon';
import { Users } from 'app/interfaces/users';
import { CouponsService } from 'app/services/coupons/coupons.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
declare var $: any;

@Component({
  selector: 'app-coupons',
  templateUrl: './coupons.component.html',
  styleUrls: ['./coupons.component.css']
})
export class CouponsComponent implements OnInit {

  public provider_id: string;
  public array_coupons: Array<Coupon> = [];
  public coupon?: Coupon;
  public isEditCoupon = false;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableCoupons") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Coupon>;
  public displayedColumns: string[] = [
    "code",
    "value",
    "name",
    "status",
    "edit",
    "delete",
  ];
  public infoUser: Users;

  constructor(
    private couponsService: CouponsService,
  ) { }

  ngOnInit(): void {
    this.array_coupons = [];
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.provider_id = this.infoUser.user_id;
    }
    this.coupon = {}
    this.getCoupons();
  }

  /**
   * Metodo para obtener las lineas que corresponden a un proveedor.
   * 1. Se espera a obtener los datos de la consulta de bd para luego consultar los grupos.
   */
  // public async getLines() {
  //   this.array_lines = await this.linesServices.getLinesByProvider(this.provider_id).pipe(take(1)).toPromise()
  //   if (this.array_lines) {
  //     this.getCoupons();
  //   }

  // }
  /**
   * Metodo para consultar grupos correspondientes a una linea.
   * 1. Se recorreo el array de lineas para obtener el id de linea y setear el nombre de linea correspondiente a cada grupo.
   * 2. Se reccorren los grupos obtenidos de la base de datos.
   * 3.Se agregar al array de grupos cada grupo individualmente para posteriormente mostrar en la tabla.
   */
  public getCoupons() {
    this.array_coupons = [];
    this.couponsService.getCoupons(this.provider_id).pipe(take(1)).subscribe((coupons: Coupon[]) => {
      this.array_coupons = coupons;
      this.dataSource = new MatTableDataSource<Coupon>(coupons);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    })
  }


  /**
   * 
   * Metodo para visualizar el formulario, generar un nuevo codigo y asignar el estado el true
   */
  public newCoupon() {
    this.isEditCoupon = false;
    $('#multiCollapseCoupon').collapse('show');
    this.coupon = {}
    this.coupon.coupon_code = new Date().getTime().toString();
    this.coupon.coupon_state = true;
    this.coupon.coupon_provider_id = this.provider_id;
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
    * @param coupon 
    * @param isValid 
    */
  public saveCoupon(coupon: Coupon, isValid: boolean, form: NgForm) {
    if (isValid) {
      this.coupon.coupon_value = this.coupon.coupon_value;
      if (this.isEditCoupon) {
        this.couponsService.updateCoupon(this.coupon).then(() => {
          this.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getCoupons();
          form.resetForm()
          $('#multiCollapseCoupon').collapse('hide');
        })
      } else {
        this.couponsService.saveCoupon(this.coupon).then(() => {
          this.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
          this.getCoupons();
          form.resetForm()
          $('#multiCollapseCoupon').collapse('hide');
        })
      }
    }
  }

  /**
  * Metodo para visualizar formulario y asignar la linea a editar a la variable line
  * @param coupon 
  */
  public editCoupon(coupon: Coupon) {
    this.isEditCoupon = true;
    this.coupon = coupon;
    $('#multiCollapseCoupon').collapse('show');

  }

  /**
 * Metodo para eliminar un grupo en especifico, se solicita confirmación para proceder a 
 * la eliminación.
 * @param coupon 
 */
  public async deleteCoupon(coupon: Coupon) {
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
        this.couponsService.deleteCoupon(coupon.coupon_code);
        this.showNotification('top', 'right', 'nc-check-2', 'Se eliminó correctamente el grupo.', 'success');
        this.getCoupons()
      }
    })
  }

  /**
   * Dejar de visualizar formulario
   */
  public cancelViewForm() {
    $('#multiCollapseCoupon').collapse('hide');

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
