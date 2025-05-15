import { Component, OnInit, SimpleChanges } from '@angular/core';
import { FormControl, FormControlDirective, NgForm } from '@angular/forms';
import { ActivatedRoute, ActivationEnd, Router } from '@angular/router';
import { ThirdPartyDraggable } from '@fullcalendar/interaction';
import { Levels } from 'app/interfaces/levels';
import { Parallels } from 'app/interfaces/parallels';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { AuthService } from 'app/services/authService/auth.service';
import { LevelsService } from 'app/services/levels/levels.service';
import { ParallelsService } from 'app/services/parallels/parallels.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StorageService } from 'app/services/storage/storage.service';
import { StudentService } from 'app/services/student/student.service';
import { UsersService } from 'app/services/users/users.service';
import { UtilsService } from 'app/services/utils/utils.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';
declare var swal: any;
declare var $: any;

interface FileReaderEventTarget extends EventTarget {
  result: string
}
interface FileReaderEvent extends Event {
  target: FileReaderEventTarget;
  getMessage(): string;
}

@Component({
  selector: 'app-register-representative',
  templateUrl: './register-representative.component.html',
  styleUrls: ['./register-representative.component.css']
})
export class RegisterRepresentativeComponent implements OnInit {
  public focus: any;
  public focus1: any;
  public focus2: any;
  public students: Array<Student>;
  public representative: Representative = {};
  public representative_id: any;
  public school_id: any;
  public student: Student;
  public array_gender = ['Femenino', 'Masculino'];
  public levels: Array<Levels>;
  public parallels: Array<Parallels>;
  public indexForm: number;
  public paymentForm = new FormControl();
  public fileDataRepresentative: File;
  public previewUrlRepresentative: any = null;
  public indexStudentSelect: number;
  private formsStudents: Array<boolean> = [];
  public isValidFormStudent = false;
  public levelsForm = new FormControl();
  public genderForm = new FormControl();
  public parallelsForm = new FormControl();
  public arrayStudentsFail: Array<boolean> = [];
  public alertEmailRepresentative = false;
  public alertEmailStudent = false;
  public array_students_validate_email: Array<string> = [];
  public registerFromEmail: boolean; // desde el correo = true, desde home page = false
  public lective_year_id: any;
  constructor(private activatedRoute: ActivatedRoute,
    private router: Router,
    private representativeService: RepresentativeService,
    private studentService: StudentService,
    private levelsService: LevelsService,
    private parallelsService: ParallelsService,
    private storageService: StorageService,
    private authService: AuthService,
    private userService: UsersService,
    private utilService: UtilsService
  ) { }

  ngOnInit(): void {
    $('.modal').appendTo('body');
    this.representative = {};
    this.student = {};
    this.school_id = this.activatedRoute.snapshot.params.school_id;
    /**
     * Reviso si el usuario ingresa desde la pagina de registro o desde url de correo
     * */
    if (!this.activatedRoute.snapshot.params.hasOwnProperty('representative_id')) {
      this.lective_year_id = localStorage.getItem('lectiveYear');
      this.registerFromEmail = false;
      this.representative_id = 0;
    } else {
      this.registerFromEmail = true;
      this.representative_id = this.activatedRoute.snapshot.params.representative_id;
      setTimeout(() => {
        $('#modalRegister').modal('show');
        $('#modalRegister').modal({ backdrop: 'static', keyboard: false });
        this.validateUrl();
        this.checkEventsInUrl();
      }, 1000);
    }
    this.initWizard();
  }


  /**
   * Método para obtener niveles de unidad educativa
   */
  public getLevels() {
    this.levelsService.getLevelsBySchool(this.school_id).pipe(take(1)).subscribe(levels => {
      this.levels = levels;
    })
  }

  /**
   * Método para obtener el evento de selección de niveles y consultar paralelos
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
   * Método para validar datos obtenidos de url
   */
  public validateUrl() {
    this.getinfoRepresentative(this.representative_id);
  }

