import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatChipInputEvent } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { ActivatedRoute } from '@angular/router';
import { HelpQuestionsService } from 'app/services/help-questions/help-questions.service';
import { HelpCategoriesService } from 'app/services/help-categories/help-categories.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { UtilsService } from 'app/services/utils/utils.service';
import Swal from 'sweetalert2';
declare var $: any;

@Component({
  selector: 'app-help-questions',
  templateUrl: './help-questions.component.html',
  styleUrls: ['./help-questions.component.css']
})
export class HelpQuestionsComponent implements OnInit {

  // Search and filters
  public searchTerm: string = '';
  public selectedCategoryId: string = '';
  public selectedUserType: string = '';

  // DataTable configuration
  public dataSource: MatTableDataSource<HelpQuestion>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tablePaginator") paginator: MatPaginator;
  public displayedColumns: string[] = [
    "order",
    "title",
    "category",
    "userType",
    "views",
    "popular",
    "status",
    "statusChange",
    "edit",
    "delete",
  ];

  // Data arrays
  public arrayQuestions: Array<HelpQuestion> = [];
  public filteredQuestions: Array<HelpQuestion> = [];
  public arrayCategories: Array<HelpCategory> = [];

  // Form variables
  public isEdit: boolean = false;
  public helpQuestion: HelpQuestion = {};

  // Tags configuration
  readonly separatorKeysCodes: number[] = [ENTER, COMMA];
  public tags: string[] = [];

  // User types
  public userTypes = [
    { value: 'client', label: 'Cliente', icon: 'nc-single-02', color: '#3b82f6' },
    { value: 'driver', label: 'Conductor', icon: 'nc-bus-front-12', color: '#f59e0b' },
    { value: 'both', label: 'Ambos', icon: 'nc-minimal-right', color: '#10b981' }
  ];

  constructor(
    public utilsService: UtilsService,
    public helpQuestionsService: HelpQuestionsService,
    public helpCategoriesService: HelpCategoriesService,
    public loadingService: LoadingService,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.loadCategories();
    this.loadQuestions();

    // Check if there's a category filter in URL params
    this.route.queryParams.subscribe(params => {
      if (params['category']) {
        this.selectedCategoryId = params['category'];
        this.filterQuestions();
      }
    });
  }

  /**
   * Load all categories
   */
  public loadCategories() {
    this.helpCategoriesService.getActiveHelpCategories().subscribe(categories => {
      this.arrayCategories = categories;
    });
  }

  /**
   * Load all questions
   */
  public loadQuestions() {
    this.helpQuestionsService.getHelpQuestions().subscribe(questions => {
      console.log(JSON.stringify(questions, null, 3));
      
      this.arrayQuestions = questions;
      this.filteredQuestions = questions;

      this.dataSource = new MatTableDataSource<HelpQuestion>(questions);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.loadingService.hide();
    });
  }

