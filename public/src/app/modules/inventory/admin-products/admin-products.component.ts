import { Component, OnInit, ViewChild } from '@angular/core';
import { FormControl, NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Lines } from 'app/interfaces/lines';
import { Product } from 'app/interfaces/product';
import { Users } from 'app/interfaces/users';
import { LinesService } from 'app/services/lines/lines.service';
import { ProductsService } from 'app/services/products/products.service';
import { StorageService } from 'app/services/storage/storage.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { CalendarOptions, EventClickArg } from '@fullcalendar/angular'; // useful for typechecking
import { Calendar } from 'app/interfaces/calendar';
import { ManageMenuService } from 'app/services/manage-menu/manage-menu.service';
import { Menu } from 'app/interfaces/menu';
import { UtilsService } from 'app/services/utils/utils.service';
import imageCompression from 'browser-image-compression';
import { LoadingService } from 'app/services/loading/loading.service';
declare var $: any;

@Component({
  selector: 'app-admin-products',
  templateUrl: './admin-products.component.html',
  styleUrls: ['./admin-products.component.css']
})
export class AdminProductsComponent implements OnInit {



  public infoUser: Users;
  public daysForm = new FormControl();
  public isViewSelectDays = false;
  public array_week = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  public fileDataGallery: Array<File> = [];
  public previewUrlGallery: Array<any>;
  public imagePreviewGallery: number;
  public provider_id: string = '1624925525724';
  public array_products: Array<Product> = [];
  public array_lines: Array<Lines> = [];
  public product: Product;
  public isEditProduct = false;
  public isEditImageGallery = false;
  public product_select_aux: Product;
  public array_days_available?: Array<number> = [];
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tableProducts") paginator: MatPaginator;
  public dataSource: MatTableDataSource<Product>;
  public displayedColumns: string[] = [
    "image",
    "code",
    "name",
    "description",
    "line",
    "price",
    "status",
    "edit",
    "delete",
  ];
  public lineForm = new FormControl();
  public isAdminMenu = false;
  public array_events: Array<Calendar> = [];
  calendarOptions: CalendarOptions = {
  };
  appointment: any;
  public typeComponent = 'calendar';
  public dateStr: any;
  public addEvent = false;
  public category: Lines;
  public arrayProducts: Array<Product>;
  @ViewChild(MatSort) sortModal: MatSort;
  @ViewChild("tableProductsModal") paginatorModal: MatPaginator;
  public dataSourceModal: MatTableDataSource<Product>;
  public displayedColumnsModal: string[] = [
    "image",
    "code",
    "name",
    "description",
    "price",
    "select",
  ];
  public arrayProductSelected: Array<Product> = [];
  public array_menu: Array<Menu>;
  public isEditEvent = false;
  public menuSelect: Menu;
  public monthSelect: any;
  constructor(private linesServices: LinesService,
    private storageService: StorageService,
    private productService: ProductsService,
    private categoriesService: LinesService,
    private menuService: ManageMenuService,
    private utilSevrice: UtilsService,
    public loadingService: LoadingService,

  ) { }

