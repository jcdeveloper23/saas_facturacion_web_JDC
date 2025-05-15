import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, ActivationEnd, Router } from '@angular/router';
import { Levels } from 'app/interfaces/levels';
import { Lines } from 'app/interfaces/lines';
import { LinesService } from 'app/services/lines/lines.service';
import { ProviderService } from 'app/services/provider/provider.service';
import { take } from 'rxjs/operators';
import { Provider } from 'app/interfaces/provider';
import { Product } from 'app/interfaces/product';
import Swal from 'sweetalert2';
import { ProductDetailModalComponent } from '../product-detail-modal/product-detail-modal.component';

@Component({
  selector: 'app-provider-category-list',
  templateUrl: './provider-category-list.component.html',
  styleUrls: ['./provider-category-list.component.css'],
  providers: [ProductDetailModalComponent]

})
export class ProviderCategoryListComponent implements OnInit {
  public info_provider : Provider
  public provider_id = this.activatedRoute.snapshot.params.provider_id;
  public student_id = this.activatedRoute.snapshot.params.student_id;
  public categoriesList: Array<Lines>;
  constructor(private activatedRoute: ActivatedRoute,
    private router: Router,
    private linesService: LinesService,
    private providerService: ProviderService,
    public productDetailComponent: ProductDetailModalComponent) { }

  ngOnInit(): void {
    this.validateUrl();
    this.checkEventsInUrl();
  }

  /**
 * Método para validar datos obtenidos de url
 */
  public validateUrl() {
    this.getCategoriesByProvider(this.provider_id);
    this.getInfoProvider();
  }

  public getInfoProvider() {
    this.providerService.getProviderId(this.provider_id).pipe(take(1)).subscribe((provider) => {
      this.info_provider = provider
    })
  }

  /**
 * Método para escuchar cambio  de url 
 */
  public checkEventsInUrl() {
    this.router.events.subscribe((event) => {
      if (event instanceof ActivationEnd) {
        if (
          event.snapshot.params["provider_id"]
        ) {
          this.provider_id = event.snapshot.params["provider_id"];
          this.getCategoriesByProvider(this.provider_id);
          this.getInfoProvider();
        }
        if (
          event.snapshot.params["student_id"]
        ) {
          this.student_id = event.snapshot.params["student_id"];
        }
      }
    });
  }

  public getCategoriesByProvider(provider_id: string) {
    this.categoriesList = []
    this.linesService.getLinesActive(provider_id).subscribe((lines) => {
      this.categoriesList = lines;
      
    })
  }

  public selectCategory(category: Lines , selectAll ?: string) {
    
    if (selectAll === 'todos') {
      this.router.navigate(['perfil-representative/student/'+ this.student_id + '/provider/' + this.provider_id + '/' + 'all']);
    } else {
      this.router.navigate(['perfil-representative/student/'+ this.student_id + '/provider/' + this.provider_id + '/' + category.category_id]);

    }
  }

  public goBehind() {
    if (this.productDetailComponent.getLocalStorageCart() === 0) {
      this.router.navigate(['perfil-representative/'+'listProvider/' + this.student_id ]);

    } else {
      Swal.fire({
        title: '¿Confirma que desea regresar?',
        text: "Luego de confirmar los productos agregados a su carrito serán eliminados",
        icon: 'warning',
        showCancelButton: true,
        customClass:{
          confirmButton: 'btn btn-success',
          cancelButton: 'btn btn-danger',
        },
        confirmButtonText: 'Sí, regresar!',
        cancelButtonText: 'Cancelar',
         buttonsStyling: false
      }).then((result) => {
        if (result.value) {
          this.router.navigate(['perfil-representative/'+'listProvider/' + this.student_id ]);
  
        }
      })
    }
    
  }

  
}
