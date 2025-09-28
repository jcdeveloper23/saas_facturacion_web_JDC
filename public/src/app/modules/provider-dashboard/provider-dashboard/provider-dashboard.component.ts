import { Component, OnInit } from '@angular/core';
import { Stats } from 'app/interfaces/stats';
import { Users } from 'app/interfaces/users';
import { LoadingService } from 'app/services/loading/loading.service';
import { StatsService } from 'app/services/stats/stats.service';
import Chart from 'chart.js';

@Component({
  selector: 'app-provider-dashboard',
  templateUrl: './provider-dashboard.component.html',
  styleUrls: ['./provider-dashboard.component.css']
})
export class ProviderDashboardComponent implements OnInit {

  public stats: Stats = {};
  public infoUser: Users = {};
  public filterSelected: string = 'daily';
  /**
   * *** Opciones de tabs para filtrar periodos de tiempo ***
  */
  public tabsOptions = [
    { key: 'daily', label: 'Estadísticas por día', icon: 'nc-money-coins' },
    { key: 'monthly', label: 'Estadísticas por mes', icon: 'nc-credit-card' },
    { key: 'yearly', label: 'Estadísticas por año', icon: 'nc-camera-compact' }
  ];

  /**
   * *** Filtros por opcion seleccionada ***
   */
  public filters: any = {
    hourRange: '',
    paymentMethod: '',
    day: '',
    month: ''
  };

  public hourRanges: string[] = [
    '00:00 - 06:00',
    '06:00 - 12:00',
    '12:00 - 18:00',
    '18:00 - 00:00'
  ];

  public paymentMethods: string[] = ['efectivo', 'tarjeta'];

  public daysInMonth: number[] = Array.from({ length: 31 }, (_, i) => i + 1);

  public months = [
    { name: 'Enero', value: '01' },
    { name: 'Febrero', value: '02' },
    { name: 'Marzo', value: '03' },
    { name: 'Abril', value: '04' },
    { name: 'Mayo', value: '05' },
    { name: 'Junio', value: '06' },
    { name: 'Julio', value: '07' },
    { name: 'Agosto', value: '08' },
    { name: 'Septiembre', value: '09' },
    { name: 'Octubre', value: '10' },
    { name: 'Noviembre', value: '11' },
    { name: 'Diciembre', value: '12' }
  ];

  public years = [];
  public datesByDays = [];


  public filtersDate: any = {
    date: ''
  };

  /**
   * *** Fecha actual ***
   */
  public today: string = '';
  public yearCurrent: string = '';

  /**
   * *** 7 dias de la semana ***
   */
  public last7Days: { label: string; date: string }[] = [];

  /**
   * *** fecha base para navegar entre semanas fecha actual ***
   */
  private baseDate: Date = new Date();

  public key = '';

  constructor(
    public statsService: StatsService,
    public loadingService: LoadingService,
  ) { }

  async ngOnInit() {
    this.infoUser = JSON.parse(localStorage.getItem("infoUser"));
    const now = new Date();
    /**
     * *** Seteamos la fecha actual ***
     */
    this.today = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    this.yearCurrent = `${now.getFullYear()}`;
    /**
     * *** Agragamos la fecha actual al date del filtro ***
     */
    this.filtersDate.date = this.today;
    /**
     * *** Obtenemos los ultimos 7 dias para la navegacion de las semanas ***
     */
    this.generateLast7Days();
    /**
     * *** Generamos los ultimos 5 años para estadistica ***
     */
    this.generateYears();

    /**
     * *** Obtener las fechas de los últimos 30 días ***
     */
    this.getLast30Days();
    /**
     * *** Cargamos la estadistica ***
     */
    this.loadStats();
  }



  /**
   * *** Metodo para cargar la estadistica ***
   */
  async loadStats(): Promise<void> {
    this.loadingService.show('Cargando estadístita');
    const barId = this.infoUser.userId; // reemplazar con ID dinámico si aplica

    var timeCollection = this.filterSelected;
    this.key = this.getKey();
    console.log(`*** key ${this.key} ***`);


    this.statsService.getYearlyStats(barId, timeCollection, this.key).subscribe((stats: Stats) => {
      if (!stats) {
        /**
         * *** Asignar objeto vacío ***
         */
        this.stats = {} as Stats;
        this.loadingService.hide();
        return;
      } else {
        this.stats = stats;
        /**
         * *** Agregamos setTimeout para esperar que se muestren los canvas para la estadistica ***
         */
        setTimeout(() => {
          this.renderAmountChart();
          this.renderPaymentStatusChart();
          this.renderOrderStatusChart();
        }, 500);
      }
    });
  }

  getStats(item) {
    this.filterSelected = item.key;
    console.log(this.filterSelected);
    if (this.filterSelected == 'yearly') this.loadLastFiveYearsStats();
    if (this.filterSelected == 'monthly') this.loadLast30DaysStats();
    this.loadStats();
  }