  ngOnInit(): void {
    this.loadingService.show('Cargando...');
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.provider_id = this.infoUser.userId;
    }
    this.getLines();
    this.getProducts();
    this.product = {}
    this.product.product_images = [];

  }

  /**
  * Metodo para obtener las lineas que corresponden a un proveedor.
  */
  public async getLines() {
    this.array_lines = await this.linesServices.getLinesActive(this.provider_id).pipe(take(1)).toPromise()

  }

  /**
   * Metodo para obtener todos los productos que corresponden a un proveedor
   */
  public async getProducts() {
    this.array_products = [];
    this.array_products = await this.productService.getProductsByProvider(this.provider_id).pipe(take(1)).toPromise();
    if (this.array_products) {
      this.setLineNameInProduct();
      this.dataSource = new MatTableDataSource<Product>(this.array_products);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.loadingService.hide();
    }
  }
  /**
   * Metodo para setear el nombre de la linea que corresponde a cada producto
   */
  public setLineNameInProduct() {
    for (let index = 0; index < this.array_products.length; index++) {
      const product = this.array_products[index];
      for (let index = 0; index < this.array_lines.length; index++) {
        const line = this.array_lines[index];
        if (product.product_id_category === line.category_id) {
          product.product_id_category_name = line.category_name
        }
      }
    }
  }

  /**
   * Metodo para actualizar o registar un producto.
   * 1. Se valida si el formulario es correcto.
   * 2. Se valida si hay imagenes por registrar en el storage y generar la url para luego asignarla 
   * a la variable product_images en la posición que corresponda.
   * 3. Se registra o se actualiza el producto 
   * @param product 
   * @param isValid 
   * @param form 
   */

  public async saveProduct(product: Product, isValid: boolean, form: NgForm) {
    if (!isValid || !this.product.product_id_category) {
      return this.showNotification('top', 'right', 'nc-alert-circle-i', 'Complete todo los campos requeridos (*)', 'warning');
    }

    if (!this.isEditProduct && (!this.fileDataGallery || this.fileDataGallery === undefined || this.fileDataGallery.length === 0)) {
      return this.showNotification('top', 'right', 'nc-alert-circle-i', 'Debe agregar al menos una imagen de producto.', 'warning');
    }

    this.loadingService.show('Guardando la información');

    const imageUploads = [];

    if (this.fileDataGallery !== undefined && this.fileDataGallery.length > 0) {
      for (let index = 0; index < this.fileDataGallery.length; index++) {
        const file = this.fileDataGallery[index];
        if (file) {
          const compressed = await this.compressFile(file);

          const uploadPath = `products/product${this.product.product_id}/image_${index}.jpg`;
          const uploadPromise = this.storageService.uploadFile(uploadPath, compressed).then((result) => {
            this.product.product_images[index] = result;
          });
          imageUploads.push(uploadPromise);
        }
      }
      await Promise.all(imageUploads);
    }

    const saveOrUpdate = this.isEditProduct
      ? this.productService.updateProduct(this.provider_id, this.product)
      : this.productService.saveProduct(this.provider_id, this.product);

    saveOrUpdate.then(() => {
      setTimeout(() => {
        $('#modalAdminProduct').modal('hide');
        this.getProducts();
        this.fileDataGallery = [];
        this.showNotification('top', 'right', 'nc-check-2', 'Se realizó la actualización correctamente.', 'success');
        form.resetForm();
      }, 500);
    });
  }

  async compressFile(file: File): Promise<File> {
    // const options = {
    //   maxSizeMB: 1,          // Tamaño máximo 1MB
    //   maxWidthOrHeight: 1024, // Máximo ancho o alto 1024px
    //   useWebWorker: true,
    // };
    // const options = {
    //   maxSizeMB: 0.1,           // Máximo 100 KB
    //   maxWidthOrHeight: 800,    // Máximo ancho/alto 800px
    //   useWebWorker: true,
    //   initialQuality: 0.5,      // Calidad 50%
    //   fileType: 'image/jpeg'    // Forzar JPEG para mejor compresión
    // };
    const options = {
      maxSizeMB: 0.05,          // 50 KB (baja más) 
      maxWidthOrHeight: 600,    // dimensiones más pequeñas
      useWebWorker: true,
      initialQuality: 0.3,
      // no forzar JPEG para mantener PNG 6635
    };
    try {
      const compressedFile = await imageCompression(file, options);
      return compressedFile;
    } catch (error) {
      console.error('Error compressing image:', error);
      return file; // si falla, devuelve el archivo original
    }
  }


  public async saveProductOLD(product: Product, isValid: boolean, form: NgForm) {
    if (isValid && this.product.product_id_category) {
      if (this.isEditProduct) {
        if (this.fileDataGallery !== undefined) {
          for (let index = 0; index < this.fileDataGallery.length; index++) {

            if (this.fileDataGallery[index] !== undefined) {
              await this.storageService.uploadFile(`products/product${this.product.product_id}/image_${index}.png`, this.fileDataGallery[index]).then((result) => {
                this.product.product_images[index] = result;
              })
            }
            if (index + 1 === this.fileDataGallery.length) {
              this.productService.updateProduct(this.provider_id, this.product).then(() => {
                setTimeout(() => {
                  $('#modalAdminProduct').modal('hide');
                  this.getProducts()
                  this.showNotification('top', 'right', 'nc-check-2', 'Se realizó la actualización correctamente.', 'success');
                  form.resetForm()
                }, 500);
              })
            }
          }
        } else {
          if (this.product.product_images.length !== 0) {
            this.productService.updateProduct(this.provider_id, this.product).then(() => {
              setTimeout(() => {
                $('#modalAdminProduct').modal('hide');
                this.getProducts()
                this.fileDataGallery = [];
                this.showNotification('top', 'right', 'nc-check-2', 'Se realizó la actualización correctamente.', 'success');
                form.resetForm()
              }, 500);
            })
          } else {
            this.showNotification('top', 'right', 'nc-alert-circle-i', 'Debe agregar al menos una imagen de producto.', 'warning');
          }
        }
      } else {
        if (this.fileDataGallery && this.fileDataGallery !== undefined) {
          for (let index = 0; index < this.fileDataGallery.length; index++) {
            if (this.previewUrlGallery[index] !== undefined) {
              await this.storageService.uploadFile(`products/product${this.product.product_id}/image_${index}.png`, this.fileDataGallery[index]).then((result) => {
                this.product.product_images[index] = result;
              })
            }
            if (index + 1 === this.fileDataGallery.length) {
              this.productService.saveProduct(this.provider_id, this.product).then(() => {
                setTimeout(() => {
                  $('#modalAdminProduct').modal('hide');
                  this.getProducts();
                  this.fileDataGallery = [];
                  this.showNotification('top', 'right', 'nc-check-2', 'Se realizó la actualización correctamente.', 'success');
                  form.resetForm()
                }, 500);
              })
            }
          }
        } else {
          this.showNotification('top', 'right', 'nc-alert-circle-i', 'Debe agregar al menos una imagen de producto.', 'warning');
        }
      }
    } else {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Complete todo los campos requeridos (*)', 'warning');
    }
  }

  public selectCategory(e) {
    for (let index = 0; index < this.array_lines.length; index++) {
      const element = this.array_lines[index];
      if (element.category_id === e.value) {

        if (element.category_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'menu') {
          this.isViewSelectDays = true;

        } else {
          this.isViewSelectDays = false;
          this.product.product_days_of_availability = null;
        }
      }
    }
  }

  /**
   * 
   * Metodo para visualizar el formulario, generar un nuevo codigo y asignar el estado el true
   */
  public newProduct() {
    this.isEditProduct = false;
    this.isViewSelectDays = false;
    this.product = {}
    this.previewUrlGallery = undefined;
    this.isEditImageGallery = false;
    this.isViewSelectDays = false;
    this.product.product_id = new Date().getTime().toString();
    this.product.product_provider_id = this.provider_id;
    this.product.product_state = true;
    this.product.product_id_category = null;
    this.product.product_images = [];
    $('#modalAdminProduct').modal('show');

  }

  public adminMenu() {
    this.isAdminMenu = true;
    $('#multiCollapseMenu').collapse('show');
    let year = new Date().getFullYear();
    let month = new Date().getMonth();
    let dateStart = year + '-' + this.utilSevrice.addZero((month + 1)) + '-' + this.utilSevrice.addZero(1);
    let dateEnd = year + '-' + this.utilSevrice.addZero((month + 1)) + '-' + this.utilSevrice.addZero(new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate());

    this.getEventsCalendar(dateStart, dateEnd)

  }
  /**
 * Dejar de visualizar formulario
 */
  public cancelViewForm() {
    $('#modalAdminProduct').modal('hide');
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
   * Metodo para agregar una nueva imagen de producto
   *  1. Se simula el el click sobre el input file
   *  2. Se valida que no se carguen más de 2 imagenes
   */
  public addImageGallery() {
    this.isEditImageGallery = false;
    if (this.previewUrlGallery === undefined || this.previewUrlGallery.length < 2) {
      document.getElementById('product_gallery').click();
    } else {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Ha superado el limite de imagenes permitidas.', 'warning');
    }
  }

  /**
   * Metodo para cambiar una imagen cargada
   * 1. Se asigna la posición de la imagen que se quiere cambiar.
   * @param i 
   */
  public changeImageGallery(i: number) {
    this.isEditImageGallery = true;
    this.imagePreviewGallery = i;
    document.getElementById('product_gallery').click();

  }

  /**
   * Metodo que elimina una imagen cargada a la galería
   * 1. se valida que si es de base de datos se elimina directamente la url.
   * 
   * @param i 
   */
  public deleteImageGallery(i: number) {
    this.imagePreviewGallery = i;
    if (this.fileDataGallery && this.fileDataGallery[i] !== undefined) {
      this.previewUrlGallery.splice(i, 1);
      this.fileDataGallery.splice(i, 1);
      this.product.product_images.splice(i, 1);
    } else {
      this.storageService.deleteFileByURL(this.product.product_images[i]);

      this.previewUrlGallery.splice(i, 1)
      this.product.product_images = this.previewUrlGallery;
    }
  }

  /**
   * Metodo que recibe el archivo cargado por medio del input file
   * 1. Se realizan validaciones en cuanto a si es una imagen nueva o no
   * 2. Se valida que si es edición se cargue en la posicion correcta del array para realizar la correcta sustitución en la bd.
   * 3. Se al metodo que genera la imagen previa para el usuario.
   * @param fileInput 
   */
  public fileProgressGallery(fileInput: any) {
    if (this.product.product_images.length === 0) {
      if (this.fileDataGallery === undefined) {
        this.fileDataGallery = [];
        this.imagePreviewGallery = 0;
        this.fileDataGallery.push(<File>fileInput.target.files[0]);
      } else {
        if (this.isEditImageGallery) {
          this.fileDataGallery[this.imagePreviewGallery] = <File>fileInput.target.files[0]
        } else {
          this.fileDataGallery.push(<File>fileInput.target.files[0])
          this.imagePreviewGallery = this.fileDataGallery.length - 1
        }
      }
    } else {
      if (!this.isEditImageGallery) {
        if (this.fileDataGallery === undefined) {
          this.fileDataGallery = []
          this.fileDataGallery[this.product.product_images.length] = <File>fileInput.target.files[0];
          this.imagePreviewGallery = this.product.product_images.length
        } else {
          this.fileDataGallery[this.product.product_images.length] = <File>fileInput.target.files[0];
          this.imagePreviewGallery = this.product.product_images.length
        }
        this.imagePreviewGallery = this.fileDataGallery.length - 1

      } else {
        if (this.fileDataGallery === undefined) {
          this.fileDataGallery = []
          this.fileDataGallery[this.imagePreviewGallery] = <File>fileInput.target.files[0];
        } else {
          this.fileDataGallery[this.imagePreviewGallery] = <File>fileInput.target.files[0]
        }
      }
    }
    this.previewGallery();
  }

  /**
   * Metodo que genera la visualización previa de la imagen.
   * @returns 
   */

  public previewGallery() {
    var mimeType = this.fileDataGallery[this.imagePreviewGallery].type;
    if (mimeType.match(/image\/*/) == null) {
      return;
    }
    var reader = new FileReader();
    reader.readAsDataURL(this.fileDataGallery[this.imagePreviewGallery]);
    reader.onload = (_event) => {

      if (this.product.product_images.length === 0) {
        if (this.previewUrlGallery === undefined) {
          this.previewUrlGallery = [];
          this.imagePreviewGallery = this.imagePreviewGallery;
          this.previewUrlGallery.push(reader.result)
        } else {
          if (this.isEditImageGallery) {
            this.previewUrlGallery[this.imagePreviewGallery] = reader.result;
          } else {
            this.previewUrlGallery.push(reader.result)
          }
        }
      } else {
        if (!this.isEditImageGallery) {
          this.product.product_images.push('')
          if (this.previewUrlGallery === undefined) {
            this.previewUrlGallery = []
            this.previewUrlGallery[this.imagePreviewGallery] = reader.result;
          } else {
            this.previewUrlGallery[this.imagePreviewGallery] = reader.result;
          }

        } else {
          if (this.previewUrlGallery === undefined) {
            this.previewUrlGallery = []
            this.previewUrlGallery[this.imagePreviewGallery] = reader.result;
          } else {
            this.previewUrlGallery[this.imagePreviewGallery] = reader.result;
          }
        }
      }
    }
  }

  /**
   * Metodo que permite editar un producto
   * 1. Activa la opción para viualizar el producto
   * 2. Asigna el producto a editar a la variable this.product
   * 2. Iguala  el array de preview imagen a product_images
   * @param product 
   */
  public editProduct(product: Product) {
    if (product.product_id_category_name && product.product_id_category_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'menu') {
      this.isViewSelectDays = true;

    } else {
      this.isViewSelectDays = false;
    }
    this.product = product;
    this.product_select_aux = product;
    this.previewUrlGallery = product.product_images;
    this.fileDataGallery = undefined;
    $('#modalAdminProduct').modal('show');
    this.isEditProduct = true;
  }

  /**
   * Metodo para eliminar un producto.
   * 1. Se recorren las imagenes cargadas para eliminarlas del storage
   * 2. Se elimana producto de la colección produts
   * @param product 
   */
  public deleteProduct(product: Product) {
    Swal.fire({
      text: "¿Confirma que desea eliminar el producto seleccionado?",
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
        for (let index = 0; index < product.product_images.length; index++) {
          const image = product.product_images[index];
          this.storageService.deleteFileByURL(image);
          if (index + 1 === product.product_images.length) {
            this.productService.deleteProduct(this.provider_id, product.product_id);
            this.showNotification('top', 'right', 'nc-check-2', 'Se eliminó correctamente el producto.', 'success');
            this.getProducts()
          }
        }
      }
    })
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
    Swal.fire({
      icon: type,
      title: message,
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn btn-primary',
        cancelButton: 'btn btn-danger',
      },
      confirmButtonText: 'Aceptar'
    });
  }

  public setInfoEventsCalendarMenu(e) {
    const $calendar = $('#fullCalendar');
    this.calendarOptions = {
      headerToolbar: {
        left: "title",
        right: "prev,next",
      },
      locale: 'es',
      initialView: "dayGridMonth",
      dateClick: this.handleDateClick.bind(this),
      eventClick: this.handleEventClick.bind(this),
      events: e,
    };

  }
  nextMonth() {
    if (this.monthSelect === undefined) {
      this.monthSelect = (new Date().getMonth()) + 2;
    } else {
      this.monthSelect = (this.monthSelect + 1)
    }
    let year = new Date().getFullYear();
    let dateStart = year + '-' + this.utilSevrice.addZero((this.monthSelect)) + '-' + this.utilSevrice.addZero(1);
    let dateEnd = year + '-' + this.utilSevrice.addZero((this.monthSelect)) + '-' + this.utilSevrice.addZero(new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate());
    this.getEventsCalendar(dateStart, dateEnd)
  }
  prevMonth() {
    if (this.monthSelect === undefined) {
      this.monthSelect = (new Date().getMonth()) - 2;
    } else {
      this.monthSelect = (this.monthSelect - 1)
    }
    let year = new Date().getFullYear();
    let dateStart = year + '-' + this.utilSevrice.addZero((this.monthSelect)) + '-' + this.utilSevrice.addZero(1);
    let dateEnd = year + '-' + this.utilSevrice.addZero((this.monthSelect)) + '-' + this.utilSevrice.addZero(new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate());
    this.getEventsCalendar(dateStart, dateEnd)
  }

  handleDateClick(e) {
    this.arrayProductSelected = []
    this.isEditEvent = false;
    this.dateStr = e;
    let year = new Date().getFullYear();
    let day = new Date().getDate();
    let month = (new Date().getMonth() + 1);
    let date = year + '-' + this.utilSevrice.addZero(month) + '-' + this.utilSevrice.addZero(day);
    if (this.dateStr.dateStr <= date) {
      this.utilSevrice.showNotification('top', 'right', 'nc-alert-circle-i', 'No es posible agregar un menú a una fecha inferior a la actual.', 'warning');
    } else {
      this.getCategoryIdMenu()
    }

  }
  /**
    * *** Validamos el evento click sobre una hora acupada para dar un mensaje al usuario ***
    * @param clickInfo
    * @returns
    */
  async handleEventClick(clickInfo: EventClickArg) {
    this.arrayProductSelected = []
    this.isEditEvent = true;
    this.appointment = clickInfo.event.toJSON();
    this.menuSelect = this.array_menu[this.appointment.extendedProps.description];
    this.menuSelect.menu_product.product_state_in_menu = true;
    this.dataSourceModal = new MatTableDataSource<Product>([this.menuSelect.menu_product]);
    this.dataSourceModal.paginator = this.paginatorModal;
    this.dataSourceModal.sort = this.sortModal;
    $('#myModallistProducts').modal('show');
  }

  public getCategoryIdMenu() {
    this.categoriesService.getCategoryMenuByProviderId(this.infoUser.userId).pipe(take(1)).subscribe((category) => {
      this.category = category[0];
      this.getProductsMenu()
    })
  }
  public getProductsMenu() {
    this.productService.getProductsByCategoryMenu(this.infoUser.userId, this.category.category_id).pipe(take(1)).subscribe((products) => {
      this.dataSourceModal = new MatTableDataSource<Product>(products);
      this.dataSourceModal.paginator = this.paginatorModal;
      this.dataSourceModal.sort = this.sortModal;
      $('#myModallistProducts').modal('show');
    })
  }

  public selectProduct(e, product: Product) {
    if (e.checked) {
      if (this.arrayProductSelected.includes(product)) {
        return;
      } else {
        this.arrayProductSelected.push(product)
      }
    } else {
      if (this.arrayProductSelected.includes(product)) {
        let i = this.arrayProductSelected.indexOf(product);
        this.arrayProductSelected.splice(i, 1)
      } else {
        return;
      }
    }
  }

  public addMenu() {
    if (this.arrayProductSelected && this.arrayProductSelected.length > 0) {
      this.menuService.getMenuProviderId(this.infoUser.userId).pipe(take(1)).subscribe((provider) => {
        if (provider === undefined) {
          this.menuService.setProviderIdInMenu(this.infoUser.userId);
          for (let index = 0; index < this.arrayProductSelected.length; index++) {
            const product = this.arrayProductSelected[index];
            let menu: Menu = {
              menu_date: this.dateStr.dateStr,
              menu_product: product,
              menu_provider_id: this.infoUser.userId,
              menu_id: (new Date().getTime().toString() + index),
            }
            this.menuService.saveMenu(menu).then(() => {
              if (index + 1 === this.arrayProductSelected.length) {
                $('#myModallistProducts').modal('hide');
                this.showNotification('top', 'right', 'nc-check-2', 'Se realizó la registro correctamente.', 'success');
              }
            })
          }
        } else {
          for (let index = 0; index < this.arrayProductSelected.length; index++) {
            const product = this.arrayProductSelected[index];
            let menu: Menu = {
              menu_date: this.dateStr.dateStr,
              menu_product: product,
              menu_provider_id: this.infoUser.userId,
              menu_id: (new Date().getTime().toString() + index),
            }
            this.menuService.saveMenu(menu).then(() => {
              if (index + 1 === this.arrayProductSelected.length) {
                $('#myModallistProducts').modal('hide');
                this.showNotification('top', 'right', 'nc-check-2', 'Se realizó la registro correctamente.', 'success');
              }
            })
          }
        }
      })
    } else {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Debe seleccionar al menos un producto.', 'warning');
    }
  }

  public getEventsCalendar(dateStart: any, dateEnd: any) {
    this.menuService.getEventsMenu(this.infoUser.userId, dateStart, dateEnd).subscribe((events: Array<Menu>) => {
      this.array_menu = events;
      this.array_events = []
      if (events.length > 0) {
        for (let index = 0; index < events.length; index++) {
          const element = events[index];
          let eventCalendar: Calendar = {
            title: element.menu_product.product_name,
            start: element.menu_date,
            className: 'event-default',
            allDay: false,
            description: index
          }
          this.array_events.push(eventCalendar);
          if (this.array_events.length === events.length) {
            this.setInfoEventsCalendarMenu(this.array_events)
          }
        }
      } else {
        this.setInfoEventsCalendarMenu([])

      }

    })
  }

  public cancelAdminMenu() {
    this.isAdminMenu = false;
    $('#multiCollapseMenu').collapse('hide');
  }

  public deleteProductMenu() {
    Swal.fire({
      text: '¿Confirma que desea eliminar este producto del menú?',
      icon: 'warning',
      showCancelButton: true,
      customClass: {
        confirmButton: 'btn btn-success',
        cancelButton: 'btn btn-danger',
      },
      confirmButtonText: 'Sí, eliminar!',
      cancelButtonText: 'Cancelar',
      buttonsStyling: false
    }).then((result) => {
      if (result.isConfirmed) {
        this.menuService.deleteMenu(this.menuSelect).then(() => {
          this.showNotification('top', 'right', 'nc-check-2', 'Se realizó la eliminación correctamente.', 'success');
          $('#myModallistProducts').modal('hide');
        })
      }

    })
  }

  ngAfterViewInit(): void {
    $('.fc-prev-button').on('click', x => {
      this.prevMonth()
    });
    $('.fc-next-button').on('click', x => {
      this.nextMonth()
    });
  }
}