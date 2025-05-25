import { ThrowStmt } from '@angular/compiler';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DatePicker } from 'app/interfaces/datepicker';
import { Lines } from 'app/interfaces/lines';
import { Menu } from 'app/interfaces/menu';
import { Product } from 'app/interfaces/product';
import { Users } from 'app/interfaces/users';
import { LinesService } from 'app/services/lines/lines.service';
import { UtilsService } from 'app/services/utils/utils.service';
declare var $: any;

@Component({
  selector: 'app-product-detail-modal',
  templateUrl: './product-detail-modal.component.html',
  styleUrls: ['./product-detail-modal.component.css']
})
export class ProductDetailModalComponent implements OnInit {
  public infoUser: Users;
  public minDate: string = ""
  public year: number;
  public month: number;
  public day: number;
  public dayselected: DatePicker = {}
  @Output() changeModality = new EventEmitter();
  @Input() product: Product;
  @Input() menuSelect: Menu;
  @Input() student_id: string;
  public productscartCache: Array<Product>;
  public isCategoryMenu = false;
  public dayOfWeekNumberMenu: number;
  public array_week = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

  constructor(private notificationService: UtilsService,
    private categoryService: LinesService,
    private utilService: UtilsService) { }

  ngOnInit(): void {
    if (this.product) {
      this.getInfoCategory()
      $('#myModal').modal('show');
      $('#myModal').modal({ backdrop: 'static', keyboard: false });
      $('body').removeClass('modal-open');
      $('body').css('padding', '0px');
      this.product.product_delivery_method = "i withdraw";
      this.getLocalStorageCart();
      var fecha = new Date();
      this.year = fecha.getFullYear();
      this.day = fecha.getDate();
      this.month = fecha.getMonth();
      this.dayOfWeekNumberMenu = fecha.getDay()
    }

  }

  public getInfoCategory() {
    this.isCategoryMenu = false;
    this.categoryService.getLineById(this.product.product_id_category).subscribe((category: Lines) => {
      if (category.category_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'menu') {
        this.isCategoryMenu = true;
        if (this.isCategoryMenu) {
          this.dayselected.day = new Date(this.menuSelect.menu_date).getDate() + 1;
          this.dayselected.month = (new Date(this.menuSelect.menu_date).getMonth() + 1);
          this.dayselected.year = new Date(this.menuSelect.menu_date).getFullYear();
          this.product.product_order_delivery_date = (this.dayselected.year + '-' + this.dayselected.month + '-' + this.dayselected.day);

          $("#date").val(this.dayselected.year + '-' + this.dayselected.month + '-' + this.dayselected.day);
        }
      }
    })
  }

  public closemodal() {
    $('#myModal').removeData("modal").modal({ backdrop: 'static', keyboard: false })
    $('.modal').css('overflow-y', 'auto');
    $('.fade').remove();
    this.changeModality.emit('init');
  }



  public onDateSelected() {
    this.product.product_order_delivery_date = null
    if (this.dayselected.year < this.year) {
      this.notificationService.showNotification('top', 'right', 'nc-alert-circle-i', 'Seleccione un año correcto, superior al año actual.', 'warning')
    } else {
      if (this.dayselected.month < this.month) {
        this.notificationService.showNotification('top', 'right', 'nc-alert-circle-i', 'Seleccione un mes correcto, superior al mes actual.', 'warning')
      } else {
        var dateSelected = $("#date").val();
        let daySelect = (new Date(dateSelected).getDay());
        if (this.dayselected.day < this.day || daySelect === 5 || daySelect === 6) {
          this.notificationService.showNotification('top', 'right', 'nc-alert-circle-i', 'Seleccione un día correcto, superior al día actual sin incluir los días Sabados y Domingos .', 'warning')
        } else {
          if (this.isCategoryMenu) {
            var date = $("#date").val();
            let day = (new Date(date).getDay());
            if (day === 6) {
              day = 0
            } else {
              day = day + 1
            }

            if (this.product.product_days_of_availability.includes(day)) {
              if (this.dayselected.day - new Date().getDate() >= 2) {
                this.product.product_order_delivery_date = this.dayselected.year + "-" + this.dayselected.month + "-" + this.dayselected.day

              } else {
                this.notificationService.showNotification('top', 'right', 'nc-alert-circle-i', 'Recuerde que debe realizar su pedido para la categoría menú con dos días de anticipación.', 'warning')

              }
            } else {
              this.notificationService.showNotification('top', 'right', 'nc-alert-circle-i', 'El día seleccionado no corresponde a los días disponibles.', 'warning')
            }
          } else {
            this.product.product_order_delivery_date = this.dayselected.year + "-" + this.dayselected.month + "-" + this.dayselected.day
          }

        }
      }
    }
  }

  public addToCart() {

    if (this.product.product_order_delivery_date) {
      this.product.product_id_student = this.student_id,
        this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
      if (JSON.parse(localStorage.getItem("productscartCache"))) {
        this.productscartCache = JSON.parse(localStorage.getItem("productscartCache"))
      } else {
        this.productscartCache = []
      }
      this.product.product_quantity_in_cart = 1;
      this.productscartCache.push(this.product)
      localStorage.setItem("productscartCache", JSON.stringify(this.productscartCache));
      this.closemodal()

      this.notificationService.showNotification('top', 'right', 'nc-check-2', 'Se ha añadido correctamente el producto al carrito.', 'success')
    } else {
      this.notificationService.showNotification('top', 'right', 'nc-alert-circle-i', 'Complete los campos fecha de entrega.', 'warning')

    }


  }

  public getLocalStorageCart() {
    this.productscartCache = []
    if (JSON.parse(localStorage.getItem("productscartCache"))) {
      this.productscartCache = JSON.parse(
        localStorage.getItem("productscartCache")
      );
    } else {
      this.productscartCache = [];
    }
    return this.productscartCache.length;
  }
}
