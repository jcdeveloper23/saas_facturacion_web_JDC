import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Provider } from 'app/interfaces/provider';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { UtilsService } from 'app/services/utils/utils.service';
import Swal from 'sweetalert2';
import { ProductDetailModalComponent } from '../product-detail-modal/product-detail-modal.component';

@Component({
  selector: 'app-top-bar',
  templateUrl: './top-bar.component.html',
  styleUrls: ['./top-bar.component.css'],
  providers: [ProductDetailModalComponent]
})
export class TopBarComponent implements OnInit {

  public infoUser: Users;
  @Input() typeComponent : string;
  @Input() student : Student;
  @Input() student_id : string;
  @Input() info_provider : Provider;
  @Input() provider_id : string;

  constructor(public productDetailComponent: ProductDetailModalComponent,
    public router : Router, private utilService : UtilsService) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    ;

  }

  public viewCart() {
    if (this.productDetailComponent.getLocalStorageCart() === 0) {
      this.utilService.showNotification('top', 'right', 'nc-alert-circle-i', 'No tiene productos agregados a su carrito.', 'warning');

    } else {
      this.router.navigate(['perfil-representative/student/' + this.student_id + '/cart-detail']);

    }

  }

  public viewCalendar() {
      this.router.navigate(['perfil-representative/student/' + this.student_id + '/calendar']);

  }

  public goStudentsList() {
    this.router.navigate(['perfil-representative/childrens']);
  }

  public goStudentsListOfCart() {
    // Swal.fire({
    //   title: '¿Confirma que desea regresar?',
    //   text: "Luego de confirmar los productos agregados a su carrito serán eliminados",
    //   icon: 'warning',
    //   showCancelButton: true,
    //   customClass:{
    //     confirmButton: 'btn btn-success',
    //     cancelButton: 'btn btn-danger',
    //   },
    //   confirmButtonText: 'Si, regresar!',
    //   cancelButtonText: 'Cancelar',
    //    buttonsStyling: false
    // }).then((result) => {
    //   if (result.value) {
        this.router.navigate(['perfil-representative/student/'+ this.student_id +'/providers/' + this.provider_id]);

    //   }
    // })
  }
}