  /**
   * Método para escuchar cambio  de url
   */
  public checkEventsInUrl() {
    this.router.events.subscribe((event) => {
      if (event instanceof ActivationEnd) {
        if (
          event.snapshot.params['school_id'] &&
          event.snapshot.params['representative_id']
        ) {
          this.representative_id = event.snapshot.params['representative_id'];
          this.getinfoRepresentative(this.representative_id);
        }
      }
    });
  }

  /**
   * Método para seleccionar estudiante de lista de estudiantes
   * y consultar los paralelos del nivel del estudiante
   * @param student
   * @param i
   */
  public selectStudent(student: Student, i: number) {
    this.student = student;
    this.indexStudentSelect = i;
    if (student.student_level !== undefined) {
      this.parallelsService.getParallelsBySchool(student.student_level).pipe(take(1)).subscribe(paralles => {
        this.parallels = paralles;
      })
    }

  }

  /**
   * Método para obtener información de un representante
   * @param id_representative
   */
  public getinfoRepresentative(id_representative: string) {
    this.representativeService.getRepresentativeId(id_representative).pipe(take(1)).subscribe((representatives: Representative) => {
      this.representative = representatives;

      if (this.representative) {
        this.userService.getUserByEmail(this.representative.representative_email).pipe(take(1)).subscribe((email) => {
          const emailUser = email;
          if (emailUser && emailUser.length > 0) {
            this.alertEmailRepresentative = true;
          } else {
            this.getLevels()
            this.getInfoStudents(id_representative);
          }
        });

      }
    })
  }

  /**
   * Métodos para consultar lista de estudiantes de un representante
   * @param id_representative
   */
  public getInfoStudents(id_representative: string) {
    this.studentService.getStudentsByRepresentative(id_representative).pipe(take(1)).subscribe((students: Array<Student>) => {
      if (students && students.length > 0) {
        this.students = students;
        this.student = students[0];
        if (students[0].student_level !== undefined) {
          this.parallelsService.getParallelsBySchool(students[0].student_level).pipe(take(1)).subscribe(paralles => {
            this.parallels = paralles;
          })
        }
      } else {
        this.addStudent();
      }

    })
  }

  /**
   * Método para ocultar modal de confirmar registro
   */
  public confirmRegister() {
    $('#modalRegister').modal('hide');

  }


  readURL(input) {
    if (input.files && input.files[0]) {
      const reader: any = new FileReader();

      reader.onload = (e: FileReaderEvent) => {
        $('#wizardPicturePreview').attr('src', e.target.result).fadeIn('slow');
      }
      reader.readAsDataURL(input.files[0]);
    }
  }