  /**
   * Filter questions by search term, category and user type
   */
  public filterQuestions() {
    const search = this.searchTerm.toLowerCase().trim();

    this.filteredQuestions = this.arrayQuestions.filter(question => {
      const matchesSearch = !search ||
        question.helpQuestionTitle?.toLowerCase().includes(search) ||
        question.helpQuestionDescription?.toLowerCase().includes(search) ||
        question.helpQuestionAnswer?.toLowerCase().includes(search) ||
        question.helpQuestionTags?.some(tag => tag.toLowerCase().includes(search));

      const matchesCategory = !this.selectedCategoryId ||
        question.helpQuestionCategoryId === this.selectedCategoryId;

      const matchesUserType = !this.selectedUserType ||
        question.helpQuestionTargetUserType === this.selectedUserType ||
        question.helpQuestionTargetUserType === 'both';

      return matchesSearch && matchesCategory && matchesUserType;
    });

    this.dataSource = new MatTableDataSource<HelpQuestion>(this.filteredQuestions);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  /**
   * Clear all filters
   */
  public clearFilters() {
    this.searchTerm = '';
    this.selectedCategoryId = '';
    this.selectedUserType = '';
    this.filterQuestions();
  }

  /**
   * Open modal to create new question
   */
  public newQuestion() {
    this.isEdit = false;
    this.helpQuestion = {};
    this.tags = [];

    // Get next order number
    if (this.selectedCategoryId) {
      this.helpQuestion.helpQuestionCategoryId = this.selectedCategoryId;
      this.loadNextOrder();
    }

    this.helpQuestion.helpQuestionId = new Date().getTime().toString();
    this.helpQuestion.helpQuestionCode = `HQ-${this.helpQuestion.helpQuestionId.substring(8)}`;
    this.helpQuestion.helpQuestionState = true;
    this.helpQuestion.helpQuestionIsPopular = false;
    this.helpQuestion.helpQuestionViews = 0;
    this.helpQuestion.helpQuestionTargetUserType = 'both';
    this.helpQuestion.helpQuestionTags = [];

    $('#modalHelpQuestion').modal('show');
  }

  /**
   * Load next order number for selected category
   */
  private loadNextOrder() {
    if (this.helpQuestion.helpQuestionCategoryId) {
      this.helpQuestionsService.getNextOrderByCategory(this.helpQuestion.helpQuestionCategoryId)
        .subscribe(nextOrder => {
          this.helpQuestion.helpQuestionOrder = nextOrder;
        });
    }
  }

  /**
   * Save or update question
   */
  public async saveQuestion(isValid: boolean, form: NgForm) {
    if (!isValid) {
      this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Por favor complete todos los campos requeridos', 'danger');
      return;
    }

    if (!this.helpQuestion.helpQuestionCategoryId) {
      this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Debe seleccionar una categoría', 'danger');
      return;
    }

    Swal.fire({
      title: "Espere por favor",
      html: "Estamos procesando la información",
      timerProgressBar: true,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Update tags
    this.helpQuestion.helpQuestionTags = this.tags;

    // Get category name
    const category = this.arrayCategories.find(cat => cat.helpCategoryId === this.helpQuestion.helpQuestionCategoryId);
    if (category) {
      this.helpQuestion.helpQuestionCategoryName = category.helpCategoryName;
    }

    try {
      if (this.isEdit) {
        this.helpQuestion.helpQuestionDateUpdate = this.utilsService.getDateCurrent();
        this.helpQuestion.helpQuestionTimeUpdate = this.utilsService.getTimeCurrent();

        await this.helpQuestionsService.editQuestion(this.helpQuestion);
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Pregunta actualizada correctamente', 'success');
      } else {
        this.helpQuestion.helpQuestionDateRegister = this.utilsService.getDateCurrent();
        this.helpQuestion.helpQuestionTimeRegister = this.utilsService.getTimeCurrent();

        await this.helpQuestionsService.saveQuestion(this.helpQuestion);
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Pregunta creada correctamente', 'success');
        form.resetForm();
      }

      $('#modalHelpQuestion').modal('hide');
      this.loadQuestions();
    } catch (error) {
      console.error('Error saving question:', error);
      this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Error al guardar la pregunta', 'danger');
    } finally {
      Swal.close();
    }
  }

  /**
   * Open modal to edit question
   */
  public editQuestion(question: HelpQuestion) {
    this.isEdit = true;
    this.helpQuestion = { ...question };
    this.tags = question.helpQuestionTags ? [...question.helpQuestionTags] : [];
    $('#modalHelpQuestion').modal('show');
  }

  /**
   * Delete question
   */
  public deleteQuestion(question: HelpQuestion) {
    Swal.fire({
      title: '¿Está seguro?',
      text: `¿Desea eliminar la pregunta "${question.helpQuestionTitle}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.helpQuestionsService.deleteQuestion(question.helpQuestionId)
          .then(() => {
            this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Pregunta eliminada correctamente', 'success');
            this.loadQuestions();
          })
          .catch(error => {
            console.error('Error deleting question:', error);
            this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Error al eliminar la pregunta', 'danger');
          });
      }
    });
  }

  /**
   * Cancel form and close modal
   */
  public cancelForm(form: NgForm) {
    form.resetForm();
    this.tags = [];
    $('#modalHelpQuestion').modal('hide');
  }

  /**
   * Handle status change
   */
  public onStatusChange(value: boolean, question: HelpQuestion) {
    question.helpQuestionState = value;
    this.helpQuestionsService.editQuestion(question)
      .then(() => {
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Estado actualizado correctamente', 'success');
      })
      .catch(error => {
        console.error('Error updating status:', error);
        this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar el estado', 'danger');
      });
  }

  /**
   * Handle popular status change
   */
  public onPopularChange(value: boolean, question: HelpQuestion) {
    question.helpQuestionIsPopular = value;
    this.helpQuestionsService.editQuestion(question)
      .then(() => {
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Estado popular actualizado correctamente', 'success');
      })
      .catch(error => {
        console.error('Error updating popular status:', error);
        this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar el estado popular', 'danger');
      });
  }

  /**
   * Add tag
   */
  public addTag(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();

    if (value) {
      this.tags.push(value);
    }

    // event.chipInput!.clear();
  }

  /**
   * Remove tag
   */
  public removeTag(tag: string): void {
    const index = this.tags.indexOf(tag);

    if (index >= 0) {
      this.tags.splice(index, 1);
    } 
  }

  /**
   * Get category name by ID
   */
  public getCategoryName(categoryId: string): string {
    const category = this.arrayCategories.find(cat => cat.helpCategoryId === categoryId);
    return category ? category.helpCategoryName : 'Sin categoría';
  }

  /**
   * Get user type label
   */
  public getUserTypeLabel(userType: string): any {
    return this.userTypes.find(type => type.value === userType) || this.userTypes[2];
  }

  /**
   * View question details (preview)
   */
  public viewQuestion(question: HelpQuestion) {
    Swal.fire({
      title: question.helpQuestionTitle,
      html: `
        <div style="text-align: left;">
          <p><strong>Descripción:</strong></p>
          <p>${question.helpQuestionDescription || 'Sin descripción'}</p>
          <hr>
          <p><strong>Respuesta:</strong></p>
          <p>${question.helpQuestionAnswer || 'Sin respuesta'}</p>
          <hr>
          <p><strong>Categoría:</strong> ${this.getCategoryName(question.helpQuestionCategoryId)}</p>
          <p><strong>Tipo de Usuario:</strong> ${this.getUserTypeLabel(question.helpQuestionTargetUserType).label}</p>
          <p><strong>Vistas:</strong> ${question.helpQuestionViews || 0}</p>
          ${question.helpQuestionTags && question.helpQuestionTags.length > 0 ?
            '<p><strong>Etiquetas:</strong> ' + question.helpQuestionTags.join(', ') + '</p>' : ''}
        </div>
      `,
      icon: 'info',
      width: 600,
      confirmButtonText: 'Cerrar'
    });
  }

  /**
   * Handle category change in form
   */
  public onCategoryChange() {
    this.loadNextOrder();
  }
}
