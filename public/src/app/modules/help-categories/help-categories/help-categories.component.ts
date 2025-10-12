import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { HelpCategoriesService } from 'app/services/help-categories/help-categories.service';
import { HelpQuestionsService } from 'app/services/help-questions/help-questions.service';
import { LoadingService } from 'app/services/loading/loading.service';
import { StorageService } from 'app/services/storage/storage.service';
import { UtilsService } from 'app/services/utils/utils.service';
import Swal from 'sweetalert2';
declare var $: any;

@Component({
  selector: 'app-help-categories',
  templateUrl: './help-categories.component.html',
  styleUrls: ['./help-categories.component.css']
})
export class HelpCategoriesComponent implements OnInit {

  // Search term
  public searchTerm: string = '';

  // DataTable configuration
  public dataSource: MatTableDataSource<HelpCategory>;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild("tablePaginator") paginator: MatPaginator;
  public displayedColumns: string[] = [
    "order",
    "icon",
    "name",
    "description",
    "totalQuestions",
    "status",
    "statusChange",
    "edit",
    "delete",
  ];

  // Data arrays
  public arrayCategories: Array<HelpCategory> = [];
  public filteredCategories: Array<HelpCategory> = [];

  // Form variables
  public isEdit: boolean = false;
  public helpCategory: HelpCategory = {};

  // Image upload
  public previewImage: any = null;
  public fileDataImage: File = null;

