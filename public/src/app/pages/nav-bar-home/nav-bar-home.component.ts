import { Component, HostListener, OnInit } from '@angular/core';

declare var $ : any;
@Component({
  selector: 'app-nav-bar-home',
  templateUrl: './nav-bar-home.component.html',
  styleUrls: ['./nav-bar-home.component.css']
})
export class NavBarHomeComponent implements OnInit {

  public isLogin = false;
  public isMobile = false;
  constructor() { }

  ngOnInit(): void {
    this.isViewMobile()
  }

  @HostListener("window:resize", ["$event"])
  onResize(event) {   
    if (event.target.innerWidth > 992) {
      this.isMobile = false;
    } else {
      this.isMobile = true;

    }
  }

  isViewMobile() {
    if ($(window).width() > 992) {
      this.isMobile = false;

    } else {
      this.isMobile = true;
    }
  }

  public closeModal() {
    this.isLogin = false;
  }
}
