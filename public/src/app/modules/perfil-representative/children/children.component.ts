import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, ActivationEnd, Router } from '@angular/router';
import { Product } from 'app/interfaces/product';
import { Provider } from 'app/interfaces/provider';
import { Representative } from 'app/interfaces/representative';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { ProviderService } from 'app/services/provider/provider.service';
import { RepresentativeService } from 'app/services/representative/representative.service';
import { StudentService } from 'app/services/student/student.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-children',
  templateUrl: './children.component.html',
  styleUrls: ['./children.component.css']
})
export class ChildrenComponent implements OnInit {
  public productscartCache: Array<Product>;
  public student: Student;
  public student_id = this.activatedRoute.snapshot.params.student_id;
  public infoUser: Users;
  public representative: Representative;
  public providersList: Array<Provider>;
  constructor(private router: Router,
    private representativeService: RepresentativeService,
    private providersService: ProviderService,
    private activatedRoute: ActivatedRoute,
    private studentService: StudentService) { }

  ngOnInit(): void {
    this.infoUser = JSON.parse(localStorage.getItem('infoUser'));
    if (this.infoUser === null) {
      this.router.navigate([''])
    } else {
      this.getInfoRepresentative();
      this.validateUrl()
    }
  }

  /**
* Método para validar datos obtenidos de url
*/
  public validateUrl() {
    this.getInfoStudent(this.student_id);
    this.initCart()
  }
  /**
 * Método para escuchar cambio  de url
 */
  public checkEventsInUrl() {
    this.router.events.subscribe((event) => {
      if (event instanceof ActivationEnd) {
        if (
          event.snapshot.params['student_id']
        ) {
          this.student_id = event.snapshot.params['student_id'];
          this.getInfoStudent(this.student_id);
          this.initCart()
        }
      }
    });
  }

  public getInfoStudent(student_id: string) {
    this.studentService.getStudentId(student_id).pipe(take(1)).subscribe((student) => {
      this.student = student;

    } )
  }

  public getInfoRepresentative() {
    this.representativeService.getRepresentativeId(this.infoUser.user_id).pipe(take(1)).subscribe((representative) => {
      this.representative = representative;
      if (representative) {
        this.getProvidersList();
      }
    })
  }

  public getProvidersList() {
    this.providersService.getProvidersByUEInStateTrue(this.representative.representative_schools[0]).pipe(take(1)).subscribe((providers) => {
      this.providersList = providers;

    })
  }

  public selectProvider(provider: Provider) {
    this.router.navigate(['perfil-representative/' + '/student/' + this.student.student_id + '/providers/' + provider.provider_id]);
  }

  public goBehind() {
    this.router.navigate(['perfil-representative/childrens']);
  }

  public initCart() {
    if (JSON.parse(localStorage.getItem('productscartCache'))) {
      this.productscartCache = [];
      localStorage.setItem('productscartCache', JSON.stringify(this.productscartCache));
    } else {
      this.productscartCache = [];
    }
  }

  public launchModalAwaitApprobed() {
    Swal.fire({
      text: 'Por favor, espere la aprobación del bar',
      icon: 'warning',
      allowOutsideClick: false,
      allowEnterKey:  false,
    });
  }
}
