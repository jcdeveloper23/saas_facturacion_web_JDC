import { Injectable } from '@angular/core';
import { utf8Encode } from '@angular/compiler/src/util';
import { sha256 } from 'js-sha256';
import Swal from 'sweetalert2';
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
 * *** devuelve la fecha actual ***
 * *** formato 2020-10-05 ***
 */
  getDateCurrentFull() {
    let date: Date = new Date();
    return date;
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


  getAuthToken(paymentezClientAppCode, appClientKey) {
    var authTimeStamp = new Date().getTime().toString();
    var stringAuthToken = paymentezClientAppCode + ";" + authTimeStamp.substring(0, 10) + ";" + this.getUniqToken(authTimeStamp.substring(0, 10), appClientKey);
    var authToken = btoa(utf8Encode(stringAuthToken));
    return authToken;
  }

  getUniqToken(authTimeStamp, paymentezClientAppKey) {
    var uniqTokenString = paymentezClientAppKey + authTimeStamp;
    return sha256(utf8Encode(uniqTokenString)).toString();
  }
}