  /**
   * Inicializar wizard
   */
  public initWizard() {
    setTimeout(function () {
      $('.card.card-wizard').addClass('active');
    }, 600);
    if ($('.selectpicker').length != 0) {
      $('.selectpicker').selectpicker({
        iconBase: 'nc-icon',
        tickIcon: 'nc-check-2'
      });
    }
    // Code for the Validator
    const $validator = $('.card-wizard #form-representative').validate({

      rules: {
        representative_identification: {
          required: true,
          minlength: 8
        },
        representative_email: {
          required: true,
        },
        representative_password: {
          required: true,
          minlength: 6,
        },
        representative_password_confirm: {
          required: true,
          minlength: 6,
        },
        representative_name: {
          required: true,
        },
        representative_surname: {
          required: true,
        },
        representative_address: {
          required: true,
        },
        representative_mobile: {
          required: false,
        }
      },

      highlight: function (element) {
        // $(element).closest('.form-group').removeClass('has-success').addClass('has-danger');
      },
      success: function (element) {
        // $(element).closest('.form-group').removeClass('has-danger').addClass('has-success');
      },
      errorPlacement: function (error, element) {
        //   //  $(element).rem(error);
      }


    });

    // Wizard Initialization
    $('.card-wizard').bootstrapWizard({
      'tabClass': 'nav nav-pills',
      'nextSelector': '.btn-next',
      'previousSelector': '.btn-previous',

      onNext: function (tab, navigation, index) {
        if (index === 1) {
          const $valid = $('.card-wizard #form-representative').valid();
          if (!$valid) {
            //  $validator.focusInvalid();
            return false;
          }
        }
        if (index === 2) {
          const value = $('#input-validate-student').val();
          if (value == 'true') {
            return true;
          } else {
            return false;
          }
        }
        if (index === 3) {
          const $validatorFormPayment = $('.card-wizard #form-payment_methods').valid();
          if (!$validatorFormPayment) {
            //  $validator.focusInvalid();
            return false;
          }
        }

      },


      onInit: function (tab: any, navigation: any, index: any) {

        // check number of tabs and fill the entire row
        let $total = navigation.find('li').length;
        const $wizard = navigation.closest('.card-wizard');

        const $first_li = navigation.find('li:first-child a').html();
        const $moving_div = $('<div class="moving-tab">' + $first_li + '</div>');
        $('.card-wizard .wizard-navigation').append($moving_div);

        $total = $wizard.find('.nav li').length;
        let $li_width = 100 / $total;

        const total_steps = $wizard.find('.nav li').length;
        let move_distance = $wizard.width() / total_steps;
        let index_temp = index;
        let vertical_level = 0;

        const mobile_device = $(document).width() < 600 && $total > 3;

        if (mobile_device) {
          move_distance = $wizard.width() / 2;
          index_temp = index % 2;
          $li_width = 50;
        }

        $wizard.find('.nav li').css('width', $li_width + '%');

        const step_width = move_distance;
        move_distance = move_distance * index_temp;

        const $current = index + 1;

        if ($current == 1 || (mobile_device == true && (index % 2 == 0))) {
          move_distance -= 8;
        } else if ($current == total_steps || (mobile_device == true && (index % 2 == 1))) {
          move_distance += 8;
        }

        if (mobile_device) {
          const x: any = index / 2;
          vertical_level = parseInt(x);
          vertical_level = vertical_level * 38;
        }

        $wizard.find('.moving-tab').css('width', step_width);
        $('.moving-tab').css({
          'transform': 'translate3d(' + move_distance + 'px, ' + vertical_level + 'px, 0)',
          'transition': 'all 0.5s cubic-bezier(0.29, 1.42, 0.79, 1)'

        });
        $('.moving-tab').css('transition', 'transform 0s');
      },


      onTabShow: function (tab: any, navigation: any, index: any) {
        let $total = navigation.find('li').length;
        let $current = index + 1;

        const $wizard = navigation.closest('.card-wizard');

        // If it's the last tab then hide the last button and show the finish instead
        if ($current >= $total) {
          $($wizard).find('.btn-next').hide();
          $($wizard).find('.btn-finish').show();
        } else {
          $($wizard).find('.btn-next').show();
          $($wizard).find('.btn-finish').hide();
        }

        const button_text = navigation.find('li:nth-child(' + $current + ') a').html();

        setTimeout(function () {
          $('.moving-tab').html(button_text);
        }, 150);

        const checkbox = $('.footer-checkbox');

        if (index == 0) {
          $(checkbox).css({
            'opacity': '0',
            'visibility': 'hidden',
            'position': 'absolute'
          });
        } else {
          $(checkbox).css({
            'opacity': '1',
            'visibility': 'visible'
          });
        }

        $total = $wizard.find('.nav li').length;
        let $li_width = 100 / $total;

        const total_steps = $wizard.find('.nav li').length;
        let move_distance = $wizard.width() / total_steps;
        let index_temp = index;
        let vertical_level = 0;

        const mobile_device = $(document).width() < 600 && $total > 3;

        if (mobile_device) {
          move_distance = $wizard.width() / 2;
          index_temp = index % 2;
          $li_width = 50;
        }

        $wizard.find('.nav li').css('width', $li_width + '%');

        const step_width = move_distance;
        move_distance = move_distance * index_temp;

        $current = index + 1;
        if (mobile_device) {
          const x: any = index / 2;
          vertical_level = parseInt(x);
          vertical_level = vertical_level * 38;
        }

        $wizard.find('.moving-tab').css('width', step_width);
        $('.moving-tab').css({
          'transform': 'translate3d(' + move_distance + 'px, ' + vertical_level + 'px, 0)',
          'transition': 'all 0.5s cubic-bezier(0.29, 1.42, 0.79, 1)'

        });
      }
    });
    $('.set-full-height').css('height', 'auto');
  }



