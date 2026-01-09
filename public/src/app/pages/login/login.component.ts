import { Component, OnInit, ElementRef, Output, EventEmitter } from '@angular/core';
import { AuthService } from 'app/services/authService/auth.service';
import { Users } from 'app/interfaces/users';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

declare var $: any;

@Component({
  selector: 'login-cmp',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})

export class LoginComponent implements OnInit {
  @Output() changeModality = new EventEmitter();
  public user: Users;
  public loginForm = new FormGroup({
    email: new FormControl("", [
      Validators.required,
      Validators.pattern("^[a-z0-9._%+-]+@[a-z0-9.-]+.[a-z]{2,4}$"),
    ]),
    password: new FormControl("", Validators.required),
  });

  test: Date = new Date();
  private toggleButton;
  private sidebarVisible: boolean;
  private nativeElement: Node;


  constructor(
    private element: ElementRef,
    private authService: AuthService,
    private router: Router,
  ) {
    this.nativeElement = element.nativeElement;
    this.sidebarVisible = false;
  }

  checkFullPageBackgroundImage() {
    // var $page = $('.full-page');
    // var image_src = $page.data('image');

    // if(image_src !== undefined){
    //     var image_container = '<div class="full-page-background" style="background-image: url(' + image_src + ') "/>'
    //     $page.append(image_container);
    // }
  };
  ngOnInit() {
    this.user = {}
    // $("#loginModal").modal("show");
    // $('#loginModal').on('hidden.bs.modal', function() {
    //   $("loginModal").trigger("click");
    //   document.getElementById('modal-login-close').click();

    // })

    this.checkFullPageBackgroundImage();

    var body = document.getElementsByTagName('body')[0];
    body.classList.add('lock-page');

    var navbar: HTMLElement = this.element.nativeElement;
    this.toggleButton = navbar.getElementsByClassName('navbar-toggle')[0];

    setTimeout(function () {
      // after 1000 ms we add the class animated to the login/register card
      $('.card').removeClass('card-hidden');
    }, 700)
  }


  public onLogin(userLogin: Users, valid: boolean) {
    if (valid) {
      if (userLogin) {
        this.authService.login(userLogin.userEmail.toLowerCase(), userLogin.userPassword).then(() => {
          $('body').removeClass('modal-open');
          $('body').css('padding', '0px');
          $('.fade').remove();
          this.changeModal()
        });
      }
    }
  }

  public changeModal() {
    this.changeModality.emit(false);

  }

  ngOnDestroy() {
    var body = document.getElementsByTagName('body')[0];
    body.classList.remove('lock-page');
  }
  sidebarToggle() {
    var toggleButton = this.toggleButton;
    var body = document.getElementsByTagName('body')[0];
    var sidebar = document.getElementsByClassName('navbar-collapse')[0];
    if (this.sidebarVisible == false) {
      setTimeout(function () {
        toggleButton.classList.add('toggled');
      }, 500);
      body.classList.add('nav-open');
      this.sidebarVisible = true;
    } else {
      this.toggleButton.classList.remove('toggled');
      this.sidebarVisible = false;
      body.classList.remove('nav-open');
    }
  }

  cancel() {
    // this.router.navigate(['/']);
    this.router.navigate(['']);

  }

}
