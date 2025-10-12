import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class HelpCategoriesService {

  constructor(
    private db: AngularFirestore
  ) { }

  /**
   * Obtener todas las categorías de ayuda
   */
  public getHelpCategories(): Observable<HelpCategory[]> {
    return this.db.collection<HelpCategory>('helpCategories', ref =>
      ref.orderBy('helpCategoryOrder', 'asc')
    ).valueChanges();
  }

  /**
   * Obtener categorías de ayuda activas
   */
  public getActiveHelpCategories(): Observable<HelpCategory[]> {
    return this.db.collection<HelpCategory>('helpCategories', ref =>
      ref.where('helpCategoryState', '==', true)
         .orderBy('helpCategoryOrder', 'asc')
    ).valueChanges();
  }

  /**
   * Obtener una categoría por ID
   */
  public getHelpCategoryById(id: string): Observable<HelpCategory> {
    return this.db.collection<HelpCategory>('helpCategories')
      .doc(id)
      .valueChanges();
  }

  /**
   * Guardar nueva categoría de ayuda
   */
  public saveHelpCategory(category: HelpCategory): Promise<void> {
    return this.db.collection('helpCategories').doc(category.helpCategoryId).set(category);
  }

  /**
   * Editar categoría de ayuda
   */
  public editHelpCategory(category: HelpCategory): Promise<void> {
    return this.db.collection('helpCategories').doc(category.helpCategoryId).update(category);
  }

  /**
   * Eliminar categoría de ayuda
   */
  public deleteHelpCategory(categoryId: string): Promise<void> {
    return this.db.collection('helpCategories').doc(categoryId).delete();
  }

  /**
   * Actualizar el contador de preguntas en una categoría
   */
  public updateQuestionCount(categoryId: string, count: number): Promise<void> {
    return this.db.collection('helpCategories').doc(categoryId).update({
      helpCategoryTotalQuestions: count
    });
  }

  /**
   * Obtener el siguiente número de orden disponible
   */
  public getNextOrder(): Observable<number> {
    return this.db.collection<HelpCategory>('helpCategories', ref =>
      ref.orderBy('helpCategoryOrder', 'desc').limit(1)
    ).valueChanges().pipe(
      map(categories => {
        if (categories && categories.length > 0) {
          return (categories[0].helpCategoryOrder || 0) + 1;
        }
        return 1;
      })
    );
  }
}