  ngAfterViewInit() {
    $(window).resize(() => {
      $('.card-wizard').each(function () {
        const $wizard = $(this);
        const index = $wizard.bootstrapWizard('currentIndex');
        const $total = $wizard.find('.nav li').length;
        let $li_width = 100 / $total;

        const total_steps = $wizard.find('.nav li').length;
        let move_distance = $wizard.width() / total_steps;
        let index_temp = index;
        let vertical_level = 0;

        const mobile_device = $(document).width() < 600 && $total > 3;

        if (mobile_device) {
          move_distance = $wizard.width() / 2;
          index_temp = index % 2;
          $li_width = 50;
        }

        $wizard.find('.nav li').css('width', $li_width + '%');

        const step_width = move_distance;
        move_distance = move_distance * index_temp;

        const $current = index + 1;

        if ($current == 1 || (mobile_device == true && (index % 2 == 0))) {
          move_distance -= 8;
        } else if ($current == total_steps || (mobile_device == true && (index % 2 == 1))) {
          move_distance += 8;
        }

        if (mobile_device) {
          const x: any = index / 2;
          vertical_level = parseInt(x);
          vertical_level = vertical_level * 38;
        }

        $wizard.find('.moving-tab').css('width', step_width);
        $('.moving-tab').css({
          'transform': 'translate3d(' + move_distance + 'px, ' + vertical_level + 'px, 0)',
          'transition': 'all 0.5s cubic-bezier(0.29, 1.42, 0.79, 1)'
        });

        $('.moving-tab').css({
          'transition': 'transform 0s'
        });
      });
    });
  }

  public onBlurMethodEmailRep() {
    this.validateEmailUser(this.representative.representative_email, 'rep')
  }

  public onBlurMethodEmailStudent(email_student: string, student: Student) {
    this.validateEmailUser(email_student, 'student', student);
  }

  public validateEmailUser(email: string, type: string, student?: Student) {
    let emailUser = null
    if (email !== undefined) {
      this.userService.getUserByEmail(email).pipe(take(1)).subscribe((emailUser1) => {
        emailUser = emailUser1;
        if (type === 'rep') {
          if (emailUser !== undefined && emailUser && emailUser.length > 0) {
            this.alertEmailRepresentative = true;
          } else {
            this.alertEmailRepresentative = false
          }
        } else {
          if (emailUser1 && emailUser1.length > 0) {
            if (student.student_email_is_valid) {
              // console.log('***** EMAIL IS VALID*******');

              this.array_students_validate_email.push(email);

            }
            if (student && this.array_students_validate_email.includes(student.student_email)) {
              // console.log('***** NO LO INCLUYE*******');

              student.student_email_is_valid = false
            } else {
              student.student_email_is_valid = true

            }
          } else {
            student.student_email_is_valid = true
            if (this.array_students_validate_email.length > 1) {
              // console.log('***** LENGTH ES MAYOR A 1 EMAIL IS VALID*******');

              this.array_students_validate_email.splice(0, 1);
            } else if (this.array_students_validate_email.length === 1) {
              // console.log('***** LENGTH ES IGUAL A 1  EMAIL IS VALID*******');

              this.array_students_validate_email = []
            }

          }
          if (this.array_students_validate_email.length === 0) {
            this.alertEmailStudent = false;

          } else {
            this.alertEmailStudent = true;

          }
        }

      });
    }

  }

  ngOnChanges(changes: SimpleChanges) {
    const input = $(this);

    if (input[0].files && input[0].files[0]) {
      const reader: any = new FileReader();

      reader.onload = function (e: FileReaderEvent) {
        $('#wizardPicturePreview').attr('src', e.target.result).fadeIn('slow');
      };
      reader.readAsDataURL(input[0].files[0]);
    }
  }