  // Color palette for categories
  public colorPalette: string[] = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'
  ];

  constructor(
    public utilsService: UtilsService,
    public helpCategoriesService: HelpCategoriesService,
    public helpQuestionsService: HelpQuestionsService,
    private storageService: StorageService,
    public loadingService: LoadingService,
  ) { }

  ngOnInit(): void {
    this.loadCategories();
  }

  /**
   * Load all help categories
   */
  public loadCategories() {
    // this.loadingService.show('Cargando categorías...');
    this.helpCategoriesService.getHelpCategories().subscribe(categories => {
      console.log(JSON.stringify(categories, null, 3));
      
      this.arrayCategories = categories;
      this.filteredCategories = categories;

      // Update question counts for each category
      this.updateQuestionCounts();
 
      this.dataSource = new MatTableDataSource<HelpCategory>(categories);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.loadingService.hide();
    });
  }

  /**
   * Update question counts for all categories
   */
  private updateQuestionCounts() {
    this.arrayCategories.forEach(category => { 
      this.helpQuestionsService.countQuestionsByCategory(category.helpCategoryId)
        .subscribe(count => {
          category.helpCategoryTotalQuestions = count;
        });
    });
  }

  /**
   * Filter categories by search term
   */
  public filterCategories() {
    const search = this.searchTerm.toLowerCase().trim();

    this.filteredCategories = this.arrayCategories.filter(category =>
      category.helpCategoryName?.toLowerCase().includes(search) ||
      category.helpCategoryDescription?.toLowerCase().includes(search)
    );

    this.dataSource = new MatTableDataSource<HelpCategory>(this.filteredCategories);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  /**
   * Open modal to create new category
   */
  public newCategory() {
    this.isEdit = false;
    this.helpCategory = {};
    this.previewImage = null;
    this.fileDataImage = null;

    // Get next order number
    this.helpCategoriesService.getNextOrder().subscribe(nextOrder => {
      this.helpCategory.helpCategoryId = new Date().getTime().toString();
      this.helpCategory.helpCategoryCode = `HC-${String(nextOrder).padStart(3, '0')}`;
      this.helpCategory.helpCategoryOrder = nextOrder;
      this.helpCategory.helpCategoryState = true;
      this.helpCategory.helpCategoryColor = this.colorPalette[Math.floor(Math.random() * this.colorPalette.length)];
      this.helpCategory.helpCategoryTotalQuestions = 0;
    });

    $('#modalHelpCategory').modal('show');
  }

  /**
   * Save or update help category
   */
  public async saveCategory(isValid: boolean, form: NgForm) {
    if (!isValid) {
      this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Por favor complete todos los campos requeridos', 'danger');
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

    // Upload icon if exists
    if (this.fileDataImage) {
      try {
        const url = await this.storageService.uploadFile(
          `helpCategories/category-${this.helpCategory.helpCategoryId}/icon-${this.helpCategory.helpCategoryId}.png`,
          this.fileDataImage
        );
        this.helpCategory.helpCategoryIcon = url;
      } catch (error) {
        console.error('Error uploading image:', error);
      }
    }

    try {
      if (this.isEdit) {
        this.helpCategory.helpCategoryDateUpdate = this.utilsService.getDateCurrent();
        this.helpCategory.helpCategoryTimeUpdate = this.utilsService.getTimeCurrent();

        await this.helpCategoriesService.editHelpCategory(this.helpCategory);
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría actualizada correctamente', 'success');
      } else {
        this.helpCategory.helpCategoryDateRegister = this.utilsService.getDateCurrent();
        this.helpCategory.helpCategoryTimeRegister = this.utilsService.getTimeCurrent();

        await this.helpCategoriesService.saveHelpCategory(this.helpCategory);
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría creada correctamente', 'success');
        form.resetForm();
      }

      $('#modalHelpCategory').modal('hide');
      this.loadCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Error al guardar la categoría', 'danger');
    } finally {
      Swal.close();
    }
  }

  /**
   * Open modal to edit category
   */
  public editCategory(category: HelpCategory) {
    this.isEdit = true;
    this.helpCategory = { ...category };
    this.previewImage = null;
    this.fileDataImage = null;
    $('#modalHelpCategory').modal('show');
  }

  /**
   * Delete help category
   */
  public deleteCategory(category: HelpCategory) {
    // Check if category has questions
    this.helpQuestionsService.countQuestionsByCategory(category.helpCategoryId)
      .subscribe(count => {
        if (count > 0) {
          Swal.fire({
            title: 'No se puede eliminar',
            html: `Esta categoría tiene <b>${count}</b> pregunta(s) asociada(s). Por favor, elimine las preguntas primero.`,
            icon: 'warning',
            confirmButtonText: 'Entendido'
          });
          return;
        }

        Swal.fire({
          title: '¿Está seguro?',
          text: `¿Desea eliminar la categoría "${category.helpCategoryName}"?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar'
        }).then((result) => {
          if (result.isConfirmed) {
            this.helpCategoriesService.deleteHelpCategory(category.helpCategoryId)
              .then(() => {
                this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Categoría eliminada correctamente', 'success');
                this.loadCategories();
              })
              .catch(error => {
                console.error('Error deleting category:', error);
                this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Error al eliminar la categoría', 'danger');
              });
          }
        });
      });
  }

  /**
   * Cancel form and close modal
   */
  public cancelForm(form: NgForm) {
    form.resetForm();
    this.previewImage = null;
    this.fileDataImage = null;
    $('#modalHelpCategory').modal('hide');
  }

  /**
   * Handle status change
   */
  public onStatusChange(value: boolean, category: HelpCategory) {
    category.helpCategoryState = value;
    this.helpCategoriesService.editHelpCategory(category)
      .then(() => {
        this.utilsService.showNotification('top', 'right', 'nc-check-2', 'Estado actualizado correctamente', 'success');
      })
      .catch(error => {
        console.error('Error updating status:', error);
        this.utilsService.showNotification('top', 'right', 'nc-simple-remove', 'Error al actualizar el estado', 'danger');
      });
  }

  /**
   * Handle file selection for icon
   */
  public fileProgress(fileInput: any) {
    this.fileDataImage = (<File>fileInput.target.files[0]);
    this.previewUrlImage();
  }

  /**
   * Preview selected image
   */
  private previewUrlImage() {
    let mimeType = this.fileDataImage.type;
    if (mimeType.match(/image\/*/) == null) {
      return;
    }
    let reader = new FileReader();
    reader.readAsDataURL(this.fileDataImage);
    reader.onload = (_event) => {
      this.previewImage = reader.result;
    }
  }

  /**
   * View questions for a category
   */
  public viewQuestions(category: HelpCategory) {
    // Navigate to questions module with category filter
    // This will be implemented in the routing
    window.location.href = `#/help-questions?category=${category.helpCategoryId}`;
  }
}
