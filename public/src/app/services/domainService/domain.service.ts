import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DomainService {

  constructor() { }

  // Método para obtener el país del subdominio
  getCountry() {
    const hostname = window.location.hostname;
    

    // Define un mapa de subdominios a países
    const paises = {
      'cl': 'Chile',
      'ec': 'Ecuador',
      've': 'Venezuela',
      'localhost': 'Ecuador',
      '192': 'Ecuador',
      // 'localhost': 'Venezuela',
      // Agrega más subdominios a medida que lo necesites
    };

    const subdominio = hostname.split('.')[0]; // Extrae el subdominio

    // Retorna el país si el subdominio existe en el mapa
    return paises[subdominio] || 'Ecuador';
  }
}