  public async saveRepresentative(representative: Representative, isValid: boolean, form: NgForm) {
    // console.log(this.representative);
    if (this.students && this.students.length > 0) {
      for (let index = 0; index < this.students.length; index++) {
        const element = this.students[index];
        // console.log('VALIDA USUARIO EXISTENTE ESTUDIANTE');
        element.student_email_is_valid = true;
        if (element.student_email) {
          this.userService.getUserByEmail(element.student_email).pipe(take(1)).subscribe((emailUser1) => {
            if (emailUser1 && emailUser1.length > 0) {
              this.array_students_validate_email.push(element.student_email);
              element.student_email_is_valid = false;
            } else {
              element.student_email_is_valid = true;
            }
          });
        } else {
          element.student_email_is_valid = true;
        }
      }
    }

  }

  /**
   * Método para registrar información registrada en el formulario.
   * 1. Se muestra el modal de cargando
   * 2. Se recorren todos los estudiantes agregados para guardar y actualizar la información en base de datos y en authentication
   * 3. Luego de validar que todos los estudiantes se hayan registrados se guarda la información del representante
   */
  public async registerInfo() {
    try {
      $('#modalLoading').modal('show');
      $('#modalLoading').modal({ backdrop: 'static', keyboard: false });

      /** Si el registro se lo realiza desde el email*/
      if (this.registerFromEmail) {
        for (let index = 0; index < this.students.length; index++) {
          const student: Student = this.students[index];
          if (student.student_email && student.student_password) {
            await this.authService
              .registerUserForAuth(
                student.student_email,
                student.student_password
              )
              .then(async (result) => {
                if (result != undefined) {
                  const user: Users = {
                    user_name: student.student_name,
                    user_email: student.student_email,
                    user_uid: result.uid,
                    user_state: true,
                    users_account_type: '3',
                    users_rol: 'student',
                    user_id_school: this.school_id,
                    user_id: student.student_id,
                  }
                  this.userService.saveUser(user).then(() => {
                    this.studentService.getStudentById(student).pipe(take(1)).subscribe((s) => {
                      if (s) {
                        this.studentService.updateStudent(student);
                      } else {
                        this.studentService.saveStudent(student)
                      }
                    })

                  });

                }
              });
          }
          if (index + 1 === this.students.length) {
            if (this.fileDataRepresentative) {
              await this.storageService.uploadFile(`representative/representative${this.representative.representative_id}/image${this.representative.representative_id}.png`, this.fileDataRepresentative).then((result) => {
                this.representative.representative_image = result;
              })
            }
            await this.authService
              .registerUserForAuth(
                this.representative.representative_email,
                this.representative.representative_password
              )
              .then(async (result) => {
                if (result != undefined) {
                  const representative: Users = {
                    user_name: this.representative.representative_name,
                    user_email: this.representative.representative_email,
                    user_uid: result.uid,
                    user_state: true,
                    users_account_type: '2',
                    users_rol: 'representative',
                    user_id_school: this.school_id,
                    user_id: this.representative.representative_id,
                  }
                  await this.userService.saveUser(representative);
                  this.representative.representative_state = true;
                  this.representative.representative_state_confirm = true;
                  this.representative.representative_state_confirm_by_bar = false;
                  this.representative.representative_request_access_state = 2 ;

                  await this.representativeService.updateRepresentative(this.representative).then(() => {
                    $('#modalLoading').modal('hide');
                    $('.modal-backdrop').css('display', 'none');
                    $('body').removeClass('modal-open');
                    $('body').css('padding', '0px');
                    this.showNotification('top', 'right', 'nc-check-2', 'Se completó el registro exitosamente!. ', 'success');
                    this.router.navigate(['']);
                  })
                }

              })
          }
        }
      } else { /* Si se registra desde la pagina de registro */
        this.representative.representative_schools = [this.school_id];
        this.representative.representative_id = Date.now().toString();
        for (let index = 0; index < this.students.length; index++) {
          const student = this.students[index];
          student.student_id_representative = this.representative.representative_id;
          student.student_id_school = this.school_id;
          student.student_state_register = true;
          this.studentService.saveStudent(student);

          await this.authService.registerUserForAuth(
            student.student_email,
            student.student_password
          ).then(async (result) => {
            if (result != undefined) {
              const user: Users = {
                user_name: student.student_name,
                user_email: student.student_email,
                user_uid: result.uid,
                user_state: true,
                users_account_type: '3',
                users_rol: 'student',
                user_id_school: this.school_id,
                user_id: student.student_id,
              }

              this.userService.saveUser(user).then(() => {
                this.studentService.getStudentById(student).pipe(take(1)).subscribe((s) => {
                  if (s) {
                    this.studentService.updateStudent(student);
                  } else {
                    this.studentService.saveStudent(student)
                  }
                })
              });
            }
          });

          if (!this.representative.representative_students) {
            this.representative.representative_students = [student.student_id]
          } else {
            this.representative.representative_students.push(student.student_id)
          }

          if (index + 1 === this.students.length) {
            if (this.fileDataRepresentative) {
              await this.storageService.uploadFile(`representative/representative${this.representative.representative_id}/image${this.representative.representative_id}.png`, this.fileDataRepresentative).then((result) => {
                this.representative.representative_image = result;
              })
            }
            this.representativeService.saveRepresentative(this.representative).then(async () => {
              this.representative.representative_send_email = 0;
              await this.authService
                .registerUserForAuth(
                  this.representative.representative_email,
                  this.representative.representative_password
                ).then(async (result) => {
                  if (result != undefined) {
                    const representative: Users = {
                      user_name: this.representative.representative_name,
                      user_email: this.representative.representative_email,
                      user_uid: result.uid,
                      user_state: true,
                      users_account_type: '2',
                      users_rol: 'representative',
                      user_id_school: this.school_id,
                      user_id: this.representative.representative_id,
                    }
                    await this.userService.saveUser(representative);
                    this.representative.representative_state = true;
                    this.representative.representative_state_confirm = true;
                    this.representative.representative_state_confirm_by_bar = false;
                    this.representative.representative_request_access_state = 2;
                    this.representative.representative_lective_year = this.lective_year_id;
                    await this.representativeService.updateRepresentative(this.representative);
                  }
                })
            })
          }
        }
      }

      $('#modalLoading').modal('hide');
      $('.modal-backdrop').css('display', 'none');
      $('body').removeClass('modal-open');
      $('body').css('padding', '0px');
      this.router.navigate(['']);

    } catch (error) { }

  }

