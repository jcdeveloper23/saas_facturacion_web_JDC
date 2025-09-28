import { Component, OnInit } from '@angular/core';
import { Student } from 'app/interfaces/student';
import { Levels } from 'app/interfaces/levels';
import { Parallels } from 'app/interfaces/parallels';
import { LevelsService } from 'app/services/levels/levels.service';
import { ParallelsService } from 'app/services/parallels/parallels.service';
import { take } from 'rxjs/operators';
import { StudentService } from 'app/services/student/student.service';
import { Representative } from 'app/interfaces/representative';
import { NgForm } from '@angular/forms';
import { StorageService } from 'app/services/storage/storage.service';
import { FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { UtilsService } from 'app/services/utils/utils.service';
import { Users } from 'app/interfaces/users';
import { LoadingService } from 'app/services/loading/loading.service';
import { FirestoreExportService } from 'app/services/firestoreExportService/firestore-export-service.service';
// import * as jsonData from '../../../../assets/data/lines.json';
// import * as jsonDataP from '../../../../assets/data/products.json';
// import * as jsonDataRep from '../../../../assets/data/representatives.json';
// import * as jsonDataStudent from '../../../../assets/data/students.json';
import { Lines } from 'app/interfaces/lines';
import { LinesService } from 'app/services/lines/lines.service';
import { Product } from 'app/interfaces/product';
import { ProductsService } from 'app/services/products/products.service';
import { RepresentativeService } from 'app/services/representative/representative.service';

declare var $: any;

@Component({
  selector: 'app-representative-student',
  templateUrl: './representative-student.component.html',
  styleUrls: ['./representative-student.component.css']
})
export class RepresentativeStudentComponent implements OnInit {
  public showFormAddStudents: boolean = false;
  public student: Student;
  public array_gender: Array<string> = ['Femenino', 'Masculino'];
  public levels: Array<Levels> = [];
  public parallels: Array<Parallels>;
  public provider_school_id = ''
  public arrayStudents: Array<Student> = [];
  public representative: Representative;
  public fileDataImage: File = null;
  public previe_url_image: any = null;
  public isEdit: boolean = false;
  public infoUser: Users;
  // jsonDataLines: any = jsonData;
  // jsonDataProducts: any = jsonDataP;
  // jsonDataRepresentatives: any = jsonDataRep;
  // jsonDataStudents: any = jsonDataStudent;


  constructor(
    private levelsService: LevelsService,
    private parallelsService: ParallelsService,
    private studentService: StudentService,
    private storageService: StorageService,
    private router: Router,
    private utilService: UtilsService,
    public loadingService: LoadingService,
    private exportService: FirestoreExportService,
    private lineService: LinesService,
    private productService: ProductsService,
    private representativeService: RepresentativeService,

  ) { }

  ngOnInit(): void {
    this.loadingService.show('Cargando...');
    this.representative = {};
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    if (this.infoUser) {
      this.representative.representative_id = this.infoUser.userId;
      this.student = {
        student_gender: ''
      };
      this.parallels = [];
      this.arrayStudents = [];
      this.getStudents();
      this.getLevels();
    }
  }
  /**
   * metodo para editar Estudiante
   * @param student 
   * @param isValid 
   * @param form 
   */
  public updateStudent(student: Student, isValid: boolean, form: NgForm) {
    if (isValid) {
      this.studentService.updateStudent(this.student).then(() => {
        this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente. ', 'success');
        $('#multiCollapseStudents').collapse('hide');
        this.showFormAddStudents = false;
      })
    }
  }
  /**
   * Metodo para guardar estudiante, donde si no tiene id se le asigna, si está vacios
   * los campos de level, parallel, genero no guarda y manda una notificacción para que sean llenados los campos
   * de igual forma debe validar que las contraseñas sean iguales para guardar
   * asi como guardar la imagen
   * si no se está editando el formulario se manda a guardar el estudiante con los datos llenados, en 
   * el caso contario se editan los datos
   * @param student 
   * @param isValid 
   * @param form 
   */
  public async saveStudent(student: Student, isValid: boolean, form: NgForm) {
    if (this.student.student_id == undefined) {
      this.student.student_id = new Date().getTime().toString();
    }


    if (this.student.student_level == undefined || this.student.student_parallel == undefined || this.student.student_gender == undefined) {
      this.showNotification('top', 'right', 'nc-check-2', 'Por favor complete todos los campos', 'danger');
    } else {
      if (isValid) {
        if (student.student_password == student.student_password_confirm) {

          if (this.fileDataImage) {
            await this.storageService.uploadFile(`students/${this.student.student_id}/profile_picture.png`, this.fileDataImage).then((result) => {
              this.student.student_img = result;
            })
          }
          if (!this.isEdit) {
            this.student.student_id_representative = this.representative.representative_id;
            this.student.student_state = true;
            this.student.student_state_register = false;
            this.student.student_date_register = this.utilService.getDateCurrent();
            this.student.student_id_school = this.provider_school_id;
            this.studentService.saveStudent(this.student).then(() => {
              this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente. ', 'success');
              $('#multiCollapseStudents').collapse('hide');
              this.showFormAddStudents = false;

            })
          } else {
            this.studentService.updateStudent(this.student).then(() => {
              this.showNotification('top', 'right', 'nc-check-2', 'Se completó la edición exitosamente. ', 'success');
              $('#multiCollapseStudents').collapse('hide');
              this.showFormAddStudents = false;

            })
          }
        } else { /// si no coinciden 
          this.showNotification('top', 'right', 'nc-alert-circle-i', 'Las contreseñas ingresadas no coinciden', 'danger');
        }
      }
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
   * Metodo para obtener estudiantes de un representante se consulta el id del representante
   */
  public getStudents() {
    this.studentService.getStudentsByRepresentative(this.representative.representative_id).subscribe(students => {
      this.arrayStudents = students;
      this.loadingService.hide();
    })
  }

  /**
   * Metodo para obtener los niveles, depende de la unidad educativa
   */
  public getLevels() {
    this.levelsService.getLevelsBySchool(this.provider_school_id).pipe(take(1)).subscribe(levels => {
      this.levels = levels;
    })
  }

  /**
   * Metodo para seleccionar el nivel consultar los paralelos del nivel seleccionado
   * @param e 
   */
  public selectLevel(e) {
    if (e.value) {
      this.parallelsService.getParallelsBySchool(e.value).pipe(take(1)).subscribe(paralles => {
        this.parallels = paralles;
      })
    }
  }

  /**
   * Metodo para seleccionar el nivel por estudiante, 
   * consultamos los paralelos del nivel que tiene el estudiante, 
   * le agrego los paralelos a la lista de paralelos
   */
  public selectLevelByStudent() {
    if (this.student.student_level) {
      this.parallelsService.getParallelsBySchool(this.student.student_level).pipe(take(1)).subscribe(paralles => {
        this.parallels = paralles;
      })
    }
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
    var mimeType = this.fileDataImage.type;
    if (mimeType.match(/image\/*/) == null) {
      return;
    }
    var reader = new FileReader();
    reader.readAsDataURL(this.fileDataImage);
    reader.onload = (_event) => {
      this.previe_url_image = reader.result;
    }
  }

  /**
   * Metodo para seleccionar el estudiante, con su nivel asignado y con todos los campo llenos
   * @param student 
   */
  selectedStudent(student: Student) {
    console.log(student);

    this.student = student;
    this.selectLevelByStudent();
    this.isEdit = true;
    this.previe_url_image = null;
    this.showFormAddStudents = true;
  }

  /**
   * Metodo para agregar estudiante con el formulario en vacio porque no estoy editando
   * para poder agregar un nuevo estudiante
   * se limpia el estudiante y se setea en false la variable que controla la edicion
   * mastramos u ocultamos el form de agregar/editae estudiante cambiando la variable showFormAddStudents
   */
  addStudent() {
    this.showFormAddStudents = !this.showFormAddStudents;
    this.student = {
      student_gender: ''

    };
    this.isEdit = false;
  }


  public viewProviders(student: Student) {
    this.router.navigate(['perfil-representative/createOrder/' + student.student_id])
  }

  public viewProviderss(student: Student) {
    // this.loadDataLines();
    // this.loadDataProducts();
    // this.loadDataRepresentatives();
    // this.loadDataStudent();
    // this.export();
    // this.router.navigate(['perfil-representative/listProvider/' + student.student_id])
  }

  public export() {
    /// exporta los proveedores y las ordenes
    // this.exportService.exportCollectionToJson(); // Cambia 'orders' por el nombre de tu colección

  }



  public viewOrdersByStudent(student: Student) {
    this.router.navigate(['perfil-representative/listOrders/' + student.student_id])
  }

  public viewAllergiesByStudent(student: Student) {
    this.router.navigate(['perfil-representative/allergies/' + student.student_id])
  }



  // /**
  //  * *** Metodos para migrar data luncher ***
  //  */

  // public loadDataLines() {
  //   console.log('Data', this.jsonDataLines.default);
  //   var lines = this.jsonDataLines.default;
  //   lines.forEach(line => {
  //     if (line.category_provider_id == '1636600391774') {
  //       console.log('Line', JSON.stringify(line));
  //       this.saveLine(line);
  //     }
  //   });
  // }

  // /**
  //    * Metodo para registrar o actualizar una nueva linea.
  //    * @param line 
  //    * @param isValid 
  //    */
  // public saveLine(line: Lines) {

  //   this.lineService.saveLine(line).then(() => {
  //     this.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
  //   })
  // }



  // /**
  //  * *** Metodos para migrar data luncher ***
  //  */

  // public loadDataProducts() {
  //   console.log('Data', this.jsonDataProducts.default);
  //   var products = this.jsonDataProducts.default;
  //   products.forEach(product => {
  //     if (product.product_provider_id == '1632771782677') {
  //       console.log('Product', JSON.stringify(product.product_id, null, 2));
  //       this.saveProduct(product);
  //     }
  //   });
  // }

  // /**
  //    * Metodo para registrar o actualizar producto.
  //    */
  // public saveProduct(product: Product) {
  //   this.productService.saveProduct(product.product_provider_id, product).then(() => {
  //     this.showNotification('top', 'right', 'nc-check-2', 'Se realizó el registro correctamente', 'success');
  //   })
  // }

  // public loadDataRepresentatives() {
  //   console.log('Data', this.jsonDataRepresentatives.default);
  //   var reps = this.jsonDataRepresentatives.default;
  //   reps.forEach(rep => {
  //     console.log('Rep', JSON.stringify(rep.representative_id, null, 2));
  //     this.saveRepresentatives(rep);
  //   });
  // }

  // /**
  //    * Metodo para registrar o actualizar producto.
  //    */
  // public saveRepresentatives(rep: Representative) {
  //   this.representativeService.saveRepresentative(rep).then(() => {
  //   })
  // }

  // public loadDataStudent() {
  //   console.log('Data', this.jsonDataStudents.default);
  //   var std = this.jsonDataStudents.default;
  //   std.forEach(st => {
  //     if (st.student_id != undefined) {
  //       console.log('Student', JSON.stringify(st.student_id, null, 2));
  //       this.saveStudents(st);
  //     }
  //   });
  // }

  // /**
  //    * Metodo para registrar o actualizar producto.
  //    */
  // public saveStudents(std: Student) {
  //   this.studentService.saveStudent(std).then(() => {
  //   })
  // }

}
