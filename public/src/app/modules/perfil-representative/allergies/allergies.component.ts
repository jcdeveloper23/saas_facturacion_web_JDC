import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Student } from 'app/interfaces/student';
import { Users } from 'app/interfaces/users';
import { AllergiesService } from 'app/services/allergies/allergies.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { StudentService } from 'app/services/student/student.service';
import { take } from 'rxjs/operators';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-allergies',
  templateUrl: './allergies.component.html',
  styleUrls: ['./allergies.component.css']
})
export class AllergiesComponent implements OnInit {
  public infoUser: Users;
  public student_id = this.activatedRoute.snapshot.params.student_id;
  public student: Student = {
    student_allergies: [],
  };
  public arrayAllergies: Allergies[];

  constructor(
    public loadingService: LoadingService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    public allergiesService: AllergiesService,
    private studentService: StudentService,

  ) { }

  ngOnInit(): void {
    this.loadingService.show('Cargando...');

    this.infoUser = JSON.parse(localStorage.getItem('infoUser'));
    if (this.infoUser === null) {
      this.router.navigate([''])
    } else {
      this.getAllAllergies();
      this.getInfoStudent(this.student_id);
    }
    console.log(this.student_id);
  }

  public getInfoStudent(student_id: string) {
    this.studentService.getStudentId(student_id).pipe(take(1)).subscribe((student) => {
      // this.student = student;
      this.student = this.studentService.sanitizeStudent(student);

      console.log(this.student);
      this.loadingService.hide();
    })
  }

  getAllAllergies() {
    this.allergiesService.getAllergies().subscribe(allergies => {
      this.arrayAllergies = allergies;
    });
  }

  /**
   * *** Setea las alergias del studiante ***
   * @param allergyName 
   * @param isChecked 
   */
  toggleAllergy(allergyName: string, isChecked: boolean): void {
    const index = this.student.student_allergies.indexOf(allergyName);
    if (isChecked && index === -1) {
      this.student.student_allergies.push(allergyName);
    } else if (!isChecked && index !== -1) {
      this.student.student_allergies.splice(index, 1);
    }
    console.log(this.student.student_allergies);
  }


  /**
   * metodo para editar Estudiante
   * @param student 
   * @param isValid 
   * @param form 
   */
  public saveAllergiesByStuden() {
        this.loadingService.show('Cargando...');

    this.studentService.updateStudent(this.student).then(() => {
      Swal.fire({
        icon: 'success',
        title: "La configuración de alergias ha sido guardada con éxito. Gracias por ayudarnos a cuidar la salud de tu representado.",
        buttonsStyling: false,
        customClass: {
          confirmButton: 'btn btn-primary',
          cancelButton: 'btn btn-danger',
        },
        confirmButtonText: 'Aceptar'
      })
        this.loadingService.hide();
    })
  }
}