  /**
   * 1.Métodos para simular click en formularios y validar la data
   * 2. Se valida que toda la infomación de todos los estudiantes este completa.
   */
  public nextForm() {
    document.getElementById('submit-form-representative').click();

    $('.card-wizard').each(function () {
      const $wizard = $(this);
      const index = $wizard.bootstrapWizard('currentIndex');
      if (index === 1) {
        document.getElementById('send-form-student').click();
      }
      if (index === 2) {
        document.getElementById('form-payment_methods').click();
      }
    })
    this.isValidFormStudent = false;
    this.formsStudents = [];
    if (this.students && this.students.length > 0) {
      for (let index = 0; index < this.students.length; index++) {
        const student = this.students[index];
        if (!this.isValidFormStudent) {
          if (student.student_password !== undefined && student.student_password_confirm !== null && student.student_name !== undefined &&
            student.student_lastname !== undefined && student.student_level !== undefined && student.student_parallel !== undefined &&
            student.student_email !== undefined && student.student_identification !== undefined) {
            this.formsStudents.push(true);
            if (this.students.length > 1) {
              this.arrayStudentsFail[index] = true;
            }

          } else {
            this.formsStudents.splice(1);
            if (this.students.length > 1) {
              this.arrayStudentsFail[index] = false;
            }
          }
        }
        if (this.formsStudents.length === this.students.length) {
          this.isValidFormStudent = true;
        }
      }
    } else {
      this.addStudent();
      this.getLevels()
    }

  }

