import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms'
import { SchoolService } from '../../services/school/school.service';
import { ProviderService } from '../../services/provider/provider.service';
import { MessageService } from '../../services/messages/message.service';
import { School } from '../../interfaces/school';
import { Provider } from '../../interfaces/provider';
import { Message } from '../../interfaces/message';
import { take } from 'rxjs/operators';
import { Router } from '@angular/router';
import { LectiveYearService } from '../../services/lective-year/lective-year.service';
import { LectiveYear } from '../../interfaces/lective_year';
import * as firebase from 'firebase/app';
import 'firebase/firestore';

declare var $: any;

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  public isLogin = false;
  newRegisterForm: FormGroup;
  schools: School[] = [];
  providersBySchool: Provider[] = [];
  lectiveYears: LectiveYear[] = [];
  selectedSchool: School;
  selectedLective: LectiveYear;
  selectedLectiveName = '--';

  // Carousel properties
  currentSlide = 0;
  slides = [0, 1, 2, 3, 4]; // 5 slides total
  autoPlayInterval: any;

  // Contact form properties
  contactForm: FormGroup;
  isSubmitting = false;
  submitSuccess = false;
  submitError = false;

  constructor(private formBuilder: FormBuilder,
    private _schoolService: SchoolService,
    private _providerService: ProviderService,
    private _router: Router,
    private _lectiveService: LectiveYearService,
    private _messageService: MessageService) {
  }

  ngOnInit(): void {
    this.selectedSchool = {};
    this.selectedLective = {};
    this.getAllSchools().then(() => {
      this.initForm();
      this.initContactForm();
    });
    $('#registerModal').appendTo('body');
  }

  private initForm() {
    this.newRegisterForm = this.formBuilder.group({
      school: ['', Validators.required],
      provider: ['', Validators.required],
      lectiveYear: [this.selectedLectiveName, Validators.required],
    });
  }

  public showRegisterModal() {
    $('#registerModal').modal('show');
    $('#registerModal').modal({ backdrop: 'static', keyboard: false });
  }

  public async getAllSchools() {
    this._schoolService.getSchoolsByState().pipe(take(1)).subscribe((school) => {
      this.schools = school;
    })
  }

  public async getAllLectiveYearsFromSchool(school_id) {
    const resp_bdd = await this._lectiveService.getAllLectiveYearFromSchool(school_id).toPromise();
    console.log('*** YEARS ***', resp_bdd);

    resp_bdd.docs.forEach((lective) => {
      console.log(lective.data());

      this.lectiveYears.push(lective.data());
    });
    this.selectedLective = this.getLectiveYearById();
    this.selectedLectiveName = this.selectedLective.lective_year_name ?? "";
  }

  private getLectiveYearById() {
    for (let i = 0; i < this.lectiveYears.length; i++) {
      if (this.lectiveYears[i].lective_year_id === this.selectedSchool.school_active_lective_year) {
        return this.lectiveYears[i];
      }
    }
  }

  public getProviderBySchool(school_id) {
    this.selectedSchool = this.getSchoolById(school_id);
    this._providerService.getProvidersByUE(school_id).pipe(take(1)).subscribe((provider) => {
      this.providersBySchool = provider;
    })
  }

  private getSchoolById(school_id) {
    for (let i = 0; i < this.schools.length; i++) {
      if (this.schools[i].school_id === school_id) {
        return this.schools[i];
      }
    }
  }

  get f() {
    return this.newRegisterForm.controls;
  }

  onSubmit() {
    if (this.newRegisterForm.invalid) {
      return;
    }

    console.log(this.newRegisterForm.value)

    localStorage.setItem('lectiveYear', this.selectedLective.lective_year_id);

    $('#registerModal').modal('hide');
    setTimeout(() => {
      this.navigateToRegisterRepresentative();
    }, 500);
  }

  navigateToRegisterRepresentative() {
    this._router.navigateByUrl('/register/' + this.newRegisterForm.value.school);
  }

  public closeModal() {
    this.isLogin = false;
  }

  // Carousel methods
  nextSlide() {
    this.currentSlide = (this.currentSlide + 1) % this.slides.length;
  }

  previousSlide() {
    this.currentSlide = this.currentSlide === 0 ? this.slides.length - 1 : this.currentSlide - 1;
  }

  goToSlide(index: number) {
    this.currentSlide = index;
  }

  startAutoPlay() {
    this.autoPlayInterval = setInterval(() => {
      this.nextSlide();
    }, 5000); // Change slide every 5 seconds
  }

  stopAutoPlay() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
    }
  }

  ngOnDestroy() {
    this.stopAutoPlay();
  }

  // Contact form methods
  private initContactForm() {
    this.contactForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10,11}$/)]],
      city: ['', [Validators.required, Validators.minLength(3)]],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  async onSubmitContact() {
    if (this.contactForm.invalid) {
      // Marcar todos los campos como touched para mostrar errores
      Object.keys(this.contactForm.controls).forEach(key => {
        this.contactForm.get(key).markAsTouched();
      });
      return;
    }

    this.isSubmitting = true;
    this.submitSuccess = false;
    this.submitError = false;

    // Generar ID único usando timestamp
    const messageId = Date.now().toString();

    const message: Message = {
      message_id: messageId,
      message_name: this.contactForm.value.name,
      message_email: this.contactForm.value.email,
      message_phone: this.contactForm.value.phone,
      message_city: this.contactForm.value.city,
      message_content: this.contactForm.value.message,
      message_timestamp: firebase.default.firestore.FieldValue.serverTimestamp(),
      message_read: false,
      message_replied: false
    };

    try {
      await this._messageService.saveMessage(message);
      this.submitSuccess = true;
      this.contactForm.reset();

      // Ocultar mensaje de éxito después de 5 segundos
      setTimeout(() => {
        this.submitSuccess = false;
      }, 5000);
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      this.submitError = true;

      // Ocultar mensaje de error después de 5 segundos
      setTimeout(() => {
        this.submitError = false;
      }, 5000);
    } finally {
      this.isSubmitting = false;
    }
  }

  // Getters para validación del formulario de contacto
  get fc() {
    return this.contactForm.controls;
  }

  get nameInvalid() {
    return this.fc.name.invalid && this.fc.name.touched;
  }

  get emailInvalid() {
    return this.fc.email.invalid && this.fc.email.touched;
  }

  get messageInvalid() {
    return this.fc.message.invalid && this.fc.message.touched;
  }

  get phoneInvalid() {
    return this.fc.phone.invalid && this.fc.phone.touched;
  }

  get cityInvalid() {
    return this.fc.city.invalid && this.fc.city.touched;
  }

}
