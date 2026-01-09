import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms'
import { Router } from '@angular/router';

declare var $: any;

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  public isLogin = false;

  public currentYear = new Date().getFullYear();

  // Contact form properties
  contactForm: FormGroup;
  isSubmitting = false;
  submitSuccess = false;
  submitError = false;

  constructor(private formBuilder: FormBuilder,
    private _router: Router) {
  }

  ngOnInit(): void {
    this.initContactForm();
    // $('#registerModal').appendTo('body');
  }

  public closeModal() {
    this.isLogin = false;
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
      Object.keys(this.contactForm.controls).forEach(key => {
        this.contactForm.get(key).markAsTouched();
      });
      return;
    }

    this.isSubmitting = true;
    this.submitSuccess = false;
    this.submitError = false;

    // TODO: Integrate with new backend contact/leads service
    console.log('Contact form submitted:', this.contactForm.value);

    setTimeout(() => {
      this.isSubmitting = false;
      this.submitSuccess = true;
      this.contactForm.reset();
      setTimeout(() => this.submitSuccess = false, 5000);
    }, 1500);
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