  public getKey(): string {
    const now = new Date();

    switch (this.filterSelected) {
      case 'daily':
        // Formato YYYY-MM-DD basado en la hora local
        return this.today; //`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      case 'monthly':
        // Retorna en formato YYYY-MM
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      case 'yearly':
        // Solo el año
        return this.yearCurrent; //`${now.getFullYear()}`;

      default:
        return '';
    }
  }


  ngAfterViewInit() {

  }

  renderAmountChart() {
    const ctx = document.getElementById('amountChart') as HTMLCanvasElement;
    new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Efectivo', 'Tarjeta'],
        datasets: [{
          label: "Emails",
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 1,
          backgroundColor: [
            '#4880FF50',
            '#F93C6550',
          ],
          borderColor: [
            '#4880FF',
            '#F93C65',
          ],
          data: [
            this.stats.perPaymentMethod.efectivo ?? 0,
            this.stats.perPaymentMethod.tarjeta ?? 0,
          ]
        }]
      },
      options: {
        legend: {
          display: true
        },
        tooltips: {
          enabled: true
        },
        // scales: {
        //   yAxes: [{

        //     ticks: {
        //       display: true
        //     },
        //     gridLines: {
        //       drawBorder: true,
        //       zeroLineColor: "transparent",
        //       color: 'rgba(255,255,255,0.05)'
        //     }
        //   }],
        //   xAxes: [{
        //     barPercentage: 1.6,
        //     gridLines: {
        //       drawBorder: false,
        //       color: 'rgba(255,255,255,0.1)',
        //       zeroLineColor: "transparent"
        //     },
        //     ticks: {
        //       display: false,
        //     }
        //   }]
        // },
      },
    });
  }

  renderPaymentStatusChart() {
    const ctx = document.getElementById('paymentStatusChart') as HTMLCanvasElement;
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Pagadas', 'Pendientes'],
        datasets: [{
          label: 'Pagos',
          borderWidth: 1,
          backgroundColor: [
            '#00B69B50',
            '#F93C6550',
          ],
          borderColor: [
            '#00B69B',
            '#F93C65',
          ],
          data: [
            this.stats.paymentStatus.aceptada ?? 0,
            this.stats.paymentStatus.desconocido ?? 0,
          ],
        }]
      },
      options: {
        responsive: true
      }
    });
  }

  renderOrderStatusChart() {
    const ctx = document.getElementById('orderStatusChart') as HTMLCanvasElement;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['En efectivo', 'Con tarjeta'],
        datasets: [{
          label: 'USD',
          data: [
            (this.stats.totalAmountPerPaymentMethod.efectivo ?? 0).toFixed(2),
            (this.stats.totalAmountPerPaymentMethod.tarjeta ?? 0).toFixed(2),
          ],
          options: {
            scales: {
              y: {
                beginAtZero: false
              }
            }
          },
          backgroundColor: [
            'rgba(255, 99, 132, 0.2)',
            'rgba(255, 159, 64, 0.2)',
          ],
          borderColor: [
            'rgb(255, 99, 132)',
            'rgb(255, 159, 64)',
          ],
          borderWidth: 1
        },
        ]
      },
      options: {
        responsive: true,
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true,
              stepSize: 1
            }
          }]
        }
      }
    });
    this.loadingService.hide();

  }

  renderSalesChart(salesPerYear: { [year: string]: number }) {
    const years = Object.keys(salesPerYear).sort();
    const values = years.map(year => salesPerYear[year]);

    const canvas = document.getElementById('salesChart') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');

    // Crear gradiente
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0, 123, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 123, 255, 0)');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'Ventas por Año ($)',
          data: values,
          backgroundColor: gradient,
          borderColor: '#007bff',
          pointBackgroundColor: '#007bff',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#007bff',
          tension: 0.5,
          fill: true,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // Permite fijar la altura
        animation: {
          duration: 1500,
          easing: 'easeInOutQuart'
        },
        legend: {
          labels: {
            fontColor: '#333',
            fontSize: 14
          }
        },
        scales: {
          xAxes: [{
            gridLines: {
              color: 'rgba(0,0,0,0.05)'
            }
          }],
          yAxes: [{
            ticks: {
              beginAtZero: true,
              fontColor: '#555'
            },
            gridLines: {
              color: 'rgba(0,0,0,0.05)'
            }
          }]
        },
        tooltips: {
          backgroundColor: '#fff',
          titleFontColor: '#000',
          bodyFontColor: '#333',
          borderColor: '#ccc',
          borderWidth: 1
        }
      }
    });
  }

  render30DaysSalesChart(salesPerDay: { [year: string]: number }) {
    const labels = Object.keys(salesPerDay).sort();
    const values = labels.map(year => salesPerDay[year]);

    const canvas = document.getElementById('sales30Chart') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');

    // Crear gradiente
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0, 123, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 123, 255, 0)');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ventas últimos 30 días ($)',
          data: values,
          backgroundColor: gradient,
          borderColor: '#007bff',
          pointBackgroundColor: '#007bff',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#007bff',
          tension: 0.5,
          fill: true,
          borderWidth: 2
        }]
      },
      
      options: {
        responsive: true,
        maintainAspectRatio: false, // Permite fijar la altura
        animation: {
          duration: 1500,
          easing: 'easeInOutQuart'
        },
        legend: {
          labels: {
            fontColor: '#333',
            fontSize: 14
          }
        },
        scales: {
          xAxes: [{
            gridLines: {
              color: 'rgba(0,0,0,0.05)'
            }
          }],
          yAxes: [{
            ticks: {
              beginAtZero: true,
              fontColor: '#555'
            },
            gridLines: {
              color: 'rgba(0,0,0,0.05)'
            }
          }]
        },
        tooltips: {
          backgroundColor: '#fff',
          titleFontColor: '#000',
          bodyFontColor: '#333',
          borderColor: '#ccc',
          borderWidth: 1
        }
      }
    });
  }



  get selectedMethodIndex(): number {
    return this.tabsOptions.findIndex(m => m.key === this.filterSelected);
  }

  generateLast7Days(): void {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom',];
    const startOfWeek = new Date(this.baseDate);
    startOfWeek.setDate(this.baseDate.getDate() - this.baseDate.getDay());

    this.last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return {
        label: days[d.getDay()],
        date: d.toISOString().split('T')[0]
      };
    });
  }

  selectDay(date: string): void {
    console.log(`*** date ${date} ***`);
    this.today = date;
    this.filtersDate.date = date;
    this.loadStats(); // volver a cargar stats con nueva fecha
  }

  selectYear(event: any): void {
    const selectedValue = event.target.value;
    this.filters.year = selectedValue;
    console.log('Año seleccionado:', this.filters.year);
    this.yearCurrent = this.filters.year;
    // Si necesitas recargar datos en base al año, puedes llamarlo aquí
    this.loadStats();
  }

  changeWeek(direction: number): void {
    this.baseDate.setDate(this.baseDate.getDate() + direction * 7);
    this.generateLast7Days();
  }

  getWeekRangeLabel(): string {
    const start = this.last7Days[0]?.date || '';
    const end = this.last7Days[6]?.date || '';
    return `Del ${start} al ${end}`;
  }

  /**
   * *** retorna [true - false] si hay o no estadistica para mostrar ***
   * @returns 
   */
  hasStats(): boolean {
    return this.stats && Object.keys(this.stats).length > 0;
  }

  /**
   * *** asegura que el array years siempre tenga los últimos 5 años ***
   * *** (incluyendo el actual), sin necesidad de                    *** 
   * *** actualizaciones manuales                                    ***
   */
  private generateYears(): void {
    const currentYear = new Date().getFullYear();
    const numYears = 5;

    this.years = Array.from({ length: numYears }, (_, i) => {
      const year = currentYear - i;
      return { name: year.toString(), value: year.toString() };
    });
  }

  async loadLastFiveYearsStats(): Promise<void> {
    console.log('*** loadLastFiveYearsStats ***');

    const currentYear = new Date().getFullYear();
    const barId = this.infoUser.userId;
    const salesPerYear: { [year: string]: number } = {};

    const requests: Promise<void>[] = [];

    for (let i = 0; i < this.years.length + 5; i++) {
      const year = (currentYear - i).toString();

      const req = new Promise<void>((resolve) => {
        this.statsService.getYearlyStats(barId, 'yearly', year).subscribe((stats: Stats) => {
          salesPerYear[year] = parseFloat((stats?.totalAmount || 0).toFixed(2));
          resolve();
        }, () => {
          salesPerYear[year] = 0;
          resolve();
        });
      });

      requests.push(req);
    }

    await Promise.all(requests);
    console.log(`*** salesPerYear ***`);
    console.log(JSON.stringify(salesPerYear, null, 3));

    this.renderSalesChart(salesPerYear);
  }

  /**
   * *** Obtener las fechas de los últimos 30 días ***
   * @returns 
   */
  private getLast30Days(): string[] {
    const dates: string[] = [];
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const formatted = date.toISOString().split('T')[0]; // formato YYYY-MM-DD
      dates.unshift(formatted); // Mantiene orden cronológico
    }

    this.datesByDays = dates;

    return dates;
  }

  async loadLast30DaysStats(): Promise<void> {
    const barId = this.infoUser.userId;
    const salesPerDay: { [year: string]: number } = {};

    const requests: Promise<void>[] = [];

    for (let i = 0; i < this.datesByDays.length; i++) {
      const date = (this.datesByDays[i]).toString();

      const req = new Promise<void>((resolve) => {
        this.statsService.getYearlyStats(barId, 'daily', date).subscribe((stats: Stats) => {
          salesPerDay[date] = parseFloat((stats?.totalAmount || 0).toFixed(2));
          resolve();
        }, () => {
          salesPerDay[date] = 0;
          resolve();
        });
      });

      requests.push(req);
    }

    await Promise.all(requests);

    setTimeout(() => {
      this.render30DaysSalesChart(salesPerDay);
    }, 200);

  }
}
