import { Component, OnInit, AfterViewInit } from '@angular/core';
import { Chart } from 'chart.js';

@Component({
  selector: 'app-admin-panel',
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.css']
})
export class AdminPanelComponent implements OnInit, AfterViewInit {

  // Propiedades para las tarjetas de estadísticas (con datos de ejemplo)
  public totalUsers: number = 1250;
  public activeDrivers: number = 85;
  public tripsToday: number = 214;
  public pendingRecharges: number = 12;

  constructor() { }

  ngOnInit(): void {
    // Aquí se cargarían los datos reales de los servicios
  }

  ngAfterViewInit(): void {
    this.createWeeklyTripsChart();
  }

  createWeeklyTripsChart() {
    const canvas = document.getElementById('weeklyTripsChart') as HTMLCanvasElement;
    if (!canvas) {
      console.error('El elemento canvas para la gráfica no fue encontrado.');
      return;
    }

    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], // Últimos 7 días
        datasets: [{
          label: 'Viajes completados',
          data: [150, 180, 210, 190, 220, 250, 230], // Datos de ejemplo
          backgroundColor: 'rgba(255, 107, 53, 0.6)', // Naranja con transparencia
          borderColor: 'rgba(255, 107, 53, 1)',
          borderWidth: 1,
          borderRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { 
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)' // Líneas de la cuadrícula más sutiles
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.8)' // Color claro para los números del eje Y
            }
          },
          x: { 
            grid: { 
              display: false // Ocultar líneas de la cuadrícula en el eje X 
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.8)' // Color claro para los días del eje X
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: 'rgba(255, 255, 255, 0.9)' // Color claro para la leyenda ('Viajes completados')
            }
          }
        }
      }
    });
  }
}
