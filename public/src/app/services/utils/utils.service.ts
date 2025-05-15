import { Injectable } from '@angular/core';
declare var $: any;
@Injectable({
  providedIn: 'root'
})
export class UtilsService {

  constructor() { }


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
   * *** devuelve la fecha actual ***
   * *** formato 2020-10-05 ***
   */
  getDateCurrent() {
    let date: Date = new Date();
    return (
      date.getFullYear() +
      "-" +
      this.addZero(date.getMonth() + 1) +
      "-" +
      this.addZero(date.getDate())
    );
  }

  /**
   * *** devuelve la hora actual HH:MM:SS***
   */
  getTimeCurrent() {
    let date: Date = new Date();
    return (
      this.addZero(date.getHours()) +
      ":" +
      this.addZero(date.getMinutes()) +
      ":" +
      this.addZero(date.getSeconds())
    );
  }

  /**
   * *** devuelve el primer dia del mes ***
   */
  getFirstDayMonth() {
    let date: Date = new Date();
    var firstDay: Date = new Date(
      date.getFullYear(),
      this.addZero(date.getMonth()),
      this.addZero(1)
    );
    return (
      firstDay.getFullYear() +
      "-" +
      this.addZero(firstDay.getMonth() + 1) +
      "-" +
      this.addZero(firstDay.getDate())
    );
  }

  addZero(i) {
    if (i < 10) {
      i = "0" + i;
    }
    return i;
  }
}
