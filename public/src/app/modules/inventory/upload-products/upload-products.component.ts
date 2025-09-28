import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Product } from 'app/interfaces/product';
import { Users } from 'app/interfaces/users';
import { ProductsService } from 'app/services/products/products.service';
import { Papa } from 'ngx-papaparse';
declare var $: any;

@Component({
  selector: 'app-upload-products',
  templateUrl: './upload-products.component.html',
  styleUrls: ['./upload-products.component.css']
})
export class UploadProductsComponent implements OnInit {

  public infoUser: Users;
  public isLoadingCsv = false
  public name_file: string = '';
  public provider_id: string = '7A6fjmI6RurmgvHgelWY';
  public product : Product;
  public arrayProducts: Array<Product>;
  public isUploadFile : boolean = false;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableProducts") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Product>;
  public displayedColumns: string[] = [
    "name",
    "description",
    "price",
  ];
  constructor(private productsService:  ProductsService,
    private papa: Papa,) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.provider_id =  this.infoUser.userId;
    }
  }

  /**
   * Metodo para cargar resultado de datos cargados a la bd.
   */
    public async upLoad() {
      this.isLoadingCsv = true;
      window.scrollTo(0, 0);
      if (this.arrayProducts && this.arrayProducts.length > 0) {
        for (let index = 0; index < this.arrayProducts.length; index++) {
        
          const product = this.arrayProducts[index];
          product.product_id = new Date().getTime().toString();
          await this.productsService.saveProduct(this.provider_id, product);
          if (index + 1 === this.arrayProducts.length) {
            this.showNotification('top', 'right', 'nc-check-2', 'Se agregaron correctamente los producto.', 'success');
            this.arrayProducts = []
            this.isLoadingCsv = false;
            this.name_file = '';
  
          }
        }
      } else {
        this.isLoadingCsv = false;
        this.showNotification('top', 'right', 'nc-alert-circle-i', 'Debe cargar al menos datos de un producto para registrar.', 'warning');

      }
      
  }

  /**
   * Metodo para setear los datos del csv cargado.
   */
  public handleFileSelect(evt) {
    this.name_file = evt.target.files[0].name;
    this.isUploadFile = true;
    var files = evt.target.files; // FileList object
    var file = files[0];
    var reader = new FileReader();
    reader.readAsText(file);
    reader.onload = (event: any) => {
      var csv = event.target.result; // Content of CSV file
      this.papa.parse(csv, {
        skipEmptyLines: true,
        header: true,
        complete: (results) => {
         
          this.arrayProducts = results.data;
          if (this.arrayProducts.length === results.data.length) {
              this.dataSource = new MatTableDataSource<Product>(this.arrayProducts);
              this.dataSource.paginator = this.paginator;
              this.dataSource.sort = this.sort;
          }
        }
      });
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

    /**
     * Metodo para simular click en input type file.
     */
    public clickUploadFile() {
      document.getElementById('upload_file').click();

    }
}