  /**
   * Método para agregar un nuevo estudiante.
   */
  public addStudent() {
    if (this.students && this.students.length > 0) {
      this.students.push({
      })
      this.arrayStudentsFail[this.students.length - 1] = true;
      this.students[this.students.length - 1].student_id = new Date().getTime().toString();
      this.students[this.students.length - 1].student_state = true;
      this.students[this.students.length - 1].student_id_representative = this.representative.representative_id;
      this.students[this.students.length - 1].student_id_school = this.school_id;
      this.students[this.students.length - 1].student_state_register = false;
      this.students[this.students.length - 1].student_email_is_valid = true;
      this.students[this.students.length - 1].student_date_register = this.utilService.getDateCurrent();
      this.student = this.students[this.students.length - 1];


      this.representative.representative_students.push(this.students[this.students.length - 1].student_id)
    } else {
      this.students = []
      this.students.push({
        student_id: new Date().getTime().toString(), student_state: true,
        student_id_representative: this.representative.representative_id,
        student_id_school: this.school_id,
        student_state_register: false,
        student_date_register: this.utilService.getDateCurrent(),
        student_email_is_valid: true,
      })
      this.student = this.students[0];
      this.representative.representative_students = [];
      this.arrayStudentsFail[0] = true;
      this.representative.representative_students.push(this.students[0].student_id);
    }

  }

  public saveStudent(student: Student, isValid: boolean, form: NgForm) {

  }


  /**
   * Método para cargar la imagen de perfil del representante
   * @param fileInput
   */
  public fileProgressRepresentative(fileInput: any) {
    this.fileDataRepresentative = (<File>fileInput.target.files[0]);
    this.preview();
  }

  /**
   * Método para visualizar la imagen previa
   * @returns
   */
  private preview() {
    if (this.fileDataRepresentative) {
      const mimeType = this.fileDataRepresentative.type;
      if (mimeType.match(/image\/*/) == null) {
        return;
      }
      const reader = new FileReader();
      reader.readAsDataURL(this.fileDataRepresentative);
      reader.onload = (_event) => {
        this.previewUrlRepresentative = reader.result;
      }
    }
  }

  /**
   * Método para eliminar estudiante
   * @param student
   */
  public deleteStudent(student: Student) {
    if (this.students.length > 1) {
      if (!student.student_email_is_valid) {
        if (this.array_students_validate_email.length > 1) {
          this.array_students_validate_email.splice(0, 1);
        } else if (this.array_students_validate_email.length === 1) {
          this.array_students_validate_email = []
        }
        if (this.array_students_validate_email.length === 0) {
          this.alertEmailStudent = false;

        } else {
          this.alertEmailStudent = true;

        }
      }
      const index = this.students.indexOf(student);
      if (this.representative.representative_students.includes(student.student_id)) {
        this.representative.representative_students.splice(index, 1);
      }
      this.students.splice(index, 1);
      if (this.students.length > 1) {
        if (index !== 0) {
          this.student = this.students[index - 1];
        } else {
          this.student = this.students[0];
        }
      } else {
        this.student = this.students[0];
      }

      this.studentService.getStudentById(student).pipe(take(1)).subscribe((student => {
        if (student !== undefined) {
          Swal.fire({
            text: '¿Confirma que desea eliminar el estudiante seleccionado?',
            icon: 'warning',
            showCancelButton: true,
            customClass: {
              confirmButton: 'btn btn-success',
              cancelButton: 'btn btn-danger',
            },
            confirmButtonText: 'Sí, eliminar!',
            cancelButtonText: 'Cancelar.',
            buttonsStyling: false
          }).then(async (result) => {
            if (result.value) {
              this.studentService.deleteStudent(student);
            }
          })
        }
      }));


    } else {
      this.showNotification('top', 'right', 'nc-alert-circle-i', 'Debe registrar al menos un estudiante.', 'warning');

    }


  }


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
